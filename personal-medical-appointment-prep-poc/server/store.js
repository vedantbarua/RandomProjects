import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, "../data/appointment-prep.json");

let db = load();

export function getSnapshot(userId) {
  seedUser(userId);
  refreshReminderQueue(userId);
  const appointments = db.appointments.filter((item) => item.userId === userId);
  const symptoms = db.symptoms.filter((item) => item.userId === userId);
  const questions = db.questions.filter((item) => item.userId === userId);
  const tasks = db.tasks.filter((item) => item.userId === userId);
  const instructions = db.instructions.filter((item) => item.userId === userId);
  const summaries = db.summaries.filter((item) => item.userId === userId);
  const reminders = db.reminderJobs.filter((item) => item.userId === userId);
  const audits = db.auditEvents.filter((item) => item.userId === userId).slice(-18).reverse();
  const upcoming = appointments
    .filter((appt) => appt.status === "scheduled")
    .sort((a, b) => new Date(a.startsAt) - new Date(b.startsAt))[0];

  return {
    userId,
    appointments,
    symptoms,
    questions,
    tasks,
    instructions,
    summaries,
    reminders,
    audits,
    insights: {
      upcoming,
      openPrepTasks: tasks.filter((task) => task.status === "open"),
      unansweredQuestions: questions.filter((question) => question.status === "open"),
      activeSymptoms: symptoms.filter((symptom) => symptom.status === "active"),
      pendingInstructions: instructions.filter((instruction) => instruction.status !== "done"),
      queuedReminders: reminders.filter((job) => job.status === "queued"),
      retryingReminders: reminders.filter((job) => job.status === "queued" && job.attempts > 0),
      recentSummaries: summaries.slice(-5).reverse(),
      stats: {
        totalAppointments: appointments.length,
        openPrepTasks: tasks.filter((task) => task.status === "open").length,
        activeSymptoms: symptoms.filter((symptom) => symptom.status === "active").length,
        unansweredQuestions: questions.filter((question) => question.status === "open").length,
        pendingInstructions: instructions.filter((instruction) => instruction.status !== "done").length,
        queuedReminders: reminders.filter((job) => job.status === "queued").length
      }
    }
  };
}

export function addAppointment(userId, input) {
  seedUser(userId);
  const key = input.idempotencyKey || `${userId}:appointment:${input.clinician}:${input.startsAt}`;
  const replay = db.idempotencyKeys[key];
  if (replay) return db.appointments.find((appt) => appt.id === replay.entityId);

  const now = new Date().toISOString();
  const appointment = {
    id: `appt_${crypto.randomUUID()}`,
    userId,
    clinician: String(input.clinician || "Clinician"),
    specialty: String(input.specialty || "Primary care"),
    location: String(input.location || "Clinic"),
    startsAt: input.startsAt || addDays(7),
    reason: String(input.reason || "Follow-up visit"),
    status: "scheduled",
    createdAt: now,
    updatedAt: now
  };
  db.appointments.push(appointment);
  db.idempotencyKeys[key] = { entityId: appointment.id, createdAt: now };
  defaultPrepTasks(userId, appointment).forEach((task) => db.tasks.push(task));
  scheduleReminder(userId, appointment.id, "appointment_prep", "Prep checklist due", addHours(-48, appointment.startsAt));
  scheduleReminder(userId, appointment.id, "appointment_day", "Appointment starts soon", addHours(-2, appointment.startsAt));
  audit(userId, "appointment.added", appointment.id, `${appointment.specialty} appointment added`);
  save();
  return appointment;
}

export function addSymptom(userId, input) {
  seedUser(userId);
  const symptom = {
    id: `symptom_${crypto.randomUUID()}`,
    userId,
    title: String(input.title || "Symptom"),
    severity: normalizeSeverity(input.severity),
    startedAt: input.startedAt || new Date().toISOString(),
    frequency: String(input.frequency || "intermittent"),
    notes: String(input.notes || ""),
    status: "active",
    createdAt: new Date().toISOString()
  };
  db.symptoms.push(symptom);
  audit(userId, "symptom.added", symptom.id, `${symptom.title} added to timeline`);
  save();
  return symptom;
}

export function addQuestion(userId, input) {
  seedUser(userId);
  const question = {
    id: `question_${crypto.randomUUID()}`,
    userId,
    appointmentId: String(input.appointmentId || nextAppointmentId(userId) || ""),
    text: String(input.text || "Question for clinician"),
    priority: normalizePriority(input.priority),
    status: "open",
    createdAt: new Date().toISOString()
  };
  db.questions.push(question);
  audit(userId, "question.added", question.id, "Question added to appointment prep");
  save();
  return question;
}

