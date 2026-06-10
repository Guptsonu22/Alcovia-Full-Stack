import { create } from "zustand";
import { v4 as uuidv4 } from "uuid";
import { Platform } from "react-native";
import {
  Task, TaskStatus, FocusSession, Operation, RewardState,
  Subject, Chapter, SyncLogEntry, ConflictEvent
} from "../types";
import {
  saveTasks, loadTasks, savePendingOps, loadPendingOps,
  saveLamport, loadLamport, saveSessions, loadSessions,
  saveRewards, loadRewards, saveLastSeenLamport, loadLastSeenLamport,
  saveConflictEvents, loadConflictEvents
} from "../storage/storage";
import { incrementLamport, receiveLamport } from "../sync/lamport";
import { INITIAL_SUBJECTS, INITIAL_CHAPTERS, INITIAL_TASKS } from "../data/seed";

const STUDENT_ID = "student-001";
const SERVER_URL = "http://localhost:3001";

function getInitialDeviceId(): string {
  if (Platform.OS !== "web") {
    return "device-a";
  }
  if (typeof window !== "undefined") {
    if (window.location) {
      const params = new URLSearchParams(window.location.search);
      const urlDevice = params.get("device");
      if (urlDevice && ["device-a", "device-b", "device-c"].includes(urlDevice)) {
        if (window.sessionStorage) {
          window.sessionStorage.setItem("alcovia:device", urlDevice);
        }
        return urlDevice;
      }
    }
    if (window.sessionStorage) {
      const sessionDevice = window.sessionStorage.getItem("alcovia:device");
      if (sessionDevice && ["device-a", "device-b", "device-c"].includes(sessionDevice)) {
        return sessionDevice;
      }
    }
  }
  return "";
}


// ── Store ──────────────────────────────────────────────────────────────────

interface AppState {
  // Identity
  deviceId: string;
  studentId: string;

  // Data
  tasks: Task[];
  sessions: FocusSession[];
  rewards: RewardState;
  subjects: Subject[];
  chapters: Chapter[];

  // Active focus session (only one at a time)
  activeSession: FocusSession | null;

  // Sync state
  lamport: number;
  lastSeenLamport: number;
  pendingOps: Operation[];
  isOnline: boolean;
  isSyncing: boolean;
  lastSyncAt: string | null;
  syncLog: SyncLogEntry[];
  conflictEvents: ConflictEvent[];

  // Actions — identity
  setDeviceId: (id: string) => Promise<void>;

  // Actions — tasks
  changeTaskStatus: (taskId: string, status: TaskStatus) => Promise<void>;
  deleteTask: (taskId: string) => Promise<void>;

  // Actions — focus sessions
  startSession: (targetMinutes: number) => Promise<FocusSession>;
  succeedSession: (sessionId: string, elapsedSeconds: number) => Promise<void>;
  failSession: (sessionId: string, reason: "give_up" | "app_switch") => Promise<void>;
  setActiveSession: (session: FocusSession | null) => void;

  // Actions — connectivity
  setOnline: (online: boolean) => void;

  // Actions — sync
  sync: () => Promise<void>;

  // Actions — bootstrap
  init: (deviceId: string) => Promise<void>;

  // Derived helpers
  addSyncLog: (message: string, type: SyncLogEntry["type"]) => void;
  clearSyncLog: () => void;
  clearConflictEvents: () => Promise<void>;
}

