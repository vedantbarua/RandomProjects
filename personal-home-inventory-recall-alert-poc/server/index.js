import cors from "cors";
import express from "express";
import { createCache } from "./cache.js";
import { addItem, drainNotifications, getSnapshot, ingestRecallFeed, matchRecallsForUser, resetUser, updateAlertStatus } from "./store.js";

const app = express();
const port = Number(process.env.PORT || 4400);
const cache = await createCache();

app.use(cors());
app.use(express.json({ limit: "256kb" }));

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    service: "personal-home-inventory-recall-alert-api",
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

app.post("/api/items/:userId", async (req, res) => {
  const result = addItem(req.params.userId, req.body);
  await invalidate(req.params.userId);
  res.status(201).json(result);
});

app.post("/api/recalls/:userId/ingest", async (req, res) => {
  const result = ingestRecallFeed(req.params.userId, req.body.recalls);
  await invalidate(req.params.userId);
  res.json(result);
});

app.post("/api/recalls/:userId/match", async (req, res) => {
  const result = matchRecallsForUser(req.params.userId);
  await invalidate(req.params.userId);
  res.json(result);
});

app.patch("/api/alerts/:userId/:alertId/status", async (req, res) => {
  const alert = updateAlertStatus(req.params.userId, req.params.alertId, req.body.status);
  await invalidate(req.params.userId);
  if (!alert) return res.status(404).json({ ok: false, error: "Alert not found" });
  res.json(alert);
});

app.post("/api/notifications/drain", async (req, res) => {
  const result = drainNotifications(req.body.now, req.body.limit, Boolean(req.body.simulateFailure));
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
  console.log(`Home inventory recall alert API running on http://127.0.0.1:${port}`);
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
