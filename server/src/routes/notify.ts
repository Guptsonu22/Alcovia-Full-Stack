import { Router, Request, Response } from "express";

const router = Router();

// In-memory store for received notifications (mock sink)
const notificationLog: Array<{ timestamp: string; payload: any }> = [];

/**
 * POST /notifications
 * ──────────────────────────────────────────────────────────────────────────────
 * Mock notification sink. In production this would be WhatsApp/SMS/email.
 * Logs the payload and returns 200 so n8n gets a success response.
 */
router.post("/", (req: Request, res: Response): void => {
  const payload = req.body;
  notificationLog.push({ timestamp: new Date().toISOString(), payload });

  console.log("\n╔══════════════════════════════════════════╗");
  console.log("║        📬 NOTIFICATION RECEIVED          ║");
  console.log("╠══════════════════════════════════════════╣");
  console.log(`║  Event ID : ${String(payload.eventId ?? "").padEnd(28)}║`);
  console.log(`║  Student  : ${String(payload.studentId ?? "").padEnd(28)}║`);
  console.log(`║  Coins    : ${String(payload.coins ?? "").padEnd(28)}║`);
  console.log(`║  Streak   : ${String(payload.streak ?? "").padEnd(28)}║`);
  console.log("╠══════════════════════════════════════════╣");
  console.log(`║  ${String(payload.message ?? "").slice(0, 41).padEnd(41)}║`);
  console.log("╚══════════════════════════════════════════╝\n");

  res.json({
    ok: true,
    received: true,
    eventId: payload.eventId,
    timestamp: new Date().toISOString(),
  });
});

/**
 * GET /notifications
 * Returns a list of all received notifications (useful for dev panel).
 */
router.post("/log", (req: Request, res: Response): void => {
  notificationLog.push({ timestamp: new Date().toISOString(), payload: req.body });
  res.json({ ok: true });
});

router.get("/log", (_req: Request, res: Response): void => {
  res.json(notificationLog);
});

export default router;
