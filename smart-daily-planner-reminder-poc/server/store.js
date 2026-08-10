import { mkdirSync } from "node:fs";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { buildDailyPlan, todayKey } from "./planner.js";

const dataDir = path.resolve("data");
mkdirSync(dataDir, { recursive: true });

const db = new DatabaseSync(path.join(dataDir, "planner.db"));

db.exec(`
  CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    title TEXT NOT NULL,
    category TEXT NOT NULL,
    priority TEXT NOT NULL,
    due_at TEXT NOT NULL,
    earliest_at TEXT,
    estimate_minutes INTEGER NOT NULL,
    reminder_minutes_before INTEGER NOT NULL,
    recurrence TEXT NOT NULL,
    status TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS day_plans (
    user_id TEXT NOT NULL,
    plan_date TEXT NOT NULL,
    plan_json TEXT NOT NULL,
    generated_at TEXT NOT NULL,
    PRIMARY KEY (user_id, plan_date)
  );

  CREATE TABLE IF NOT EXISTS reminder_jobs (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    task_id TEXT NOT NULL,
    due_at TEXT NOT NULL,
    status TEXT NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0,
    locked_until TEXT,
    last_error TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS audit_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    detail_json TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS idempotency_keys (
    key TEXT PRIMARY KEY,
    response_json TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_tasks_user_status_due ON tasks(user_id, status, due_at);
  CREATE INDEX IF NOT EXISTS idx_reminder_jobs_due ON reminder_jobs(status, due_at, locked_until);
  CREATE INDEX IF NOT EXISTS idx_audit_events_user_created ON audit_events(user_id, created_at);
`);

export function getSnapshot(userId) {
  seedDemoData(userId);
  const tasks = getTasks(userId);
  const plan = getPlan(userId, todayKey()) || savePlan(userId, todayKey(), buildDailyPlan(tasks));
  const reminders = getReminderJobs(userId);
  const events = getAuditEvents(userId, 12);

  return {
    userId,
    tasks,
    plan,
    reminders,
    events,
    stats: buildStats(tasks, reminders, plan)
  };
}

