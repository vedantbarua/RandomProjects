import cors from "cors";
import express from "express";
import { createCache } from "./cache.js";
import { addMedication, drainReminders, getSnapshot, rebuildReminderJobs, recordCareAction, refillMedication, resetUser } from "./store.js";

const app = express();
const port = Number(process.env.PORT || 4380);
const cache = await createCache();

app.use(cors());
app.use(express.json({ limit: "256kb" }));

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    service: "personal-care-schedule-coordinator-api",
    cache: cache.mode,
    timestamp: new Date().toISOString()
  });
});

app.get("/api/snapshot/:userId", async (req, res) => {
  const key = snapshotKey(req.params.userId);
  const cached = await cache.get(key);
  if (cached) return res.json({ ...JSON.parse(cached), cacheHit: true });
  const snapshot = getSnapshot(req.params.userId, req.query.now);
  await cache.set(key, JSON.stringify(snapshot), 20);
  res.json({ ...snapshot, cacheHit: false });
});

app.post("/api/medications/:userId", async (req, res) => {
  const result = addMedication(req.params.userId, req.body);
  await invalidate(req.params.userId);
  res.status(201).json(result);
});

app.post("/api/actions/:userId", async (req, res) => {
  const result = recordCareAction(req.params.userId, req.body);
  await invalidate(req.params.userId);
  res.json(result);
});

app.post("/api/refills/:userId/:medicationId", async (req, res) => {
  const medication = refillMedication(req.params.userId, req.params.medicationId, req.body.dosesAdded);
  await invalidate(req.params.userId);
  if (!medication) return res.status(404).json({ ok: false, error: "Medication not found" });
  res.json(medication);
});

app.post("/api/schedule/:userId/rebuild", async (req, res) => {
  const schedule = rebuildReminderJobs(req.params.userId, req.body.date, req.body.now);
  await invalidate(req.params.userId);
  res.json({ schedule });
});

app.post("/api/reminders/drain", async (req, res) => {
  const result = drainReminders(req.body.now, req.body.limit, Boolean(req.body.simulateFailure));
  const affectedUsers = new Set([...result.dispatched, ...result.failed, ...result.escalated].map((job) => job.userId));
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
  console.log(`Personal care coordinator API running on http://127.0.0.1:${port}`);
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
