# DECISIONS.md — Alcovia Sync Architecture

## 1. Data / Sync Model

### Why an Operation Log, Not State Snapshots

The naive sync approach would be: "send my whole state, server picks the latest timestamp." This breaks immediately with two offline devices. If Device A marks a task DONE at 10:00 and Device B marks the same task IN_PROGRESS at 10:01 (but B's clock is 2 minutes ahead), the DONE update gets permanently lost with last-write-wins by wall clock.

Instead, every change becomes a small, typed **operation** (not a state snapshot):

```
{
  opId: "uuid",         // globally unique — idempotency key
  deviceId: "device-a", // who made this change
  lamport: 15,          // logical ordering
  type: "TASK_STATUS_CHANGED",
  entityId: "task-001",
  payload: { status: "DONE" }
}
```

The server keeps an **append-only log** of all operations. On sync, devices exchange operations they haven't seen. The authoritative state is rebuilt by replaying ops in lamport order with conflict rules applied.

### Why Lamport Clocks, Not Wall Clocks

Lamport clocks are logical counters that track causality, not time:

- **Increment** before every local event: `lamport++`
- **Receive** an incoming op: `lamport = max(local, incoming) + 1`

Key property: if op B was created knowing about op A (i.e., on the same device after A, or after receiving A), then `B.lamport > A.lamport`. This gives us **causal ordering** without trusting device clocks.

**Tradeoff:** Lamport clocks do NOT preserve real-world ordering across independent devices. Two concurrent ops on different devices may get arbitrary lamport values. We handle this by applying a deterministic tie-breaker (deviceId lexicographic order) so all devices converge to the same choice. The choice might not be the "right" one (the user intended DONE, but IN_PROGRESS won), but it is **identical on all devices** — which is the correctness property we need.

---

## 2. Conflict Resolution Strategy

### How Two Devices Always End Up Identical

Every device and the server apply the **exact same rules** in the **exact same order** for every operation:

#### Rule 1: Same task status changed on both devices
```
Winner = higher lamport
Tie-break = higher deviceId (lexicographic: "device-b" > "device-a")
```

Both devices receive all ops via sync. Both apply the same rule. Both end up with the same status. ✓

#### Rule 2: Task deleted on one device, edited on another
```
DELETE always wins, regardless of lamport
```

Rationale: A deletion is a terminal, intentional act. It would be more surprising to see a "resurrected" task (deleted on one device, edited on another, edit wins) than to lose an edit. This matches user mental model.

Implementation: The server checks `existing.deleted` before applying any status update. If the task is already deleted, status changes are silently ignored.

#### Rule 3: Out-of-order ops
```
If TASK_STATUS_CHANGED arrives before TASK_CREATED: create the task with that status
If FOCUS_SUCCESS arrives before FOCUS_SESSION_STARTED: upsert the session as SUCCESS
```

Operations can arrive in any order during sync (device goes offline after starting a session, comes back much later). We handle this by treating the operation log as the source of truth and always doing upserts, not inserts.

#### Rule 4: Same op received twice (network retry, double-send)
```
opId already in operations table → skip (return early)
```

The `opId` is a UUID generated once on the device. No matter how many times a device sends the same op (retry on failure, reconnect, replayed sync), the server only processes it once.

---

## 3. Idempotency

### Reward Idempotency (Server)

The `processed_rewards` table is the idempotency record for focus session rewards:

```sql
CREATE TABLE processed_rewards (
  sessionId TEXT PRIMARY KEY,  -- exact session UUID
  coins     INTEGER NOT NULL,
  streak    INTEGER NOT NULL
);
```

Before awarding any coins or updating streak:
1. Query `processed_rewards` for `sessionId`
2. If found → return immediately, no changes
3. If not found → compute new reward, `BEGIN` transaction, `UPDATE reward_state`, `INSERT processed_rewards`, `COMMIT`

This guarantees **exactly-once reward** even if:
- The same session op arrives from both Device A and Device B
- The server crashes between applying the op and processing the reward
- The client retries the sync 10 times

### n8n Notification Idempotency (Two layers)

**Layer 1 — Server (`n8n_events` table)**:
Before firing the n8n webhook, the server checks `n8n_events` for the `eventId` (= sessionId). If found → skip. The INSERT happens **before** the HTTP call — so if n8n is down, we still record it and won't retry infinitely.

**Layer 2 — n8n (`processedEventIds` in Static Data)**:
Inside the n8n workflow, a Function node checks a persistent `processedEventIds` map stored in n8n's Static Workflow Data. If the `eventId` is already there → the IF node routes to "Respond (duplicate)" and skips the notification.

This two-layer approach means:
- Even if the server is restarted and the `n8n_events` table is lost (e.g., a different server instance), n8n itself won't fire twice
- Even if n8n is restarted (losing its Static Data), the server won't call it again

In production, I'd persist eventIds in a real database on both sides.

---

## 4. Why This Architecture Converges

**Claim**: Any two devices that start with the same initial state, apply any sequence of offline operations, and then sync with the server, will end up in identical state.

**Proof sketch**:
1. All operations are stored in the server's `operations` table with their lamport values
2. On sync, each device receives all ops it hasn't seen (lamport > lastSeenLamport)
3. Each device applies the same deterministic conflict rules to the same set of ops
4. Since the rules are pure functions of (existing state + incoming op) with no randomness, all devices compute the same result
5. The server's entity tables are the authoritative result of applying all ops in lamport order

The key insight: convergence doesn't require devices to talk to each other. They only need to both talk to the server. The server is the single canonical log.

---

## 5. One Tradeoff I Made

**Lamport clocks don't preserve real-world causal order across independent devices.**

If Device A marks a task DONE at 3:00 PM real time and Device B marks it IN_PROGRESS at 3:01 PM real time (both offline), but Device B happened to have a lower Lamport counter (say 3 vs 5 for Device A), Device A's DONE op wins — even though Device B's op was "later" in real time.

**Why I chose this anyway**: Convergence (all devices reaching the same state) matters infinitely more than chronological accuracy for this use case. A student in the metro who marks a task DONE and then their laptop marks it IN_PROGRESS will see the discrepancy on next sync — they can manually correct it. What they cannot tolerate is Device A showing DONE and Device B showing IN_PROGRESS indefinitely with no resolution.

**What I'd do with more time**: Vector clocks (one counter per device) give stronger causality guarantees. They can detect *actual* concurrent modifications (no device knew about the other's change) vs. sequential ones (one device had seen the other's change). This would allow surfacing "genuine" conflicts to the user for manual resolution, rather than silently auto-resolving all of them.

---

## 6. Summary Table

| Decision | Choice | Why |
|---|---|---|
| Sync protocol | Operation log + delta sync | Preserves all intent; idempotent by construction |
| Clock | Lamport logical clock | No wall-clock dependency; deterministic ordering |
| Conflict rule | Higher lamport wins | Follows causal ordering |
| Delete vs edit | Delete always wins | Terminal intent; avoids zombie tasks |
| Reward idempotency | `processed_rewards` table + DB transaction | Atomic; survives retries and replays |
| n8n idempotency | Static Data eventId map + server `n8n_events` | Two-layer defense; survives restarts |
| Storage (server) | SQLite | Simplest durable store; WAL mode for concurrency |
| Storage (client) | AsyncStorage (namespaced) | Works in Expo Web; survives page reload |
| Two-device sim | URL param `?device=X` + sessionStorage | No separate browser profiles needed |
