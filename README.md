# Alcovia — Offline-First Study App


A full-stack offline-first study app built for the Alcovia engineering intern take-home. Features focus sessions with rewards, syllabus task tracking, multi-device sync with Lamport clock conflict resolution, and an n8n automation layer.

---

## Architecture

```
┌─────────────────────┐     ┌─────────────────────┐
│  Expo Web Tab A     │     │  Expo Web Tab B      │
│  deviceId=device-a  │     │  deviceId=device-b   │
│  AsyncStorage       │     │  AsyncStorage        │
│   prefix "dA:"      │     │   prefix "dB:"       │
│  Zustand store      │     │  Zustand store       │
│  Lamport clock      │     │  Lamport clock       │
│  Pending ops queue  │     │  Pending ops queue   │
└────────┬────────────┘     └──────────┬───────────┘
         │  POST /sync                 │
         └──────────┬──────────────────┘
                    ▼
         ┌─────────────────────┐
         │  Express + SQLite   │
         │                     │
         │  operations table   │  ← append-only log
         │  tasks table        │  ← authoritative state
         │  focus_sessions     │
         │  processed_rewards  │  ← exactly-once rewards
         │  n8n_events         │  ← exactly-once n8n
         └──────────┬──────────┘
                    │ POST webhook
                    ▼
         ┌─────────────────────┐
         │  n8n                │
         │  Check eventId      │  ← dedup in static data
         │  IF duplicate → skip│
         │  Send notification  │
         │  Store eventId      │
         └─────────────────────┘
                    │
                    ▼
         POST /notifications (mock sink)
```

---

## Quick Start

### Prerequisites
- Node.js ≥ 18
- npm

### 1. Clone and navigate
```bash
git clone <repo-url>
cd Alcovia
```

### 2. Start the backend server
```bash
cd server
npm install
npm run dev
# Server runs on http://localhost:3001
```

### 3. Start the client
```bash
cd client
npm install --legacy-peer-deps
npx expo start --web
# Opens http://localhost:8081
```

### 4. Simulate two devices
Open **two browser tabs** with device parameters:
- Tab A: `http://localhost:8081/?device=device-a`
- Tab B: `http://localhost:8081/?device=device-b`

Each tab automatically initializes as that device and gets its own isolated AsyncStorage namespace, simulating two real devices. You can also switch devices dynamically in the **Dev Panel** tab.

### 5. Start n8n (optional — for full notification demo)
```bash
npx n8n
# Opens http://localhost:5678
```
Import `n8n-workflow.json` via Settings → Import Workflow. Activate the workflow.

---

## Demo Scenario (conflict + idempotency)

1. Open Tab A (`device-a`) and Tab B (`device-b`)
2. Both start **online** — tasks load from server
3. **Go offline** on both tabs (Dev Panel → toggle)
4. On Tab A: mark "Linear equations" → **DONE** (lamport=5)
5. On Tab B: mark "Linear equations" → **IN_PROGRESS** (lamport=3)
6. On Tab A: complete a **25-min focus session** (tap Skip in dev)
7. On Tab B: complete a **different 25-min focus session** (tap Skip in dev)
8. **Reconnect Tab A** → Force Sync → watch sync log
9. **Reconnect Tab B** → Force Sync → watch sync log
10. **Result**:
    - Both tabs show "Linear equations" → **DONE** (Tab A's op wins, higher lamport=5)
    - Coins increased by **50 only** (each session is independent, both rewarded)
    - n8n notification fired **twice** (once per session, zero duplicates)
    - Dev Panel shows conflict event logged

---

## Conflict Cases Handled

| Scenario | Resolution |
|---|---|
| Same task status changed on both devices | Higher Lamport wins; tie → higher deviceId (lexicographic) |
| Task deleted on one, edited on other | Delete always wins (tombstone semantic) |
| Same sync message sent twice | opId already in `operations` table → skip (idempotent) |
| Focus session synced from both devices | `processed_rewards` table prevents double-reward |
| n8n webhook called twice for same session | n8n `processedEventIds` static data + server `n8n_events` table |
| Out-of-order ops (FOCUS_SUCCESS before FOCUS_SESSION_STARTED) | Server upserts session on first seen terminal op |

---

## API Endpoints

| Method | Path | Description |
|---|---|---|
| POST | `/sync` | Main sync endpoint — receives ops, returns delta |
| GET | `/sync/state/:studentId` | Full server state (dev panel) |
| POST | `/notifications` | Mock notification sink (logs payload) |
| GET | `/subjects` | Static subjects + chapters |
| GET | `/health` | Health check |

---

## What I Left Out / Would Do Next

- **Real-time push**: Currently polling every 5s. Would replace with WebSocket or SSE for instant cross-device updates.
- **App restart persistence**: Sessions survive restart (stored in AsyncStorage), but an active running timer resets on reload. Would persist `startedAt` + `elapsed` and resume on mount.
- **3+ devices**: The sync protocol supports N devices out of the box — the operation log is per-student, not per-pair. Just open more tabs.
- **Real WhatsApp**: Swap the mock `POST /notifications` for Twilio/AiSensy API call in n8n.
- **Property tests**: Would use `fast-check` to fuzz random op sequences and verify convergence.
- **Network partition mid-sync**: Currently if sync fails halfway, pending ops remain queued and retry next poll. Full idempotency means this is safe, but a more explicit "ack" per batch would be cleaner.
- **Efficient sync**: Currently exchanges ops since `lastSeenLamport`. Could add vector clocks for true causal delta sync.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Client | React Native Expo (web mode) |
| State | Zustand |
| Client storage | AsyncStorage (namespaced per device) |
| Client sync | Custom operation log + Lamport clocks |
| Server | Express (TypeScript) |
| Server DB | SQLite via `sqlite3` + `sqlite` promise wrapper |
| Automation | n8n (self-hosted via `npx n8n`) |
| Notifications | Mock HTTP sink (`POST /notifications`) |