export const useAppStore = create<AppState>((set, get) => ({
  deviceId: getInitialDeviceId(),
  studentId: STUDENT_ID,
  tasks: [],
  sessions: [],
  rewards: {
    studentId: STUDENT_ID,
    coins: 0,
    streak: 0,
    lastFocusDate: "",
    todayFocusMinutes: 0,
  },
  subjects: [],
  chapters: [],
  activeSession: null,
  lamport: 0,
  lastSeenLamport: 0,
  pendingOps: [],
  isOnline: true,
  isSyncing: false,
  lastSyncAt: null,
  syncLog: [],
  conflictEvents: [],

  // ── Identity ─────────────────────────────────────────────────────────────

  setDeviceId: async (id: string) => {
    if (typeof window !== "undefined" && window.sessionStorage) {
      window.sessionStorage.setItem("alcovia:device", id);
    }
    set({ deviceId: id });
    await get().init(id);
  },

  // ── Init ─────────────────────────────────────────────────────────────────

  init: async (deviceId: string) => {
    const [tasks, sessions, pendingOps, lamport, lastSeenLamport, rewards, conflictEvents] = await Promise.all([
      loadTasks(deviceId),
      loadSessions(deviceId),
      loadPendingOps(deviceId),
      loadLamport(deviceId),
      loadLastSeenLamport(deviceId),
      loadRewards(deviceId),
      loadConflictEvents(deviceId),
    ]);

    let finalTasks = tasks;
    if (tasks.length === 0) {
      finalTasks = INITIAL_TASKS;
      await saveTasks(deviceId, INITIAL_TASKS);
    }

    // Fetch subjects/chapters from server (static, no auth)
    let subjects: Subject[] = [];
    let chapters: Chapter[] = [];
    try {
      const res = await fetch(`${SERVER_URL}/subjects`);
      const data = await res.json() as { subjects: Subject[]; chapters: Chapter[] };
      subjects = data.subjects;
      chapters = data.chapters;
    } catch {
      // Server not reachable — OK, will use cached data
    }

    if (subjects.length === 0) {
      subjects = INITIAL_SUBJECTS;
    }
    if (chapters.length === 0) {
      chapters = INITIAL_CHAPTERS;
    }

    set({
      deviceId,
      tasks: finalTasks,
      sessions,
      pendingOps,
      lamport,
      lastSeenLamport,
      rewards: rewards ?? {
        studentId: STUDENT_ID,
        coins: 0,
        streak: 0,
        lastFocusDate: "",
        todayFocusMinutes: 0,
      },
      subjects,
      chapters,
      conflictEvents: conflictEvents || [],
    });

    get().addSyncLog(`Loaded ${finalTasks.length} tasks, ${pendingOps.length} pending ops`, "info");
  },

  // ── Helpers ───────────────────────────────────────────────────────────────

  addSyncLog: (message, type) => {
    const entry: SyncLogEntry = {
      id: uuidv4(),
      timestamp: new Date().toISOString(),
      message,
      type,
    };
    set((s) => ({
      syncLog: [entry, ...s.syncLog].slice(0, 50),
    }));
  },

  clearSyncLog: () => set({ syncLog: [] }),

  clearConflictEvents: async () => {
    const devId = get().deviceId;
    set({ conflictEvents: [] });
    await saveConflictEvents(devId, []);
  },

  // ── Tasks ─────────────────────────────────────────────────────────────────

  changeTaskStatus: async (taskId: string, status: TaskStatus) => {
    const state = get();
    const task = state.tasks.find((t) => t.id === taskId);
    if (!task || task.deleted) return;

    // Optimistic local update
    const newLamport = incrementLamport(state.lamport);
    const updatedTasks = state.tasks.map((t) =>
      t.id === taskId ? { ...t, status, lamport: newLamport, deviceId: state.deviceId } : t
    );

    const op: Operation = {
      opId: uuidv4(),
      deviceId: state.deviceId,
      studentId: state.studentId,
      lamport: newLamport,
      type: "TASK_STATUS_CHANGED",
      entityId: taskId,
      payload: {
        status,
        subjectId: task.subjectId,
        chapterId: task.chapterId,
        title: task.title,
      },
      createdAt: new Date().toISOString(),
    };

    const newPending = [...state.pendingOps, op];
    set({ tasks: updatedTasks, lamport: newLamport, pendingOps: newPending });

    await Promise.all([
      saveTasks(state.deviceId, updatedTasks),
      saveLamport(state.deviceId, newLamport),
      savePendingOps(state.deviceId, newPending),
    ]);

    state.addSyncLog(
      `Task "${task.title}" → ${status} (lamport=${newLamport})`,
      "info"
    );

    // Auto-sync if online
    if (state.isOnline) {
      setTimeout(() => get().sync(), 100);
    }
  },

  deleteTask: async (taskId: string) => {
    const state = get();
    const task = state.tasks.find((t) => t.id === taskId);
    if (!task) return;

    const newLamport = incrementLamport(state.lamport);
    const updatedTasks = state.tasks.map((t) =>
      t.id === taskId ? { ...t, deleted: true, lamport: newLamport, deviceId: state.deviceId } : t
    );

    const op: Operation = {
      opId: uuidv4(),
      deviceId: state.deviceId,
      studentId: state.studentId,
      lamport: newLamport,
      type: "TASK_DELETED",
      entityId: taskId,
      payload: {},
      createdAt: new Date().toISOString(),
    };

    const newPending = [...state.pendingOps, op];
    set({ tasks: updatedTasks, lamport: newLamport, pendingOps: newPending });

    await Promise.all([
      saveTasks(state.deviceId, updatedTasks),
      saveLamport(state.deviceId, newLamport),
      savePendingOps(state.deviceId, newPending),
    ]);

    state.addSyncLog(`Task "${task.title}" deleted (lamport=${newLamport})`, "warning");
    if (state.isOnline) setTimeout(() => get().sync(), 100);
  },

  // ── Focus Sessions ─────────────────────────────────────────────────────────

  startSession: async (targetMinutes: number) => {
    const state = get();
    const sessionId = uuidv4();
    const startedAt = new Date().toISOString();
    const newLamport = incrementLamport(state.lamport);

    const session: FocusSession = {
      id: sessionId,
      studentId: state.studentId,
      deviceId: state.deviceId,
      targetMinutes,
      startedAt,
      status: "RUNNING",
      elapsedSeconds: 0,
      rewarded: false,
    };

    const op: Operation = {
      opId: uuidv4(),
      deviceId: state.deviceId,
      studentId: state.studentId,
      lamport: newLamport,
      type: "FOCUS_SESSION_STARTED",
      entityId: sessionId,
      payload: { targetMinutes, startedAt },
      createdAt: startedAt,
    };

    const newSessions = [session, ...state.sessions];
    const newPending = [...state.pendingOps, op];

    set({
      sessions: newSessions,
      activeSession: session,
      lamport: newLamport,
      pendingOps: newPending,
    });

    await Promise.all([
      saveSessions(state.deviceId, newSessions),
      saveLamport(state.deviceId, newLamport),
      savePendingOps(state.deviceId, newPending),
    ]);

    state.addSyncLog(`Focus session started: ${targetMinutes}min (lamport=${newLamport})`, "info");
    return session;
  },

  succeedSession: async (sessionId: string, elapsedSeconds: number) => {
    const state = get();
    const completedAt = new Date().toISOString();
    const newLamport = incrementLamport(state.lamport);

    const updatedSessions = state.sessions.map((s) =>
      s.id === sessionId
        ? { ...s, status: "SUCCESS" as const, completedAt, elapsedSeconds }
        : s
    );

    const session = state.sessions.find((s) => s.id === sessionId);

    const op: Operation = {
      opId: uuidv4(),
      deviceId: state.deviceId,
      studentId: state.studentId,
      lamport: newLamport,
      type: "FOCUS_SUCCESS",
      entityId: sessionId,
      payload: {
        targetMinutes: session?.targetMinutes ?? 25,
        startedAt: session?.startedAt ?? state.sessions[0]?.startedAt ?? completedAt,
        completedAt,
        elapsedSeconds,
      },
      createdAt: completedAt,
    };

    const newPending = [...state.pendingOps, op];
    set({ sessions: updatedSessions, activeSession: null, lamport: newLamport, pendingOps: newPending });

    await Promise.all([
      saveSessions(state.deviceId, updatedSessions),
      saveLamport(state.deviceId, newLamport),
      savePendingOps(state.deviceId, newPending),
    ]);

    state.addSyncLog(
      `Session SUCCESS! ${Math.floor(elapsedSeconds / 60)}min (lamport=${newLamport})`,
      "success"
    );

    if (state.isOnline) setTimeout(() => get().sync(), 100);
  },

  failSession: async (sessionId: string, reason: "give_up" | "app_switch") => {
    const state = get();
    const completedAt = new Date().toISOString();
    const newLamport = incrementLamport(state.lamport);

    const session = state.sessions.find((s) => s.id === sessionId);
    const elapsedSeconds = session?.elapsedSeconds ?? 0;

    const updatedSessions = state.sessions.map((s) =>
      s.id === sessionId
        ? { ...s, status: "FAILED" as const, completedAt, failReason: reason }
        : s
    );

    const op: Operation = {
      opId: uuidv4(),
      deviceId: state.deviceId,
      studentId: state.studentId,
      lamport: newLamport,
      type: "FOCUS_FAIL",
      entityId: sessionId,
      payload: {
        targetMinutes: session?.targetMinutes ?? 25,
        startedAt: session?.startedAt ?? completedAt,
        completedAt,
        elapsedSeconds,
        failReason: reason,
      },
      createdAt: completedAt,
    };

    const newPending = [...state.pendingOps, op];
    set({ sessions: updatedSessions, activeSession: null, lamport: newLamport, pendingOps: newPending });

    await Promise.all([
      saveSessions(state.deviceId, updatedSessions),
      saveLamport(state.deviceId, newLamport),
      savePendingOps(state.deviceId, newPending),
    ]);

    state.addSyncLog(`Session FAILED: ${reason} (lamport=${newLamport})`, "warning");
    if (state.isOnline) setTimeout(() => get().sync(), 100);
  },

  setActiveSession: (session) => set({ activeSession: session }),

  // ── Online/Offline ─────────────────────────────────────────────────────────

  setOnline: (online: boolean) => {
    const wasOffline = !get().isOnline;
    set({ isOnline: online });
    get().addSyncLog(online ? "Went ONLINE" : "Went OFFLINE", online ? "info" : "warning");

    if (online && wasOffline) {
      // Reconnected — sync immediately
      setTimeout(() => get().sync(), 200);
    }
  },

  // ── Sync ───────────────────────────────────────────────────────────────────

  sync: async () => {
    const state = get();
    if (!state.isOnline || state.isSyncing) return;

    set({ isSyncing: true });

    try {
      const response = await fetch(`${SERVER_URL}/sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          deviceId: state.deviceId,
          studentId: state.studentId,
          lastSeenLamport: state.lastSeenLamport,
          operations: state.pendingOps,
        }),
      });

      if (!response.ok) throw new Error(`Server returned ${response.status}`);

      const data = await response.json() as {
        operations: Operation[];
        rewardState: { studentId: string; coins: number; streak: number; lastFocusDate: string; todayFocusMinutes: number };
        serverLamport: number;
      };

      // Apply incoming ops to local state
      let { tasks, lamport } = get();
      const currentDeviceId = get().deviceId;
      let conflictsDetected = 0;
      const localConflicts: ConflictEvent[] = [];

      for (const op of data.operations) {
        // Skip ops we created ourselves (already applied locally)
        if (op.deviceId === currentDeviceId) continue;

        // Update lamport clock
        lamport = receiveLamport(lamport, op.lamport);

        if (op.type === "TASK_STATUS_CHANGED") {
          const existing = tasks.find((t) => t.id === op.entityId);
          if (existing && !existing.deleted) {
            const shouldApply =
              op.lamport > existing.lamport ||
              (op.lamport === existing.lamport && op.deviceId > existing.deviceId);

            const isConflict = existing.status !== (op.payload.status as TaskStatus);
            if (isConflict) {
              conflictsDetected++;
              const winnerDevice = shouldApply ? op.deviceId : existing.deviceId;
              localConflicts.push({
                id: uuidv4(),
                timestamp: new Date().toISOString(),
                taskTitle: existing.title,
                localStatus: existing.status,
                remoteStatus: op.payload.status as string,
                winner: winnerDevice,
                localLamport: existing.lamport,
                remoteLamport: op.lamport,
              });

              get().addSyncLog(
                `CONFLICT: Task "${existing.title}" local=${existing.status} remote=${op.payload.status as string} → ${winnerDevice} wins (lamport ${existing.lamport} vs ${op.lamport})`,
                "conflict"
              );
            }

            if (shouldApply) {
              tasks = tasks.map((t) =>
                t.id === op.entityId
                  ? { ...t, status: op.payload.status as TaskStatus, lamport: op.lamport, deviceId: op.deviceId }
                  : t
              );
            }
          } else if (!existing) {
            // Task from other device we don't have
            const p = op.payload as { status: TaskStatus; subjectId: string; chapterId: string; title: string };
            tasks = [...tasks, {
              id: op.entityId,
              studentId: op.studentId,
              subjectId: p.subjectId ?? "",
              chapterId: p.chapterId ?? "",
              title: p.title ?? "Task",
              status: p.status,
              deleted: false,
              lamport: op.lamport,
              deviceId: op.deviceId,
            }];
          }
        }

        if (op.type === "TASK_DELETED") {
          const existing = tasks.find((t) => t.id === op.entityId);
          if (existing && !existing.deleted) {
            conflictsDetected++;
            localConflicts.push({
              id: uuidv4(),
              timestamp: new Date().toISOString(),
              taskTitle: existing.title,
              localStatus: existing.status,
              remoteStatus: "DELETED",
              winner: op.deviceId,
              localLamport: existing.lamport,
              remoteLamport: op.lamport,
            });

            get().addSyncLog(
              `CONFLICT: Task "${existing.title}" deleted remotely — delete wins`,
              "conflict"
            );
            tasks = tasks.map((t) =>
              t.id === op.entityId ? { ...t, deleted: true, lamport: op.lamport, deviceId: op.deviceId } : t
            );
          }
        }

        if (op.type === "TASK_CREATED") {
          const existing = tasks.find((t) => t.id === op.entityId);
          if (!existing) {
            const p = op.payload as { status: TaskStatus; subjectId: string; chapterId: string; title: string };
            tasks = [...tasks, {
              id: op.entityId,
              studentId: op.studentId,
              subjectId: p.subjectId ?? "",
              chapterId: p.chapterId ?? "",
              title: p.title ?? "Task",
              status: p.status ?? "NOT_STARTED",
              deleted: false,
              lamport: op.lamport,
              deviceId: op.deviceId,
            }];
          }
        }
      }

      const newLastSeen = Math.max(state.lastSeenLamport, data.serverLamport);
      const newConflictEvents = [...get().conflictEvents, ...localConflicts].slice(0, 50);

      set({
        tasks,
        lamport,
        lastSeenLamport: newLastSeen,
        pendingOps: [], // All sent ops are now on the server
        rewards: {
          studentId: data.rewardState.studentId,
          coins: data.rewardState.coins,
          streak: data.rewardState.streak,
          lastFocusDate: data.rewardState.lastFocusDate,
          todayFocusMinutes: data.rewardState.todayFocusMinutes,
        },
        lastSyncAt: new Date().toISOString(),
        isSyncing: false,
        conflictEvents: newConflictEvents,
      });

      await Promise.all([
        saveTasks(state.deviceId, tasks),
        saveLamport(state.deviceId, lamport),
        saveLastSeenLamport(state.deviceId, newLastSeen),
        savePendingOps(state.deviceId, []),
        saveRewards(state.deviceId, {
          studentId: data.rewardState.studentId,
          coins: data.rewardState.coins,
          streak: data.rewardState.streak,
          lastFocusDate: data.rewardState.lastFocusDate,
          todayFocusMinutes: data.rewardState.todayFocusMinutes,
        }),
        saveConflictEvents(state.deviceId, newConflictEvents),
      ]);

      const incoming = data.operations.filter((o) => o.deviceId !== state.deviceId).length;
      get().addSyncLog(
        `Sync OK: sent ${state.pendingOps.length} ops, received ${incoming} ops${conflictsDetected > 0 ? `, ${conflictsDetected} conflicts resolved` : ""}`,
        "success"
      );
    } catch (err: unknown) {
      set({ isSyncing: false });
      get().addSyncLog(`Sync failed: ${(err as Error).message}`, "error");
    }
  },
}));

// ── Sync polling ────────────────────────────────────────────────────────────
// Poll every 5 seconds when online

let syncInterval: ReturnType<typeof setInterval> | null = null;

export function startSyncPolling() {
  if (syncInterval) clearInterval(syncInterval);
  syncInterval = setInterval(() => {
    const state = useAppStore.getState();
    if (state.isOnline && !state.isSyncing) {
      state.sync();
    }
  }, 5000);
}

export function stopSyncPolling() {
  if (syncInterval) {
    clearInterval(syncInterval);
    syncInterval = null;
  }
}
