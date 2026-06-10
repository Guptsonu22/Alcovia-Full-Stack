import { Router, Request, Response } from "express";
import { getDb } from "../db";
import { Operation, SyncRequest, SyncResponse } from "../types";
import { resolveTaskOperation, resolveFocusOperation } from "../sync/conflictResolver";
import { processSessionReward } from "../sync/rewardEngine";

const router = Router();

/**
 * POST /sync
 * ──────────────────────────────────────────────────────────────────────────────
 * Body: { deviceId, studentId, lastSeenLamport, operations }
 *
 * For each incoming op:
 *   1. Skip if opId already in operations table (idempotent)
 *   2. Apply to entity tables via conflict resolver
 *   3. Store in operations log
 * After all ops: process rewards for FOCUS_SUCCESS ops (idempotent)
 * Return: ops the client hasn't seen (lamport > lastSeenLamport) + reward state
 */
router.post("/", async (req: Request, res: Response): Promise<void> => {
  try {
    const body = req.body as SyncRequest;

    if (!body.deviceId || !body.studentId) {
      res.status(400).json({ error: "deviceId and studentId required" });
      return;
    }

    const db = await getDb();
    const { deviceId, studentId, operations = [], lastSeenLamport = 0 } = body;

    console.log(
      `[Sync] Device=${deviceId} sent ${operations.length} ops, lastSeen=${lastSeenLamport}`
    );

    const successSessionIds: string[] = [];

    // ── Process each incoming operation ───────────────────────────────────────
    for (const op of operations) {
      // Idempotency check
      const existing = await db.get(
        "SELECT opId FROM operations WHERE opId = ?",
        op.opId
      );
      if (existing) {
        console.log(`[Sync] Op ${op.opId} already seen — skipping`);
        continue;
      }

      // Apply to entity tables
      if (["TASK_CREATED", "TASK_STATUS_CHANGED", "TASK_DELETED"].includes(op.type)) {
        await resolveTaskOperation(db, op);
      } else if (["FOCUS_SESSION_STARTED", "FOCUS_SUCCESS", "FOCUS_FAIL"].includes(op.type)) {
        await resolveFocusOperation(db, op);
        if (op.type === "FOCUS_SUCCESS") {
          successSessionIds.push(op.entityId);
        }
      }

      // Store in log
      await db.run(
        `INSERT INTO operations (opId, deviceId, studentId, lamport, type, entityId, payload, createdAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        op.opId, op.deviceId, op.studentId, op.lamport,
        op.type, op.entityId, JSON.stringify(op.payload), op.createdAt
      );
    }

    // ── Process rewards (idempotent internally) ────────────────────────────────
    for (const sessionId of successSessionIds) {
      processSessionReward(db, sessionId, studentId).catch((err: Error) =>
        console.error(`[Sync] Reward error for ${sessionId}:`, err.message)
      );
    }

    // ── Fetch ops the client hasn't seen yet ───────────────────────────────────
    const rawOps = await db.all<Array<{
      opId: string; deviceId: string; studentId: string;
      lamport: number; type: string; entityId: string;
      payload: string; createdAt: string;
    }>>(
      `SELECT opId, deviceId, studentId, lamport, type, entityId, payload, createdAt
       FROM operations
       WHERE studentId = ? AND lamport > ?
       ORDER BY lamport ASC`,
      studentId, lastSeenLamport
    );

    const responseOps: Operation[] = rawOps.map((row) => ({
      opId: row.opId,
      deviceId: row.deviceId,
      studentId: row.studentId,
      lamport: row.lamport,
      type: row.type as Operation["type"],
      entityId: row.entityId,
      payload: JSON.parse(row.payload),
      createdAt: row.createdAt,
    }));

    // ── Load reward state ──────────────────────────────────────────────────────
    const rewardState = await db.get<{
      studentId: string; coins: number; streak: number;
      lastFocusDate: string; todayFocusMinutes: number;
    }>("SELECT * FROM reward_state WHERE studentId = ?", studentId);

    // ── Server lamport ─────────────────────────────────────────────────────────
    const maxRow = await db.get<{ maxL: number | null }>(
      "SELECT MAX(lamport) as maxL FROM operations WHERE studentId = ?",
      studentId
    );

    const response: SyncResponse = {
      operations: responseOps,
      rewardState: rewardState ?? {
        studentId,
        coins: 0, streak: 0, lastFocusDate: "", todayFocusMinutes: 0,
      },
      serverLamport: maxRow?.maxL ?? 0,
    };

    console.log(`[Sync] Returning ${responseOps.length} ops to device=${deviceId}`);
    res.json(response);
  } catch (err: unknown) {
    console.error("[Sync] Error:", err);
    res.status(500).json({ error: "Sync failed", detail: (err as Error).message });
  }
});

/**
 * GET /sync/state/:studentId — Full server state (dev panel)
 */
router.get("/state/:studentId", async (req: Request, res: Response): Promise<void> => {
  try {
    const db = await getDb();
    const { studentId } = req.params;

    const tasks = await db.all(
      "SELECT * FROM tasks WHERE studentId = ? ORDER BY subjectId, chapterId",
      studentId
    );
    const sessions = await db.all(
      "SELECT * FROM focus_sessions WHERE studentId = ? ORDER BY startedAt DESC LIMIT 20",
      studentId
    );
    const rewardState = await db.get(
      "SELECT * FROM reward_state WHERE studentId = ?",
      studentId
    );
    const ops = await db.all(
      "SELECT * FROM operations WHERE studentId = ? ORDER BY lamport DESC LIMIT 50",
      studentId
    );
    const processedRewards = await db.all("SELECT * FROM processed_rewards ORDER BY processedAt DESC");
    const n8nEvents = await db.all("SELECT * FROM n8n_events ORDER BY firedAt DESC");

    res.json({ tasks, sessions, rewardState, ops, processedRewards, n8nEvents });
  } catch (err: unknown) {
    res.status(500).json({ error: (err as Error).message });
  }
});

export default router;
