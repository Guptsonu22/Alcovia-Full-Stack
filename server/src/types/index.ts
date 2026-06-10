// ─── Shared Types ─────────────────────────────────────────────────────────────
// These mirror the client-side types. Keep in sync manually.

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
  opId: string;          // UUID — globally unique, used for idempotency
  deviceId: string;      // which device created this op
  studentId: string;     // always "student-001"
  lamport: number;       // logical Lamport clock value at time of creation
  type: OperationType;
  entityId: string;      // taskId or sessionId this op refers to
  payload: Record<string, unknown>;
  createdAt: string;     // ISO timestamp — display only, NOT used for ordering
}

export interface Task {
  id: string;
  studentId: string;
  subjectId: string;
  chapterId: string;
  title: string;
  status: TaskStatus;
  deleted: boolean;      // soft delete — tombstone for conflict resolution
  lamport: number;       // lamport of the last operation applied to this task
  deviceId: string;      // deviceId of the last op (tie-breaker)
}

export interface Subject {
  id: string;
  name: string;
  chapters: Chapter[];
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
  lastFocusDate: string;   // "YYYY-MM-DD"
  todayFocusMinutes: number;
}

export interface SyncRequest {
  deviceId: string;
  studentId: string;
  lastSeenLamport: number;
  operations: Operation[];
}

export interface SyncResponse {
  operations: Operation[];    // ops the client hasn't seen yet
  rewardState: RewardState;
  serverLamport: number;
}