export function completeTask(userId, taskId) {
  const task = db.tasks.find((item) => item.userId === userId && item.id === taskId);
  if (!task) return null;
  task.status = "done";
  task.completedAt = new Date().toISOString();
  audit(userId, "task.completed", task.id, `${task.title} completed`);
  save();
  return task;
}

export function updateInstructionStatus(userId, instructionId, status) {
  const instruction = db.instructions.find((item) => item.userId === userId && item.id === instructionId);
  if (!instruction) return null;
  instruction.status = ["open", "in_progress", "done"].includes(status) ? status : instruction.status;
  instruction.updatedAt = new Date().toISOString();
  audit(userId, "instruction.updated", instruction.id, `${instruction.title} marked ${instruction.status}`);
  save();
  return instruction;
}

export function generateSummary(userId, appointmentId = nextAppointmentId(userId)) {
  seedUser(userId);
  const appointment = db.appointments.find((item) => item.userId === userId && item.id === appointmentId);
  if (!appointment) return null;
  const payload = {
    appointment,
    symptoms: db.symptoms.filter((item) => item.userId === userId && item.status === "active"),
    questions: db.questions.filter((item) => item.userId === userId && item.status === "open"),
    openTasks: db.tasks.filter((item) => item.userId === userId && item.status === "open"),
    instructions: db.instructions.filter((item) => item.userId === userId),
    medicationSummary: db.medications.filter((item) => item.userId === userId)
  };
  const checksum = crypto.createHash("sha256").update(JSON.stringify(payload)).digest("hex").slice(0, 16);
  const summary = {
    id: `summary_${crypto.randomUUID()}`,
    userId,
    appointmentId: appointment.id,
    title: `${appointment.specialty} prep summary`,
    payload,
    checksum,
    status: "generated",
    createdAt: new Date().toISOString()
  };
  db.summaries.push(summary);
  audit(userId, "summary.generated", summary.id, `${summary.title} generated`);
  save();
  return summary;
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
      job.lastError = "Simulated reminder provider timeout";
      job.runAt = addMinutes(12);
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
  db.appointments = db.appointments.filter((item) => item.userId !== userId);
  db.symptoms = db.symptoms.filter((item) => item.userId !== userId);
  db.questions = db.questions.filter((item) => item.userId !== userId);
  db.tasks = db.tasks.filter((item) => item.userId !== userId);
  db.instructions = db.instructions.filter((item) => item.userId !== userId);
  db.summaries = db.summaries.filter((item) => item.userId !== userId);
  db.medications = db.medications.filter((item) => item.userId !== userId);
  db.reminderJobs = db.reminderJobs.filter((item) => item.userId !== userId);
  db.auditEvents = db.auditEvents.filter((item) => item.userId !== userId);
  for (const key of Object.keys(db.idempotencyKeys)) {
    if (key.startsWith(`${userId}:`)) delete db.idempotencyKeys[key];
  }
  save();
  return getSnapshot(userId);
}

