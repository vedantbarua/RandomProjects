import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { evaluateSafety } from "./rules.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, "../data/medication-safety.json");

let db = load();

export function getSnapshot(userId) {
  seedUser(userId);
  refreshReminderQueue(userId);
  const medications = db.medications.filter((med) => med.userId === userId);
  const doseLogs = db.doseLogs.filter((log) => log.userId === userId).slice(-24).reverse();
  const caregivers = db.caregivers.filter((caregiver) => caregiver.userId === userId);
  const warnings = activeWarnings(userId);
  const reminders = db.reminderJobs.filter((job) => job.userId === userId);
  const audits = db.auditEvents.filter((event) => event.userId === userId).slice(-18).reverse();
  const refillRisk = warnings.filter((warning) => warning.type === "refill_risk");
  const interactionRisk = warnings.filter((warning) => warning.type === "interaction" || warning.type === "duplicate_ingredient");

  return {
    userId,
    medications,
    doseLogs,
    caregivers,
    warnings,
    reminders,
    audits,
    insights: {
      urgentWarnings: warnings.filter((warning) => warning.severity === "critical" || warning.severity === "high"),
      refillRisk,
      interactionRisk,
      queuedReminders: reminders.filter((job) => job.status === "queued"),
      retryingReminders: reminders.filter((job) => job.status === "queued" && job.attempts > 0),
      activeCaregivers: caregivers.filter((caregiver) => caregiver.escalationEnabled),
      stats: {
        totalMedications: medications.length,
        urgentWarnings: warnings.filter((warning) => warning.severity === "critical" || warning.severity === "high").length,
        refillRisk: refillRisk.length,
        interactionRisk: interactionRisk.length,
        queuedReminders: reminders.filter((job) => job.status === "queued").length,
        caregiverEscalations: caregivers.filter((caregiver) => caregiver.escalationEnabled).length
      }
    }
  };
}

export function addMedication(userId, input) {
  seedUser(userId);
  const key = input.idempotencyKey || `${userId}:medication:${input.name}:${input.strength}`;
  const replay = db.idempotencyKeys[key];
  if (replay) return db.medications.find((med) => med.id === replay.entityId);

  const now = new Date().toISOString();
  const medication = {
    id: `med_${crypto.randomUUID()}`,
    userId,
    name: String(input.name || "Medication"),
    ingredient: String(input.ingredient || input.name || "unknown"),
    strength: String(input.strength || "unknown"),
    schedule: String(input.schedule || "daily morning"),
    pharmacy: String(input.pharmacy || "Local pharmacy"),
    prescriber: String(input.prescriber || "Primary care"),
    supplyDaysRemaining: Number(input.supplyDaysRemaining ?? 14),
    refillThresholdDays: Number(input.refillThresholdDays ?? 7),
    criticalDose: Boolean(input.criticalDose ?? false),
    status: "active",
    createdAt: now,
    updatedAt: now
  };
  db.medications.push(medication);
  db.idempotencyKeys[key] = { entityId: medication.id, createdAt: now };
  scheduleReminder(userId, medication, "dose_reminder", nextDoseRunAt(medication));
  scheduleReminder(userId, medication, "refill_check", addDays(Math.max(0, medication.supplyDaysRemaining - medication.refillThresholdDays)));
  audit(userId, "medication.added", medication.id, `${medication.name} added to safety list`);
  save();
  return medication;
}

export function logDose(userId, medicationId, status = "taken") {
  const medication = db.medications.find((med) => med.userId === userId && med.id === medicationId);
  if (!medication) return null;
  const dose = {
    id: `dose_${crypto.randomUUID()}`,
    userId,
    medicationId,
    medicationName: medication.name,
    status: ["taken", "skipped", "snoozed"].includes(status) ? status : "taken",
    takenAt: new Date().toISOString()
  };
  db.doseLogs.push(dose);
  audit(userId, "dose.logged", dose.id, `${medication.name} marked ${dose.status}`);
  save();
  return dose;
}

