/**
 * Lamport Clock Utilities
 * ────────────────────────────────────────────────────────────────────────────
 *
 * A Lamport clock is a logical counter that provides a partial causal ordering
 * of events across distributed systems without relying on wall-clock time.
 *
 * Rules:
 *   1. Increment before every local event: lamport++
 *   2. On receive: lamport = max(local, incoming) + 1
 *   3. The resulting value is attached to the message/event
 *
 * Why this beats wall-clock time:
 *   - Device clocks can be wrong, skewed, or deliberately set
 *   - Two ops at lamport=10 and lamport=12 means 12 happened AFTER 10
 *     (or at least was created knowing about 10, even if clock drifted)
 *   - Tie-breaking by deviceId makes it fully deterministic
 */

export function incrementLamport(current: number): number {
  return current + 1;
}

export function receiveLamport(local: number, incoming: number): number {
  return Math.max(local, incoming) + 1;
}
