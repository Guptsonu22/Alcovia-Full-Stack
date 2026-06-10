import { open, Database } from "sqlite";
import sqlite3 from "sqlite3";
import path from "path";

const DB_PATH = path.join(__dirname, "../../alcovia.db");

let dbInstance: Database | null = null;

export async function getDb(): Promise<Database> {
  if (dbInstance) return dbInstance;

  dbInstance = await open({
    filename: DB_PATH,
    driver: sqlite3.Database,
  });

  await dbInstance.run("PRAGMA journal_mode = WAL");
  await dbInstance.run("PRAGMA foreign_keys = ON");
  await initSchema(dbInstance);
  await seedInitialData(dbInstance);

  return dbInstance;
}

async function initSchema(db: Database): Promise<void> {
  await db.exec(`
    -- Tasks
    CREATE TABLE IF NOT EXISTS tasks (
      id          TEXT PRIMARY KEY,
      studentId   TEXT NOT NULL,
      subjectId   TEXT NOT NULL,
      chapterId   TEXT NOT NULL,
      title       TEXT NOT NULL,
      status      TEXT NOT NULL DEFAULT 'NOT_STARTED',
      deleted     INTEGER NOT NULL DEFAULT 0,
      lamport     INTEGER NOT NULL DEFAULT 0,
      deviceId    TEXT NOT NULL DEFAULT '',
      updatedAt   TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Operation Log (append-only, idempotency + replay)
    CREATE TABLE IF NOT EXISTS operations (
      opId        TEXT PRIMARY KEY,
      deviceId    TEXT NOT NULL,
      studentId   TEXT NOT NULL,
      lamport     INTEGER NOT NULL,
      type        TEXT NOT NULL,
      entityId    TEXT NOT NULL,
      payload     TEXT NOT NULL,
      createdAt   TEXT NOT NULL,
      receivedAt  TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Focus Sessions
    CREATE TABLE IF NOT EXISTS focus_sessions (
      id              TEXT PRIMARY KEY,
      studentId       TEXT NOT NULL,
      deviceId        TEXT NOT NULL,
      targetMinutes   INTEGER NOT NULL,
      startedAt       TEXT NOT NULL,
      completedAt     TEXT,
      status          TEXT NOT NULL DEFAULT 'RUNNING',
      failReason      TEXT,
      elapsedSeconds  INTEGER NOT NULL DEFAULT 0,
      rewarded        INTEGER NOT NULL DEFAULT 0
    );

    -- Reward State
    CREATE TABLE IF NOT EXISTS reward_state (
      studentId         TEXT PRIMARY KEY,
      coins             INTEGER NOT NULL DEFAULT 0,
      streak            INTEGER NOT NULL DEFAULT 0,
      lastFocusDate     TEXT NOT NULL DEFAULT '',
      todayFocusMinutes INTEGER NOT NULL DEFAULT 0
    );

    -- Idempotency: Processed Rewards
    CREATE TABLE IF NOT EXISTS processed_rewards (
      sessionId   TEXT PRIMARY KEY,
      processedAt TEXT NOT NULL DEFAULT (datetime('now')),
      coins       INTEGER NOT NULL,
      streak      INTEGER NOT NULL
    );

    -- Idempotency: n8n Notifications
    CREATE TABLE IF NOT EXISTS n8n_events (
      eventId     TEXT PRIMARY KEY,
      firedAt     TEXT NOT NULL DEFAULT (datetime('now')),
      payload     TEXT NOT NULL
    );

    -- Static reference data
    CREATE TABLE IF NOT EXISTS subjects (
      id    TEXT PRIMARY KEY,
      name  TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS chapters (
      id        TEXT PRIMARY KEY,
      subjectId TEXT NOT NULL,
      name      TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_operations_lamport
      ON operations(studentId, lamport);

    CREATE INDEX IF NOT EXISTS idx_tasks_student
      ON tasks(studentId);
  `);
}

async function seedInitialData(db: Database): Promise<void> {
  const row = await db.get<{ c: number }>("SELECT COUNT(*) as c FROM subjects");
  if (row && row.c > 0) return;

  // Subjects
  const subjects = [
    ["sub-math", "Mathematics"],
    ["sub-sci", "Science"],
    ["sub-eng", "English"],
  ];
  for (const [id, name] of subjects) {
    await db.run("INSERT OR IGNORE INTO subjects (id, name) VALUES (?, ?)", id, name);
  }

  // Chapters
  const chapters = [
    ["ch-alg", "sub-math", "Algebra"],
    ["ch-geo", "sub-math", "Geometry"],
    ["ch-phy", "sub-sci", "Physics"],
    ["ch-chem", "sub-sci", "Chemistry"],
    ["ch-gram", "sub-eng", "Grammar"],
    ["ch-comp", "sub-eng", "Comprehension"],
  ];
  for (const [id, subId, name] of chapters) {
    await db.run(
      "INSERT OR IGNORE INTO chapters (id, subjectId, name) VALUES (?, ?, ?)",
      id, subId, name
    );
  }

  // Tasks
  const tasks = [
    ["task-001", "sub-math", "ch-alg", "Linear equations"],
    ["task-002", "sub-math", "ch-alg", "Quadratic equations"],
    ["task-003", "sub-math", "ch-alg", "Polynomials"],
    ["task-004", "sub-math", "ch-geo", "Triangles & congruence"],
    ["task-005", "sub-math", "ch-geo", "Circles & arcs"],
    ["task-006", "sub-sci", "ch-phy", "Laws of motion"],
    ["task-007", "sub-sci", "ch-phy", "Work, energy & power"],
    ["task-008", "sub-sci", "ch-phy", "Waves & sound"],
    ["task-009", "sub-sci", "ch-chem", "Periodic table"],
    ["task-010", "sub-sci", "ch-chem", "Chemical bonding"],
    ["task-011", "sub-eng", "ch-gram", "Tenses"],
    ["task-012", "sub-eng", "ch-gram", "Clauses & phrases"],
    ["task-013", "sub-eng", "ch-comp", "Unseen passage 1"],
    ["task-014", "sub-eng", "ch-comp", "Unseen passage 2"],
  ];
  for (const [id, subId, chId, title] of tasks) {
    await db.run(
      `INSERT OR IGNORE INTO tasks
        (id, studentId, subjectId, chapterId, title, status, deleted, lamport, deviceId)
       VALUES (?, 'student-001', ?, ?, ?, 'NOT_STARTED', 0, 0, '')`,
      id, subId, chId, title
    );
  }

  // Initial reward state
  await db.run(
    `INSERT OR IGNORE INTO reward_state (studentId, coins, streak, lastFocusDate, todayFocusMinutes)
     VALUES ('student-001', 0, 0, '', 0)`
  );

  console.log("[DB] Seeded initial data");
}

export default getDb;