export function refillMedication(userId, medicationId, supplyDays = 30) {
  const medication = db.medications.find((med) => med.userId === userId && med.id === medicationId);
  if (!medication) return null;
  medication.supplyDaysRemaining = Number(supplyDays) || 30;
  medication.updatedAt = new Date().toISOString();
  scheduleReminder(userId, medication, "refill_check", addDays(Math.max(0, medication.supplyDaysRemaining - medication.refillThresholdDays)));
  audit(userId, "refill.recorded", medication.id, `${medication.name} supply updated to ${medication.supplyDaysRemaining} days`);
  save();
  return medication;
}

export function resolveWarning(userId, warningId, note = "Reviewed") {
  const now = new Date().toISOString();
  const warning = {
    id: `resolution_${crypto.randomUUID()}`,
    userId,
    warningId,
    note: String(note || "Reviewed"),
    resolvedAt: now
  };
  db.warningResolutions.push(warning);
  audit(userId, "warning.resolved", warningId, `Warning resolved: ${warning.note}`);
  save();
  return warning;
}

export function toggleCaregiverEscalation(userId, enabled) {
  seedUser(userId);
  const caregiver = db.caregivers.find((candidate) => candidate.userId === userId);
  caregiver.escalationEnabled = enabled;
  caregiver.updatedAt = new Date().toISOString();
  audit(userId, "caregiver.escalation", caregiver.id, `${caregiver.name} escalation ${enabled ? "enabled" : "disabled"}`);
  save();
  return caregiver;
}

export function drainReminders(now = new Date().toISOString(), limit = 5, simulateFailure = false) {
  const dueAt = new Date(now).getTime();
  const due = db.reminderJobs
    .filter((job) => job.status === "queued" && new Date(job.runAt).getTime() <= dueAt)
    .sort((a, b) => new Date(a.runAt) - new Date(b.runAt))
    .slice(0, Number(limit) || 5);

  const dispatched = [];
  const failed = [];
  for (const job of due) {
    job.attempts += 1;
    job.updatedAt = new Date().toISOString();
    if (simulateFailure && job.attempts <= 2) {
      job.lastError = "Simulated SMS provider timeout";
      job.runAt = addMinutes(8);
      failed.push(job);
      audit(job.userId, "reminder.retry", job.id, `${job.kind} reminder rescheduled`);
    } else {
      job.status = "dispatched";
      job.lastError = null;
      dispatched.push(job);
      audit(job.userId, "reminder.dispatched", job.id, `${job.kind} reminder dispatched`);
    }
  }
  save();
  return { dispatched, failed };
}

export function resetUser(userId) {
  db.medications = db.medications.filter((med) => med.userId !== userId);
  db.doseLogs = db.doseLogs.filter((log) => log.userId !== userId);
  db.caregivers = db.caregivers.filter((caregiver) => caregiver.userId !== userId);
  db.reminderJobs = db.reminderJobs.filter((job) => job.userId !== userId);
  db.warningResolutions = db.warningResolutions.filter((warning) => warning.userId !== userId);
  db.auditEvents = db.auditEvents.filter((event) => event.userId !== userId);
  for (const key of Object.keys(db.idempotencyKeys)) {
    if (key.startsWith(`${userId}:`)) delete db.idempotencyKeys[key];
  }
  save();
  return getSnapshot(userId);
}

function activeWarnings(userId) {
  const medications = db.medications.filter((med) => med.userId === userId);
  const doseLogs = db.doseLogs.filter((log) => log.userId === userId);
  const resolved = new Set(db.warningResolutions.filter((item) => item.userId === userId).map((item) => item.warningId));
  return evaluateSafety(medications, doseLogs).filter((warning) => !resolved.has(warning.id));
}