export function createTask(userId, input) {
  const idempotencyKey = String(input.idempotencyKey || "").trim();
  if (idempotencyKey) {
    const cached = db.prepare("SELECT response_json FROM idempotency_keys WHERE key = ?").get(idempotencyKey);
    if (cached) return JSON.parse(cached.response_json);
  }

  const now = new Date().toISOString();
  const task = normalizeTask(userId, input, now);
  db.prepare(`
    INSERT INTO tasks
      (id, user_id, title, category, priority, due_at, earliest_at, estimate_minutes, reminder_minutes_before, recurrence, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    task.id,
    task.userId,
    task.title,
    task.category,
    task.priority,
    task.dueAt,
    task.earliestAt,
    task.estimateMinutes,
    task.reminderMinutesBefore,
    task.recurrence,
    task.status,
    now,
    now
  );

  const reminder = scheduleReminder(userId, task);
  logEvent(userId, "TASK_CREATED", task.id, { title: task.title, dueAt: task.dueAt, reminderJobId: reminder.id });
  const response = { task, reminder };

  if (idempotencyKey) {
    db.prepare("INSERT INTO idempotency_keys (key, response_json, created_at) VALUES (?, ?, ?)").run(idempotencyKey, JSON.stringify(response), now);
  }

  return response;
}

export function updateTaskStatus(userId, taskId, status) {
  const normalized = ["todo", "doing", "done", "cancelled"].includes(status) ? status : "todo";
  const now = new Date().toISOString();
  db.prepare("UPDATE tasks SET status = ?, updated_at = ? WHERE user_id = ? AND id = ?").run(normalized, now, userId, taskId);
  if (normalized === "done" || normalized === "cancelled") {
    db.prepare("UPDATE reminder_jobs SET status = ?, updated_at = ? WHERE user_id = ? AND task_id = ? AND status = 'queued'").run("cancelled", now, userId, taskId);
  }
  logEvent(userId, "TASK_STATUS_UPDATED", taskId, { status: normalized });
  return getTask(userId, taskId);
}

export function generatePlan(userId, date = todayKey()) {
  const tasks = getTasks(userId);
  const plan = buildDailyPlan(tasks, date);
  return savePlan(userId, date, plan);
}

export function drainReminders(nowInput = new Date().toISOString(), limit = 8, simulateFailure = false) {
  const now = new Date(nowInput).toISOString();
  const rows = db.prepare(`
    SELECT * FROM reminder_jobs
    WHERE status = 'queued'
      AND due_at <= ?
      AND (locked_until IS NULL OR locked_until <= ?)
    ORDER BY due_at ASC
    LIMIT ?
  `).all(now, now, Math.max(1, Math.min(Number(limit) || 8, 25)));

  const dispatched = [];
  const failed = [];

  for (const row of rows) {
    const lockedUntil = new Date(Date.now() + 30_000).toISOString();
    db.prepare("UPDATE reminder_jobs SET locked_until = ?, updated_at = ? WHERE id = ? AND status = 'queued'").run(lockedUntil, now, row.id);
    const shouldFail = simulateFailure && row.attempts < 1;
    if (shouldFail) {
      const nextDue = new Date(Date.now() + 60_000).toISOString();
      db.prepare(`
        UPDATE reminder_jobs
        SET attempts = attempts + 1, due_at = ?, locked_until = NULL, last_error = ?, updated_at = ?
        WHERE id = ?
      `).run(nextDue, "simulated provider failure", now, row.id);
      logEvent(row.user_id, "REMINDER_RETRY_SCHEDULED", row.id, { taskId: row.task_id, nextDue });
      failed.push(jobFromRow(db.prepare("SELECT * FROM reminder_jobs WHERE id = ?").get(row.id)));
    } else {
      db.prepare(`
        UPDATE reminder_jobs
        SET status = 'dispatched', attempts = attempts + 1, locked_until = NULL, last_error = NULL, updated_at = ?
        WHERE id = ?
      `).run(now, row.id);
      logEvent(row.user_id, "REMINDER_DISPATCHED", row.id, { taskId: row.task_id });
      dispatched.push(jobFromRow(db.prepare("SELECT * FROM reminder_jobs WHERE id = ?").get(row.id)));
    }
  }

  return { now, dispatched, failed, scanned: rows.length };
}

export function resetUser(userId) {
  db.prepare("DELETE FROM idempotency_keys WHERE key LIKE ?").run(`${userId}:%`);
  db.prepare("DELETE FROM audit_events WHERE user_id = ?").run(userId);
  db.prepare("DELETE FROM reminder_jobs WHERE user_id = ?").run(userId);
  db.prepare("DELETE FROM day_plans WHERE user_id = ?").run(userId);
  db.prepare("DELETE FROM tasks WHERE user_id = ?").run(userId);
  return getSnapshot(userId);
}

function seedDemoData(userId) {
  const count = db.prepare("SELECT COUNT(*) AS total FROM tasks WHERE user_id = ?").get(userId).total;
  if (count > 0) return;

  const now = new Date();
  const samples = [
    { title: "Pay electricity bill", category: "bill", priority: "urgent", hours: 5, estimateMinutes: 20, reminderMinutesBefore: 180 },
    { title: "Review DSA study block", category: "study", priority: "high", hours: 7, estimateMinutes: 90, reminderMinutesBefore: 30 },
    { title: "Buy groceries for dinner", category: "errand", priority: "medium", hours: 10, estimateMinutes: 45, reminderMinutesBefore: 60 },
    { title: "Walk 30 minutes", category: "habit", priority: "medium", hours: 12, estimateMinutes: 30, reminderMinutesBefore: 15 },
    { title: "Book dentist appointment", category: "appointment", priority: "low", hours: 30, estimateMinutes: 25, reminderMinutesBefore: 120 }
  ];

  for (const sample of samples) {
    const dueAt = new Date(now.getTime() + sample.hours * 60 * 60 * 1000).toISOString();
    createTask(userId, {
      ...sample,
      dueAt,
      recurrence: sample.category === "habit" ? "daily" : "none",
      idempotencyKey: `${userId}:seed:${sample.title}`
    });
  }
}

function normalizeTask(userId, input, now) {
  const id = String(input.id || randomUUID());
  const dueAt = input.dueAt ? new Date(input.dueAt).toISOString() : new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString();
  return {
    id,
    userId,
    title: String(input.title || "Untitled task").trim().slice(0, 140),
    category: normalizeEnum(input.category, ["work", "bill", "errand", "study", "habit", "appointment", "home"], "work"),
    priority: normalizeEnum(input.priority, ["urgent", "high", "medium", "low"], "medium"),
    dueAt,
    earliestAt: input.earliestAt ? new Date(input.earliestAt).toISOString() : null,
    estimateMinutes: Math.max(10, Math.min(Number(input.estimateMinutes) || 30, 240)),
    reminderMinutesBefore: Math.max(0, Math.min(Number(input.reminderMinutesBefore) || 30, 10_080)),
    recurrence: normalizeEnum(input.recurrence, ["none", "daily", "weekly", "monthly"], "none"),
    status: normalizeEnum(input.status, ["todo", "doing", "done", "cancelled"], "todo"),
    createdAt: now,
    updatedAt: now
  };
}

function scheduleReminder(userId, task) {
  const now = new Date().toISOString();
  const dueAt = new Date(new Date(task.dueAt).getTime() - task.reminderMinutesBefore * 60 * 1000).toISOString();
  const job = {
    id: `reminder-${task.id}`,
    userId,
    taskId: task.id,
    dueAt,
    status: "queued",
    attempts: 0,
    lockedUntil: null,
    lastError: null,
    createdAt: now,
    updatedAt: now
  };
  db.prepare(`
    INSERT OR REPLACE INTO reminder_jobs
      (id, user_id, task_id, due_at, status, attempts, locked_until, last_error, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(job.id, userId, task.id, dueAt, job.status, 0, null, null, now, now);
  return job;
}

function savePlan(userId, date, plan) {
  db.prepare(`
    INSERT INTO day_plans (user_id, plan_date, plan_json, generated_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(user_id, plan_date) DO UPDATE SET
      plan_json = excluded.plan_json,
      generated_at = excluded.generated_at
  `).run(userId, date, JSON.stringify(plan), plan.generatedAt);
  logEvent(userId, "PLAN_GENERATED", date, { loadPercent: plan.loadPercent, slots: plan.slots.length, unscheduled: plan.unscheduled.length });
  return plan;
}

function getPlan(userId, date) {
  const row = db.prepare("SELECT plan_json FROM day_plans WHERE user_id = ? AND plan_date = ?").get(userId, date);
  return row ? JSON.parse(row.plan_json) : null;
}

function getTasks(userId) {
  return db.prepare("SELECT * FROM tasks WHERE user_id = ? ORDER BY due_at ASC").all(userId).map(taskFromRow);
}

function getTask(userId, taskId) {
  const row = db.prepare("SELECT * FROM tasks WHERE user_id = ? AND id = ?").get(userId, taskId);
  return row ? taskFromRow(row) : null;
}

function getReminderJobs(userId) {
  return db.prepare("SELECT * FROM reminder_jobs WHERE user_id = ? ORDER BY due_at ASC").all(userId).map(jobFromRow);
}

function getAuditEvents(userId, limit) {
  return db.prepare("SELECT * FROM audit_events WHERE user_id = ? ORDER BY created_at DESC LIMIT ?").all(userId, limit).map((row) => ({
    id: row.id,
    userId: row.user_id,
    type: row.type,
    entityId: row.entity_id,
    detail: JSON.parse(row.detail_json),
    createdAt: row.created_at
  }));
}

function logEvent(userId, type, entityId, detail) {
  db.prepare("INSERT INTO audit_events (user_id, type, entity_id, detail_json, created_at) VALUES (?, ?, ?, ?, ?)").run(
    userId,
    type,
    entityId,
    JSON.stringify(detail),
    new Date().toISOString()
  );
}

function buildStats(tasks, reminders, plan) {
  const openTasks = tasks.filter((task) => task.status === "todo" || task.status === "doing");
  const overdue = openTasks.filter((task) => new Date(task.dueAt) < new Date());
  const queuedReminders = reminders.filter((job) => job.status === "queued");
  return {
    openTasks: openTasks.length,
    doneTasks: tasks.filter((task) => task.status === "done").length,
    overdueTasks: overdue.length,
    queuedReminders: queuedReminders.length,
    dispatchedReminders: reminders.filter((job) => job.status === "dispatched").length,
    planLoadPercent: plan.loadPercent,
    overloaded: plan.overload
  };
}

function taskFromRow(row) {
  return {
    id: row.id,
    userId: row.user_id,
    title: row.title,
    category: row.category,
    priority: row.priority,
    dueAt: row.due_at,
    earliestAt: row.earliest_at,
    estimateMinutes: row.estimate_minutes,
    reminderMinutesBefore: row.reminder_minutes_before,
    recurrence: row.recurrence,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function jobFromRow(row) {
  return {
    id: row.id,
    userId: row.user_id,
    taskId: row.task_id,
    dueAt: row.due_at,
    status: row.status,
    attempts: row.attempts,
    lockedUntil: row.locked_until,
    lastError: row.last_error,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function normalizeEnum(value, allowed, fallback) {
  return allowed.includes(value) ? value : fallback;
}
