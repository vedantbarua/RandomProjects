import cors from "cors";
import express from "express";
import { createCache } from "./cache.js";
import {
  addMedication,
  drainReminders,
  getSnapshot,
  logDose,
  refillMedication,
  resetUser,
  resolveWarning,
  toggleCaregiverEscalation
} from "./store.js";

const app = express();
const port = Number(process.env.PORT || 4420);
const cache = await createCache();

app.use(cors());
app.use(express.json({ limit: "256kb" }));

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    service: "personal-medication-interaction-safety-api",
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

app.post("/api/medications/:userId", async (req, res) => {
  const medication = addMedication(req.params.userId, req.body);
  await invalidate(req.params.userId);
  res.status(201).json(medication);
});

app.post("/api/doses/:userId/:medicationId", async (req, res) => {
  const dose = logDose(req.params.userId, req.params.medicationId, req.body.status || "taken");
  await invalidate(req.params.userId);
  if (!dose) return res.status(404).json({ ok: false, error: "Medication not found" });
  res.status(201).json(dose);
});

app.post("/api/refills/:userId/:medicationId", async (req, res) => {
  const medication = refillMedication(req.params.userId, req.params.medicationId, req.body.supplyDays);
  await invalidate(req.params.userId);
  if (!medication) return res.status(404).json({ ok: false, error: "Medication not found" });
  res.json(medication);
});

app.post("/api/warnings/:userId/:warningId/resolve", async (req, res) => {
  const warning = resolveWarning(req.params.userId, req.params.warningId, req.body.note);
  await invalidate(req.params.userId);
  res.json(warning);
});

app.post("/api/caregivers/:userId/escalation", async (req, res) => {
  const result = toggleCaregiverEscalation(req.params.userId, Boolean(req.body.enabled));
  await invalidate(req.params.userId);
  res.json(result);
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
  console.log(`Medication safety API running on http://127.0.0.1:${port}`);
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
