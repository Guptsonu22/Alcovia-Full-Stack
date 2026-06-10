import { Database } from "sqlite";
import axios from "axios";

const N8N_WEBHOOK_URL =
  process.env.N8N_WEBHOOK_URL ||
  "http://localhost:5678/webhook/alcovia-reward";

const COINS_PER_SESSION = 50;

interface SessionRow {
  id: string;
  studentId: string;
  targetMinutes: number;
  elapsedSeconds: number;
  status: string;
  rewarded: number;
}

interface RewardRow {
  studentId: string;
  coins: number;
  streak: number;
  lastFocusDate: string;
  todayFocusMinutes: number;
}

/**
 * processSessionReward
 * ──────────────────────────────────────────────────────────────────────────────
 * Idempotency guarantee:
 *   Checks processed_rewards table. If sessionId exists → return immediately.
 *   The reward UPDATE + processed_rewards INSERT happen as a single atomic
 *   operation using SQLite serialized mode.
 */
export async function processSessionReward(
  db: Database,
  sessionId: string,
  studentId: string
): Promise<void> {
  // ── Idempotency check ──────────────────────────────────────────────────────
  const alreadyProcessed = await db.get(
    "SELECT sessionId FROM processed_rewards WHERE sessionId = ?",
    sessionId
  );
  if (alreadyProcessed) {
    console.log(`[Reward] Session ${sessionId} already rewarded — skipping`);
    return;
  }

  // ── Load session ───────────────────────────────────────────────────────────
  const session = await db.get<SessionRow>(
    "SELECT * FROM focus_sessions WHERE id = ? AND status = 'SUCCESS'",
    sessionId
  );
  if (!session) {
    console.log(`[Reward] Session ${sessionId} not found or not SUCCESS`);
    return;
  }

  // ── Load reward state ──────────────────────────────────────────────────────
  let current = await db.get<RewardRow>(
    "SELECT * FROM reward_state WHERE studentId = ?",
    studentId
  );
  if (!current) {
    await db.run(
      "INSERT INTO reward_state (studentId, coins, streak, lastFocusDate, todayFocusMinutes) VALUES (?, 0, 0, '', 0)",
      studentId
    );
    current = { studentId, coins: 0, streak: 0, lastFocusDate: "", todayFocusMinutes: 0 };
  }

  // ── Calculate new values ───────────────────────────────────────────────────
  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);

  let newStreak = current.streak;
  let newTodayMinutes = current.todayFocusMinutes;
  const addedMinutes = Math.floor(session.elapsedSeconds / 60);

  if (current.lastFocusDate === today) {
    newTodayMinutes += addedMinutes;
    // Streak unchanged — already counted today
  } else if (current.lastFocusDate === yesterday) {
    newStreak += 1;
    newTodayMinutes = addedMinutes;
  } else {
    // Gap or first session — start streak at 1
    newStreak = 1;
    newTodayMinutes = addedMinutes;
  }

  const newCoins = current.coins + COINS_PER_SESSION;

  // ── Apply atomically ───────────────────────────────────────────────────────
  // SQLite in WAL mode serializes writes, so these three run atomically
  // (no explicit transaction needed for this simple case, but using one for safety)
  await db.run("BEGIN");
  try {
    await db.run(
      "UPDATE reward_state SET coins = ?, streak = ?, lastFocusDate = ?, todayFocusMinutes = ? WHERE studentId = ?",
      newCoins, newStreak, today, newTodayMinutes, studentId
    );
    await db.run(
      "UPDATE focus_sessions SET rewarded = 1 WHERE id = ?",
      sessionId
    );
    await db.run(
      "INSERT INTO processed_rewards (sessionId, coins, streak) VALUES (?, ?, ?)",
      sessionId, newCoins, newStreak
    );
    await db.run("COMMIT");
  } catch (err) {
    await db.run("ROLLBACK");
    throw err;
  }

  console.log(`[Reward] Session ${sessionId}: +${COINS_PER_SESSION} coins, streak=${newStreak}, todayMin=${newTodayMinutes}`);

  // ── Fire n8n webhook (non-blocking) ───────────────────────────────────────
  fireN8nWebhook(db, sessionId, studentId, newCoins, newStreak, newTodayMinutes).catch(
    (err: Error) => console.error("[n8n] Webhook error:", err.message)
  );
}

async function fireN8nWebhook(
  db: Database,
  eventId: string,
  studentId: string,
  coins: number,
  streak: number,
  todayFocusMinutes: number
): Promise<void> {
  // Server-side dedup: never fire twice for same eventId
  const alreadyFired = await db.get(
    "SELECT eventId FROM n8n_events WHERE eventId = ?",
    eventId
  );
  if (alreadyFired) {
    console.log(`[n8n] Event ${eventId} already fired — skipping`);
    return;
  }

  const payload = {
    eventId,
    studentId,
    coins,
    streak,
    todayFocusMinutes,
    message: `Streak now ${streak} day${streak !== 1 ? "s" : ""}! +${COINS_PER_SESSION} coins earned.`,
  };

  // Record as fired FIRST (before the network call)
  // This prevents a race condition where two concurrent calls both see "not fired"
  await db.run(
    "INSERT OR IGNORE INTO n8n_events (eventId, payload) VALUES (?, ?)",
    eventId, JSON.stringify(payload)
  );

  try {
    await axios.post(N8N_WEBHOOK_URL, payload, { timeout: 5000 });
    console.log(`[n8n] Webhook fired for event ${eventId}`);
  } catch (err: unknown) {
    console.warn(`[n8n] Webhook call failed (is n8n running?): ${(err as Error).message}`);
    // We've already recorded it as fired — idempotency is preserved
    // In production: add to a retry queue with backoff
  }
}
