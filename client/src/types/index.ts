// ─── Shared types (mirrors server/src/types/index.ts) ─────────────────────

export type OperationType =
  | "TASK_CREATED"
  | "TASK_STATUS_CHANGED"
  | "TASK_DELETED"
  | "FOCUS_SESSION_STARTED"
  | "FOCUS_SUCCESS"
  | "FOCUS_FAIL";

export type TaskStatus = "NOT_STARTED" | "IN_PROGRESS" | "DONE";
export type SessionStatus = "RUNNING" | "SUCCESS" | "FAILED";
export type FailReason = "give_up" | "app_switch";

export interface Operation {
  opId: string;
  deviceId: string;
  studentId: string;
  lamport: number;
  type: OperationType;
  entityId: string;
  payload: Record<string, unknown>;
  createdAt: string;
}

export interface Task {
  id: string;
  studentId: string;
  subjectId: string;
  chapterId: string;
  title: string;
  status: TaskStatus;
  deleted: boolean;
  lamport: number;
  deviceId: string;
}

export interface Subject {
  id: string;
  name: string;
}

export interface Chapter {
  id: string;
  subjectId: string;
  name: string;
}

export interface FocusSession {
  id: string;
  studentId: string;
  deviceId: string;
  targetMinutes: number;
  startedAt: string;
  completedAt?: string;
  status: SessionStatus;
  failReason?: FailReason;
  elapsedSeconds: number;
  rewarded: boolean;
}

export interface RewardState {
  studentId: string;
  coins: number;
  streak: number;
  lastFocusDate: string;
  todayFocusMinutes: number;
}

export interface SyncRequest {
  deviceId: string;
  studentId: string;
  lastSeenLamport: number;
  operations: Operation[];
}

export interface SyncResponse {
  operations: Operation[];
  rewardState: RewardState;
  serverLamport: number;
}

export interface SyncLogEntry {
  id: string;
  timestamp: string;
  message: string;
  type: "info" | "success" | "warning" | "conflict" | "error";
}

export interface ConflictEvent {
  id: string;
  timestamp: string;
  taskTitle: string;
  localStatus: string;
  remoteStatus: string;
  winner: string;
  localLamport: number;
  remoteLamport: number;
}
