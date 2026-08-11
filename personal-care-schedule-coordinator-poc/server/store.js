import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { buildCareSchedule, buildRefillRisks, todayKey } from "./scheduler.js";

const dataDir = path.resolve("data");
mkdirSync(dataDir, { recursive: true });

const db = new DatabaseSync(path.join(dataDir, "care-coordinator.db"));

db.exec(`
  CREATE TABLE IF NOT EXISTS medications (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    dose TEXT NOT NULL,
    instructions TEXT NOT NULL,
    times_json TEXT NOT NULL,
    remaining_doses INTEGER NOT NULL,
    refill_threshold_days INTEGER NOT NULL,
    critical INTEGER NOT NULL,
    active INTEGER NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS appointments (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    title TEXT NOT NULL,
    provider TEXT NOT NULL,
    location TEXT NOT NULL,
    starts_at TEXT NOT NULL,
    reminder_minutes_before INTEGER NOT NULL,
    status TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS care_tasks (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    title TEXT NOT NULL,
    detail TEXT NOT NULL,
    due_at TEXT NOT NULL,
    priority TEXT NOT NULL,
    status TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS care_actions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    occurrence_id TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    action TEXT NOT NULL,
    note TEXT NOT NULL,
    occurred_at TEXT NOT NULL,
    UNIQUE(user_id, occurrence_id)
  );

  CREATE TABLE IF NOT EXISTS reminder_jobs (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    occurrence_id TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    kind TEXT NOT NULL,
    due_at TEXT NOT NULL,
    status TEXT NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0,
    locked_until TEXT,
    last_error TEXT,
    escalated INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS escalation_contacts (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    channel TEXT NOT NULL,
    destination TEXT NOT NULL,
    relationship TEXT NOT NULL
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

  CREATE INDEX IF NOT EXISTS idx_medications_user ON medications(user_id, active);
  CREATE INDEX IF NOT EXISTS idx_actions_occurrence ON care_actions(user_id, occurrence_id);
  CREATE INDEX IF NOT EXISTS idx_reminders_due ON reminder_jobs(status, due_at, locked_until);
  CREATE INDEX IF NOT EXISTS idx_audit_user_created ON audit_events(user_id, created_at);
`);

export function getSnapshot(userId, now = new Date().toISOString()) {
  seedDemoData(userId);
  rebuildReminderJobs(userId, todayKey(new Date(now)), now);
  const medications = getMedications(userId);
  const appointments = getAppointments(userId);
  const tasks = getCareTasks(userId);
  const actions = getActions(userId);
  const schedule = buildCareSchedule({ medications, appointments, tasks, actions }, todayKey(new Date(now)), now);
  const refillRisks = buildRefillRisks(medications);
  const reminders = getReminderJobs(userId);
  const contacts = getEscalationContacts(userId);
  const audits = getAuditEvents(userId, 14);

  return {
    userId,
    now,
    medications,
    appointments,
    tasks,
    schedule,
    refillRisks,
    reminders,
    contacts,
    audits,
    stats: buildStats(schedule, refillRisks, reminders)
  };
}

