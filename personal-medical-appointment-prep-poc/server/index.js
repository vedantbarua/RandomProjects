import cors from "cors";
import express from "express";
import { createCache } from "./cache.js";
import {
  addAppointment,
  addQuestion,
  addSymptom,
  completeTask,
  drainReminders,
  generateSummary,
  getSnapshot,
  resetUser,
  updateInstructionStatus
} from "./store.js";

const app = express();
const port = Number(process.env.PORT || 4430);
const cache = await createCache();

app.use(cors());
app.use(express.json({ limit: "256kb" }));

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    service: "personal-medical-appointment-prep-api",
    cache: cache.mode,
    timestamp: new Date().toISOString()
  });
});

app.get("/api/snapshot/:userId", async (req, res) => {
  const key = snapshotKey(req.params.userId);
  const cached = await cache.get(key);
  if (cached) return res.json({ ...JSON.parse(cached), cacheHit: true });
  const snapshot = getSnapshot(req.params.userId);
  await cache.set(key, JSON.stringify(snapshot), 20);
  res.json({ ...snapshot, cacheHit: false });
});

app.post("/api/appointments/:userId", async (req, res) => {
  const appointment = addAppointment(req.params.userId, req.body);
  await invalidate(req.params.userId);
  res.status(201).json(appointment);
});

app.post("/api/symptoms/:userId", async (req, res) => {
  const symptom = addSymptom(req.params.userId, req.body);
  await invalidate(req.params.userId);
  res.status(201).json(symptom);
});

app.post("/api/questions/:userId", async (req, res) => {
  const question = addQuestion(req.params.userId, req.body);
  await invalidate(req.params.userId);
  res.status(201).json(question);
});

app.post("/api/tasks/:userId/:taskId/complete", async (req, res) => {
  const task = completeTask(req.params.userId, req.params.taskId);
  await invalidate(req.params.userId);
  if (!task) return res.status(404).json({ ok: false, error: "Task not found" });
  res.json(task);
});

app.patch("/api/instructions/:userId/:instructionId/status", async (req, res) => {
  const instruction = updateInstructionStatus(req.params.userId, req.params.instructionId, req.body.status);
  await invalidate(req.params.userId);
  if (!instruction) return res.status(404).json({ ok: false, error: "Instruction not found" });
  res.json(instruction);
});

app.post("/api/summaries/:userId", async (req, res) => {
  const summary = generateSummary(req.params.userId, req.body.appointmentId);
  await invalidate(req.params.userId);
  if (!summary) return res.status(404).json({ ok: false, error: "Appointment not found" });
  res.status(201).json(summary);
});

app.post("/api/reminders/drain", async (req, res) => {
  const result = drainReminders(req.body.now, req.body.limit, Boolean(req.body.simulateFailure));
  const affectedUsers = new Set([...result.dispatched, ...result.failed].map((job) => job.userId));
  await Promise.all(Array.from(affectedUsers).map((userId) => invalidate(userId)));
  res.json(result);
});

app.post("/api/reset/:userId", async (req, res) => {
  await invalidate(req.params.userId);
  res.json(resetUser(req.params.userId));
});

app.use((err, _req, res, _next) => {
  res.status(500).json({ ok: false, error: err.message || "Internal server error" });
});

const server = app.listen(port, "127.0.0.1", () => {
  console.log(`Medical appointment prep API running on http://127.0.0.1:${port}`);
});

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

async function invalidate(userId) {
  await cache.del(snapshotKey(userId));
}

function snapshotKey(userId) {
  return `snapshot:${userId}`;
}

async function shutdown() {
  server.close();
  await cache.close();
  process.exit(0);
}
