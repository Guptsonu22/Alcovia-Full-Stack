import { Database } from "sqlite";
import { Operation, TaskStatus } from "../types";

/**
 * Conflict Resolution Strategy
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Rule 1 — TASK_DELETED always wins over TASK_STATUS_CHANGED
 *   Rationale: A delete is a deliberate terminal action. Allowing an edit to
 *   revive a deleted task would be more surprising than losing the edit.
 *
 * Rule 2 — Higher lamport wins for status conflicts
 *   Rationale: Lamport clocks reflect causal ordering. An op with a higher
 *   Lamport value was created after (or with knowledge of) the lower one.
 *
 * Rule 3 — Tie-break by deviceId (lexicographic, deterministic)
 *   Rationale: Any deterministic tie-breaker works; we just need all devices
 *   to apply the same rule and reach the same result.
 *
 * Rule 4 — Idempotency: opId already in operations table → skip entirely
 *   This is handled in sync.ts before calling these functions.
 */

interface TaskRow {
  id: string;
  status: string;
  deleted: number;
  lamport: number;
  deviceId: string;
}

interface SessionRow {
  id: string;
  status: string;
}

export async function resolveTaskOperation(
  db: Database,
  op: Operation
): Promise<void> {
  const existing = await db.get<TaskRow>(
    "SELECT id, status, deleted, lamport, deviceId FROM tasks WHERE id = ?",
    op.entityId
  );

  if (op.type === "TASK_CREATED") {
    if (!existing) {
      const p = op.payload as Partial<{ subjectId: string; chapterId: string; title: string; status: string }>;
      await db.run(
        `INSERT INTO tasks (id, studentId, subjectId, chapterId, title, status, deleted, lamport, deviceId)
         VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)`,
        op.entityId, op.studentId,
        p.subjectId ?? "", p.chapterId ?? "",
        p.title ?? "Untitled", p.status ?? "NOT_STARTED",
        op.lamport, op.deviceId
      );
    }
    // If already exists — skip (concurrent create from two devices)
    return;
  }

  if (op.type === "TASK_DELETED") {
    if (!existing) return;

    if (existing.deleted) {
      // Already deleted — update lamport if this one is higher (keeps metadata accurate)
      if (op.lamport > existing.lamport) {
        await db.run(
          "UPDATE tasks SET lamport = ?, deviceId = ?, updatedAt = datetime('now') WHERE id = ?",
          op.lamport, op.deviceId, op.entityId
        );
      }
    } else {
      // Apply delete unconditionally — DELETE always wins over edits
      await db.run(
        "UPDATE tasks SET deleted = 1, lamport = ?, deviceId = ?, updatedAt = datetime('now') WHERE id = ?",
        op.lamport, op.deviceId, op.entityId
      );
    }
    return;
  }

  if (op.type === "TASK_STATUS_CHANGED") {
    const p = op.payload as { status: TaskStatus; subjectId?: string; chapterId?: string; title?: string };

    if (!existing) {
      // Task doesn't exist yet — create it (handles out-of-order ops)
      await db.run(
        `INSERT INTO tasks (id, studentId, subjectId, chapterId, title, status, deleted, lamport, deviceId)
         VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)`,
        op.entityId, op.studentId,
        p.subjectId ?? "", p.chapterId ?? "",
        p.title ?? "Task", p.status,
        op.lamport, op.deviceId
      );
      return;
    }

    // Rule 1: If task is deleted — skip any status change
    if (existing.deleted) return;

    // Rule 2: Higher lamport wins; Rule 3: tie-break by deviceId
    const shouldApply =
      op.lamport > existing.lamport ||
      (op.lamport === existing.lamport && op.deviceId > existing.deviceId);

    if (shouldApply) {
      await db.run(
        "UPDATE tasks SET status = ?, lamport = ?, deviceId = ?, updatedAt = datetime('now') WHERE id = ?",
        p.status, op.lamport, op.deviceId, op.entityId
      );
    }
  }
}

export async function resolveFocusOperation(
  db: Database,
  op: Operation
): Promise<void> {
  if (op.type === "FOCUS_SESSION_STARTED") {
    const existing = await db.get<SessionRow>(
      "SELECT id FROM focus_sessions WHERE id = ?",
      op.entityId
    );
    if (existing) return; // idempotent

    const p = op.payload as { targetMinutes: number; startedAt: string };
    await db.run(
      `INSERT INTO focus_sessions
        (id, studentId, deviceId, targetMinutes, startedAt, status, elapsedSeconds, rewarded)
       VALUES (?, ?, ?, ?, ?, 'RUNNING', 0, 0)`,
      op.entityId, op.studentId, op.deviceId, p.targetMinutes, p.startedAt
    );
    return;
  }

  if (op.type === "FOCUS_SUCCESS" || op.type === "FOCUS_FAIL") {
    const existing = await db.get<SessionRow>(
      "SELECT id, status FROM focus_sessions WHERE id = ?",
      op.entityId
    );

    const p = op.payload as {
      targetMinutes?: number;
      startedAt?: string;
      completedAt?: string;
      elapsedSeconds?: number;
      failReason?: string;
    };

    if (!existing) {
      // Session started offline, never reached server — create + finalize
      await db.run(
        `INSERT INTO focus_sessions
          (id, studentId, deviceId, targetMinutes, startedAt, completedAt, status, failReason, elapsedSeconds, rewarded)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
        op.entityId, op.studentId, op.deviceId,
        p.targetMinutes ?? 25,
        p.startedAt ?? new Date().toISOString(),
        p.completedAt ?? new Date().toISOString(),
        op.type === "FOCUS_SUCCESS" ? "SUCCESS" : "FAILED",
        op.type === "FOCUS_FAIL" ? (p.failReason ?? "give_up") : null,
        p.elapsedSeconds ?? 0
      );
      return;
    }

    // If already in terminal state — skip (idempotent)
    if (existing.status === "SUCCESS" || existing.status === "FAILED") return;

    await db.run(
      "UPDATE focus_sessions SET status = ?, completedAt = ?, elapsedSeconds = ?, failReason = ? WHERE id = ?",
      op.type === "FOCUS_SUCCESS" ? "SUCCESS" : "FAILED",
      p.completedAt ?? new Date().toISOString(),
      p.elapsedSeconds ?? 0,
      op.type === "FOCUS_FAIL" ? (p.failReason ?? "give_up") : null,
      op.entityId
    );
  }
}