function seedUser(userId) {
  if (db.appointments.some((appt) => appt.userId === userId)) return;
  const now = new Date().toISOString();
  const appointment = {
    id: `appt_${crypto.randomUUID()}`,
    userId,
    clinician: "Dr. Maya Chen",
    specialty: "Primary care",
    location: "Northside Family Clinic",
    startsAt: addDays(5),
    reason: "Follow up on blood pressure, fatigue, and lab work",
    status: "scheduled",
    createdAt: now,
    updatedAt: now
  };
  db.appointments.push(appointment);
  defaultPrepTasks(userId, appointment).forEach((task) => db.tasks.push(task));
  db.symptoms.push(
    {
      id: `symptom_${crypto.randomUUID()}`,
      userId,
      title: "Morning dizziness",
      severity: "medium",
      startedAt: addDays(-12),
      frequency: "3 times per week",
      notes: "Usually after standing up quickly.",
      status: "active",
      createdAt: now
    },
    {
      id: `symptom_${crypto.randomUUID()}`,
      userId,
      title: "Afternoon fatigue",
      severity: "low",
      startedAt: addDays(-20),
      frequency: "most weekdays",
      notes: "Worse after lunch.",
      status: "active",
      createdAt: now
    }
  );
  db.questions.push(
    {
      id: `question_${crypto.randomUUID()}`,
      userId,
      appointmentId: appointment.id,
      text: "Could my blood pressure medicine be causing dizziness?",
      priority: "high",
      status: "open",
      createdAt: now
    },
    {
      id: `question_${crypto.randomUUID()}`,
      userId,
      appointmentId: appointment.id,
      text: "Should I repeat labs before the next visit?",
      priority: "medium",
      status: "open",
      createdAt: now
    }
  );
  db.instructions.push(
    {
      id: `instruction_${crypto.randomUUID()}`,
      userId,
      appointmentId: appointment.id,
      title: "Schedule fasting labs",
      owner: "Patient",
      dueAt: addDays(2),
      status: "open",
      updatedAt: now
    },
    {
      id: `instruction_${crypto.randomUUID()}`,
      userId,
      appointmentId: appointment.id,
      title: "Bring home blood pressure readings",
      owner: "Patient",
      dueAt: addDays(4),
      status: "in_progress",
      updatedAt: now
    }
  );
  db.medications.push(
    { id: `med_${crypto.randomUUID()}`, userId, name: "Lisinopril", strength: "10 mg", schedule: "daily morning" },
    { id: `med_${crypto.randomUUID()}`, userId, name: "Metformin", strength: "500 mg", schedule: "daily dinner" }
  );
  scheduleReminder(userId, appointment.id, "appointment_prep", "Prep checklist due", addHours(-48, appointment.startsAt));
  scheduleReminder(userId, appointment.id, "appointment_day", "Appointment starts soon", addHours(-2, appointment.startsAt));
  db.instructions.forEach((instruction) => {
    if (instruction.userId === userId) scheduleReminder(userId, instruction.id, "follow_up", instruction.title, instruction.dueAt);
  });
  audit(userId, "prep.seeded", userId, "Appointment prep demo data created");
  save();
}

function defaultPrepTasks(userId, appointment) {
  const now = new Date().toISOString();
  return [
    "Update medication and allergy list",
    "Write top three questions",
    "Add symptom timeline notes",
    "Upload recent lab results",
    "Confirm insurance and clinic location"
  ].map((title) => ({
    id: `task_${crypto.randomUUID()}`,
    userId,
    appointmentId: appointment.id,
    title,
    status: "open",
    dueAt: addHours(-24, appointment.startsAt),
    createdAt: now,
    completedAt: null
  }));
}

function refreshReminderQueue(userId) {
  db.appointments
    .filter((appt) => appt.userId === userId && appt.status === "scheduled")
    .forEach((appt) => {
      scheduleReminder(userId, appt.id, "appointment_prep", "Prep checklist due", addHours(-48, appt.startsAt));
      scheduleReminder(userId, appt.id, "appointment_day", "Appointment starts soon", addHours(-2, appt.startsAt));
    });
  db.instructions
    .filter((item) => item.userId === userId && item.status !== "done")
    .forEach((instruction) => scheduleReminder(userId, instruction.id, "follow_up", instruction.title, instruction.dueAt));
}

function scheduleReminder(userId, entityId, kind, title, runAt) {
  const dedupeKey = `${userId}:${kind}:${entityId}`;
  if (db.reminderJobs.some((job) => job.dedupeKey === dedupeKey && job.status === "queued")) return;
  const now = new Date().toISOString();
  db.reminderJobs.push({
    id: `job_${crypto.randomUUID()}`,
    userId,
    entityId,
    dedupeKey,
    kind,
    title,
    runAt,
    status: "queued",
    attempts: 0,
    lastError: null,
    createdAt: now,
    updatedAt: now
  });
}

function nextAppointmentId(userId) {
  const appointment = db.appointments
    .filter((item) => item.userId === userId && item.status === "scheduled")
    .sort((a, b) => new Date(a.startsAt) - new Date(b.startsAt))[0];
  return appointment?.id || null;
}

function normalizeSeverity(value) {
  return ["low", "medium", "high"].includes(value) ? value : "medium";
}

function normalizePriority(value) {
  return ["low", "medium", "high"].includes(value) ? value : "medium";
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

function addHours(hours, from) {
  const date = new Date(from);
  date.setHours(date.getHours() + Number(hours));
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
      appointments: [],
      symptoms: [],
      questions: [],
      tasks: [],
      instructions: [],
      summaries: [],
      medications: [],
      reminderJobs: [],
      auditEvents: [],
      idempotencyKeys: {}
    };
  }
}

function save() {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));
}