function seedUser(userId) {
  if (db.medications.some((med) => med.userId === userId)) return;
  const now = new Date().toISOString();
  db.caregivers.push({
    id: `caregiver_${crypto.randomUUID()}`,
    userId,
    name: "Anika Patel",
    relationship: "Daughter",
    channel: "sms",
    destination: "+1 *** *** 2391",
    escalationEnabled: true,
    createdAt: now,
    updatedAt: now
  });

  [
    ["Warfarin", "warfarin", "5 mg", "daily evening", "Cedar Pharmacy", "Dr. Rao", 4, 7, true],
    ["Ibuprofen", "ibuprofen", "200 mg", "as needed", "Cedar Pharmacy", "Urgent Care", 12, 5, false],
    ["Lisinopril", "lisinopril", "10 mg", "daily morning", "Cedar Pharmacy", "Dr. Rao", 18, 7, true],
    ["Potassium supplement", "potassium", "20 mEq", "daily morning", "Mail order", "Dr. Rao", 3, 7, false],
    ["Metformin", "metformin", "500 mg", "daily dinner", "Cedar Pharmacy", "Dr. Chen", 28, 10, true]
  ].forEach(([name, ingredient, strength, schedule, pharmacy, prescriber, supplyDaysRemaining, refillThresholdDays, criticalDose]) => {
    const medication = {
      id: `med_${crypto.randomUUID()}`,
      userId,
      name,
      ingredient,
      strength,
      schedule,
      pharmacy,
      prescriber,
      supplyDaysRemaining,
      refillThresholdDays,
      criticalDose,
      status: "active",
      createdAt: now,
      updatedAt: now
    };
    db.medications.push(medication);
    scheduleReminder(userId, medication, "dose_reminder", nextDoseRunAt(medication));
    scheduleReminder(userId, medication, "refill_check", addDays(Math.max(0, Number(supplyDaysRemaining) - Number(refillThresholdDays))));
  });
  audit(userId, "safety.seeded", userId, "Medication safety demo data created");
  save();
}

function refreshReminderQueue(userId) {
  db.medications
    .filter((med) => med.userId === userId && med.status === "active")
    .forEach((med) => {
      scheduleReminder(userId, med, "dose_reminder", nextDoseRunAt(med));
      scheduleReminder(userId, med, "refill_check", addDays(Math.max(0, Number(med.supplyDaysRemaining) - Number(med.refillThresholdDays))));
    });
}

function scheduleReminder(userId, medication, kind, runAt) {
  const key = `${userId}:${kind}:${medication.id}`;
  if (db.reminderJobs.some((job) => job.dedupeKey === key && job.status === "queued")) return;
  const now = new Date().toISOString();
  db.reminderJobs.push({
    id: `job_${crypto.randomUUID()}`,
    userId,
    medicationId: medication.id,
    medicationName: medication.name,
    dedupeKey: key,
    kind,
    runAt,
    status: "queued",
    attempts: 0,
    lastError: null,
    createdAt: now,
    updatedAt: now
  });
}

function nextDoseRunAt(medication) {
  const date = new Date();
  if (medication.schedule.includes("evening") || medication.schedule.includes("dinner")) date.setHours(18, 0, 0, 0);
  else date.setHours(8, 0, 0, 0);
  if (date.getTime() < Date.now()) date.setDate(date.getDate() + 1);
  return date.toISOString();
}

function audit(userId, type, entityId, message) {
  db.auditEvents.push({
    id: db.auditEvents.length + 1,
    userId,
    type,
    entityId,
    message,
    createdAt: new Date().toISOString()
  });
}

function addDays(days) {
  const date = new Date();
  date.setDate(date.getDate() + Number(days));
  return date.toISOString();
}

function addMinutes(minutes) {
  const date = new Date();
  date.setMinutes(date.getMinutes() + Number(minutes));
  return date.toISOString();
}

function load() {
  try {
    return JSON.parse(fs.readFileSync(dbPath, "utf8"));
  } catch {
    return {
      medications: [],
      doseLogs: [],
      caregivers: [],
      reminderJobs: [],
      warningResolutions: [],
      auditEvents: [],
      idempotencyKeys: {}
    };
  }
}

function save() {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));
}
