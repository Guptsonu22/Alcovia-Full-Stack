import express from "express";
import cors from "cors";
import { getDb } from "./db";
import syncRouter from "./routes/sync";
import notifyRouter from "./routes/notify";

const app = express();
const PORT = process.env.PORT ?? 3001;

app.use(cors({ origin: "*", methods: ["GET", "POST", "OPTIONS"], allowedHeaders: ["Content-Type"] }));
app.use(express.json());

// Request logger
app.use((req, _res, next) => {
  if (req.path !== "/health") {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  }
  next();
});

app.use("/sync", syncRouter);
app.use("/notifications", notifyRouter);

app.get("/health", (_req, res) => {
  res.json({ ok: true, timestamp: new Date().toISOString(), uptime: process.uptime() });
});

app.get("/subjects", async (_req, res) => {
  try {
    const db = await getDb();
    const subjects = await db.all("SELECT * FROM subjects ORDER BY name");
    const chapters = await db.all("SELECT * FROM chapters ORDER BY subjectId, name");
    res.json({ subjects, chapters });
  } catch (err: unknown) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// ── Startup ────────────────────────────────────────────────────────────────
async function start() {
  try {
    await getDb(); // Initialize and seed DB
    app.listen(PORT, () => {
      console.log(`\n[OK] Alcovia server on http://localhost:${PORT}`);
      console.log(`  POST /sync              sync endpoint`);
      console.log(`  POST /notifications     mock notification sink`);
      console.log(`  GET  /health            health check`);
      console.log(`  GET  /subjects          subjects + chapters`);
      console.log(`  GET  /sync/state/:id    full state (dev panel)\n`);
    });
  } catch (err) {
    console.error("[FATAL] Could not start server:", err);
    process.exit(1);
  }
}

start();

export default app;
