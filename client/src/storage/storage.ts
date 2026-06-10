import AsyncStorage from "@react-native-async-storage/async-storage";
import { Task, FocusSession, Operation, RewardState } from "../types";

/**
 * Namespaced AsyncStorage wrapper
 * ────────────────────────────────────────────────────────────────────────────
 * All keys are prefixed with the deviceId so two browser tabs (device-a and
 * device-b) can coexist in the same browser's localStorage without collision.
 *
 * Example:
 *   deviceId = "device-a"
 *   key "tasks" → stored as "device-a:tasks"
 */

function key(deviceId: string, name: string): string {
  return `${deviceId}:${name}`;
}

// ── Tasks ──────────────────────────────────────────────────────────────────

export async function saveTasks(deviceId: string, tasks: Task[]): Promise<void> {
  await AsyncStorage.setItem(key(deviceId, "tasks"), JSON.stringify(tasks));
}

export async function loadTasks(deviceId: string): Promise<Task[]> {
  const raw = await AsyncStorage.getItem(key(deviceId, "tasks"));
  return raw ? JSON.parse(raw) : [];
}

// ── Pending Operations Queue ───────────────────────────────────────────────

export async function savePendingOps(deviceId: string, ops: Operation[]): Promise<void> {
  await AsyncStorage.setItem(key(deviceId, "pendingOps"), JSON.stringify(ops));
}

export async function loadPendingOps(deviceId: string): Promise<Operation[]> {
  const raw = await AsyncStorage.getItem(key(deviceId, "pendingOps"));
  return raw ? JSON.parse(raw) : [];
}

// ── Lamport Clock ──────────────────────────────────────────────────────────

export async function saveLamport(deviceId: string, lamport: number): Promise<void> {
  await AsyncStorage.setItem(key(deviceId, "lamport"), String(lamport));
}

export async function loadLamport(deviceId: string): Promise<number> {
  const raw = await AsyncStorage.getItem(key(deviceId, "lamport"));
  return raw ? parseInt(raw, 10) : 0;
}

// ── Last Seen Lamport (for sync delta) ────────────────────────────────────

export async function saveLastSeenLamport(deviceId: string, lamport: number): Promise<void> {
  await AsyncStorage.setItem(key(deviceId, "lastSeenLamport"), String(lamport));
}

export async function loadLastSeenLamport(deviceId: string): Promise<number> {
  const raw = await AsyncStorage.getItem(key(deviceId, "lastSeenLamport"));
  return raw ? parseInt(raw, 10) : 0;
}

// ── Focus Sessions ─────────────────────────────────────────────────────────

export async function saveSessions(deviceId: string, sessions: FocusSession[]): Promise<void> {
  await AsyncStorage.setItem(key(deviceId, "sessions"), JSON.stringify(sessions));
}

export async function loadSessions(deviceId: string): Promise<FocusSession[]> {
  const raw = await AsyncStorage.getItem(key(deviceId, "sessions"));
  return raw ? JSON.parse(raw) : [];
}

// ── Reward State ───────────────────────────────────────────────────────────

export async function saveRewards(deviceId: string, rewards: RewardState): Promise<void> {
  await AsyncStorage.setItem(key(deviceId, "rewards"), JSON.stringify(rewards));
}

export async function loadRewards(deviceId: string): Promise<RewardState | null> {
  const raw = await AsyncStorage.getItem(key(deviceId, "rewards"));
  return raw ? JSON.parse(raw) : null;
}

// ── Conflict Events ────────────────────────────────────────────────────────
// Stored with deviceId prefix

export async function saveConflictEvents(deviceId: string, events: any[]): Promise<void> {
  await AsyncStorage.setItem(key(deviceId, "conflictEvents"), JSON.stringify(events));
}

export async function loadConflictEvents(deviceId: string): Promise<any[]> {
  const raw = await AsyncStorage.getItem(key(deviceId, "conflictEvents"));
  return raw ? JSON.parse(raw) : [];
}

// ── Device ID ──────────────────────────────────────────────────────────────
// Stored without namespace prefix — it IS the namespace

export async function saveDeviceId(deviceId: string): Promise<void> {
  await AsyncStorage.setItem("currentDeviceId", deviceId);
}

export async function loadDeviceId(): Promise<string | null> {
  return AsyncStorage.getItem("currentDeviceId");
}

// ── Full clear (for dev panel reset) ──────────────────────────────────────

export async function clearDeviceStorage(deviceId: string): Promise<void> {
  const keysToDelete = [
    "tasks", "pendingOps", "lamport", "lastSeenLamport", "sessions", "rewards", "conflictEvents",
  ].map((k) => key(deviceId, k));

  await AsyncStorage.multiRemove(keysToDelete);
}