export function addMedication(userId, input) {
  const idempotencyKey = String(input.idempotencyKey || "").trim();
  if (idempotencyKey) {
    const cached = db.prepare("SELECT response_json FROM idempotency_keys WHERE key = ?").get(idempotencyKey);
    if (cached) return JSON.parse(cached.response_json);
  }

  const now = new Date().toISOString();
  const medication = normalizeMedication(userId, input, now);
  db.prepare(`
    INSERT INTO medications
      (id, user_id, name, dose, instructions, times_json, remaining_doses, refill_threshold_days, critical, active, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    medication.id,
    userId,
    medication.name,
    medication.dose,
    medication.instructions,
    JSON.stringify(medication.times),
    medication.remainingDoses,
    medication.refillThresholdDays,
    medication.critical ? 1 : 0,
    1,
    now
  );
  logEvent(userId, "MEDICATION_ADDED", medication.id, { name: medication.name, times: medication.times });
  const response = { medication };
  if (idempotencyKey) {
    db.prepare("INSERT INTO idempotency_keys (key, response_json, created_at) VALUES (?, ?, ?)").run(idempotencyKey, JSON.stringify(response), now);
  }
  return response;
}

export function recordCareAction(userId, input) {
  const idempotencyKey = String(input.idempotencyKey || "").trim();
  if (idempotencyKey) {
    const cached = db.prepare("SELECT response_json FROM idempotency_keys WHERE key = ?").get(idempotencyKey);
    if (cached) return JSON.parse(cached.response_json);
  }

  const action = normalizeAction(userId, input);
  db.prepare(`
    INSERT INTO care_actions (user_id, occurrence_id, entity_id, action, note, occurred_at)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id, occurrence_id) DO UPDATE SET
      action = excluded.action,
      note = excluded.note,
      occurred_at = excluded.occurred_at
  `).run(userId, action.occurrenceId, action.entityId, action.action, action.note, action.occurredAt);

  if (action.occurrenceId.startsWith("dose:") && action.action === "taken") {
    db.prepare("UPDATE medications SET remaining_doses = MAX(remaining_doses - 1, 0), updated_at = ? WHERE user_id = ? AND id = ?").run(action.occurredAt, userId, action.entityId);
  }

  db.prepare("UPDATE reminder_jobs SET status = ?, updated_at = ? WHERE user_id = ? AND occurrence_id = ? AND status = 'queued'").run("cancelled", action.occurredAt, userId, action.occurrenceId);
  logEvent(userId, `CARE_${action.action.toUpperCase()}`, action.occurrenceId, { entityId: action.entityId, note: action.note });

  const response = { action };
  if (idempotencyKey) {
    db.prepare("INSERT INTO idempotency_keys (key, response_json, created_at) VALUES (?, ?, ?)").run(idempotencyKey, JSON.stringify(response), action.occurredAt);
  }
  return response;
}

export function refillMedication(userId, medicationId, dosesAdded) {
  const now = new Date().toISOString();
  const added = Math.max(1, Math.min(Number(dosesAdded) || 30, 365));
  db.prepare("UPDATE medications SET remaining_doses = remaining_doses + ?, updated_at = ? WHERE user_id = ? AND id = ?").run(added, now, userId, medicationId);
  logEvent(userId, "REFILL_RECORDED", medicationId, { dosesAdded: added });
  return getMedications(userId).find((med) => med.id === medicationId) || null;
}

export function rebuildReminderJobs(userId, date = todayKey(), now = new Date().toISOString()) {
  const medications = getMedications(userId);
  const appointments = getAppointments(userId);
  const tasks = getCareTasks(userId);
  const actions = getActions(userId);
  const schedule = buildCareSchedule({ medications, appointments, tasks, actions }, date, now);
  const stmt = db.prepare(`
    INSERT OR IGNORE INTO reminder_jobs
      (id, user_id, occurrence_id, entity_id, kind, due_at, status, attempts, locked_until, last_error, escalated, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, 'queued', 0, NULL, NULL, 0, ?)
  `);

  for (const item of schedule) {
    if (["taken", "skipped", "cancelled"].includes(item.status)) continue;
    const dueAt = new Date(new Date(item.dueAt).getTime() - reminderLeadMinutes(item.kind) * 60000).toISOString();
    stmt.run(`reminder:${item.occurrenceId}`, userId, item.occurrenceId, item.entityId, item.kind, dueAt, now);
  }

  logEvent(userId, "SCHEDULE_REBUILT", date, { generated: schedule.length });
  return schedule;
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
  const escalated = [];

  for (const row of rows) {
    const lockUntil = new Date(Date.now() + 30_000).toISOString();
    db.prepare("UPDATE reminder_jobs SET locked_until = ?, updated_at = ? WHERE id = ? AND status = 'queued'").run(lockUntil, now, row.id);
    const shouldFail = simulateFailure && row.attempts < 1;

    if (shouldFail) {
      const nextDue = new Date(Date.now() + 90_000).toISOString();
      const shouldEscalate = row.kind === "medication" && row.attempts + 1 >= 1;
      db.prepare(`
        UPDATE reminder_jobs
        SET attempts = attempts + 1, due_at = ?, locked_until = NULL, last_error = ?, escalated = ?, updated_at = ?
        WHERE id = ?
      `).run(nextDue, "simulated reminder provider failure", shouldEscalate ? 1 : row.escalated, now, row.id);
      logEvent(row.user_id, shouldEscalate ? "REMINDER_ESCALATED" : "REMINDER_RETRY_SCHEDULED", row.occurrence_id, { nextDue, kind: row.kind });
      const updated = jobFromRow(db.prepare("SELECT * FROM reminder_jobs WHERE id = ?").get(row.id));
      failed.push(updated);
      if (shouldEscalate) escalated.push(updated);
    } else {
      db.prepare(`
        UPDATE reminder_jobs
        SET status = 'dispatched', attempts = attempts + 1, locked_until = NULL, last_error = NULL, updated_at = ?
        WHERE id = ?
      `).run(now, row.id);
      logEvent(row.user_id, "REMINDER_DISPATCHED", row.occurrence_id, { kind: row.kind });
      dispatched.push(jobFromRow(db.prepare("SELECT * FROM reminder_jobs WHERE id = ?").get(row.id)));
    }
  }

  return { now, scanned: rows.length, dispatched, failed, escalated };
}

export function resetUser(userId) {
  db.prepare("DELETE FROM idempotency_keys WHERE key LIKE ?").run(`${userId}:%`);
  db.prepare("DELETE FROM audit_events WHERE user_id = ?").run(userId);
  db.prepare("DELETE FROM reminder_jobs WHERE user_id = ?").run(userId);
  db.prepare("DELETE FROM care_actions WHERE user_id = ?").run(userId);
  db.prepare("DELETE FROM care_tasks WHERE user_id = ?").run(userId);
  db.prepare("DELETE FROM appointments WHERE user_id = ?").run(userId);
  db.prepare("DELETE FROM medications WHERE user_id = ?").run(userId);
  db.prepare("DELETE FROM escalation_contacts WHERE user_id = ?").run(userId);
  return getSnapshot(userId);
}

function seedDemoData(userId) {
  const count = db.prepare("SELECT COUNT(*) AS total FROM medications WHERE user_id = ?").get(userId).total;
  if (count > 0) return;

  const now = new Date();
  const today = todayKey(now);
  const tomorrow = todayKey(new Date(now.getTime() + 24 * 60 * 60 * 1000));
  const medicationStmt = db.prepare(`
    INSERT INTO medications
      (id, user_id, name, dose, instructions, times_json, remaining_doses, refill_threshold_days, critical, active, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
  `);
  const appointmentStmt = db.prepare(`
    INSERT INTO appointments
      (id, user_id, title, provider, location, starts_at, reminder_minutes_before, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'scheduled')
  `);
  const taskStmt = db.prepare("INSERT INTO care_tasks (id, user_id, title, detail, due_at, priority, status) VALUES (?, ?, ?, ?, ?, ?, 'todo')");
  const contactStmt = db.prepare("INSERT INTO escalation_contacts (id, user_id, name, channel, destination, relationship) VALUES (?, ?, ?, ?, ?, ?)");

  medicationStmt.run("med-bp", userId, "Lisinopril", "10mg", "Take with water after breakfast", JSON.stringify(["08:00"]), 8, 5, 1, now.toISOString());
  medicationStmt.run("med-vitd", userId, "Vitamin D", "1000 IU", "Take with food", JSON.stringify(["12:30"]), 24, 7, 0, now.toISOString());
  medicationStmt.run("med-metformin", userId, "Metformin", "500mg", "Take after meals", JSON.stringify(["09:00", "20:00"]), 18, 6, 1, now.toISOString());
  appointmentStmt.run("appt-physio", userId, "Physical therapy follow-up", "North Clinic", "Suite 204", `${today}T15:30:00.000`, 120);
  appointmentStmt.run("appt-lab", userId, "Blood work", "City Lab", "Main Street", `${tomorrow}T09:15:00.000`, 720);
  taskStmt.run("task-refill", userId, "Call pharmacy about refill", "Confirm pickup window for blood pressure medication", `${today}T17:00:00.000`, "high");
  taskStmt.run("task-record", userId, "Log evening blood pressure", "Record systolic, diastolic, and pulse", `${today}T21:00:00.000`, "normal");
  contactStmt.run("contact-1", userId, "Avery", "sms", "+1-555-0134", "sibling");
  logEvent(userId, "DEMO_SEEDED", userId, { medications: 3, appointments: 2, tasks: 2 });
}

function normalizeMedication(userId, input, now) {
  const times = Array.isArray(input.times) ? input.times : String(input.times || "08:00").split(",");
  return {
    id: String(input.id || randomUUID()),
    userId,
    name: String(input.name || "Medication").trim().slice(0, 120),
    dose: String(input.dose || "1 dose").trim().slice(0, 80),
    instructions: String(input.instructions || "Take as directed").trim().slice(0, 180),
    times: times.map((time) => String(time).trim()).filter((time) => /^\d{2}:\d{2}$/.test(time)).slice(0, 6),
    remainingDoses: Math.max(0, Math.min(Number(input.remainingDoses) || 14, 1000)),
    refillThresholdDays: Math.max(1, Math.min(Number(input.refillThresholdDays) || 5, 60)),
    critical: Boolean(input.critical),
    active: true,
    updatedAt: now
  };
}

function normalizeAction(userId, input) {
  return {
    userId,
    occurrenceId: String(input.occurrenceId || ""),
    entityId: String(input.entityId || ""),
    action: ["taken", "skipped", "late", "missed", "completed", "cancelled"].includes(input.action) ? input.action : "taken",
    note: String(input.note || "").slice(0, 180),
    occurredAt: input.occurredAt ? new Date(input.occurredAt).toISOString() : new Date().toISOString()
  };
}

function getMedications(userId) {
  return db.prepare("SELECT * FROM medications WHERE user_id = ? ORDER BY critical DESC, name ASC").all(userId).map(medicationFromRow);
}

function getAppointments(userId) {
  return db.prepare("SELECT * FROM appointments WHERE user_id = ? ORDER BY starts_at ASC").all(userId).map((row) => ({
    id: row.id,
    userId: row.user_id,
    title: row.title,
    provider: row.provider,
    location: row.location,
    startsAt: row.starts_at,
    reminderMinutesBefore: row.reminder_minutes_before,
    status: row.status
  }));
}

function getCareTasks(userId) {
  return db.prepare("SELECT * FROM care_tasks WHERE user_id = ? ORDER BY due_at ASC").all(userId).map((row) => ({
    id: row.id,
    userId: row.user_id,
    title: row.title,
    detail: row.detail,
    dueAt: row.due_at,
    priority: row.priority,
    status: row.status
  }));
}

function getActions(userId) {
  return db.prepare("SELECT * FROM care_actions WHERE user_id = ? ORDER BY occurred_at DESC").all(userId).map((row) => ({
    id: row.id,
    userId: row.user_id,
    occurrenceId: row.occurrence_id,
    entityId: row.entity_id,
    action: row.action,
    note: row.note,
    occurredAt: row.occurred_at
  }));
}

function getReminderJobs(userId) {
  return db.prepare("SELECT * FROM reminder_jobs WHERE user_id = ? ORDER BY due_at ASC").all(userId).map(jobFromRow);
}

function getEscalationContacts(userId) {
  return db.prepare("SELECT * FROM escalation_contacts WHERE user_id = ?").all(userId).map((row) => ({
    id: row.id,
    name: row.name,
    channel: row.channel,
    destination: row.destination,
    relationship: row.relationship
  }));
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

function medicationFromRow(row) {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    dose: row.dose,
    instructions: row.instructions,
    times: JSON.parse(row.times_json),
    remainingDoses: row.remaining_doses,
    refillThresholdDays: row.refill_threshold_days,
    critical: Boolean(row.critical),
    active: Boolean(row.active),
    updatedAt: row.updated_at
  };
}

function jobFromRow(row) {
  return {
    id: row.id,
    userId: row.user_id,
    occurrenceId: row.occurrence_id,
    entityId: row.entity_id,
    kind: row.kind,
    dueAt: row.due_at,
    status: row.status,
    attempts: row.attempts,
    lockedUntil: row.locked_until,
    lastError: row.last_error,
    escalated: Boolean(row.escalated),
    updatedAt: row.updated_at
  };
}

function buildStats(schedule, refillRisks, reminders) {
  return {
    dueSoon: schedule.filter((item) => item.status === "due-soon").length,
    lateOrMissed: schedule.filter((item) => item.status === "late" || item.status === "missed").length,
    completed: schedule.filter((item) => ["taken", "completed"].includes(item.status)).length,
    refillRisks: refillRisks.filter((risk) => risk.risk === "refill-soon").length,
    queuedReminders: reminders.filter((job) => job.status === "queued").length,
    escalations: reminders.filter((job) => job.escalated).length
  };
}

function reminderLeadMinutes(kind) {
  if (kind === "appointment") return 120;
  if (kind === "care-task") return 30;
  return 15;
}
