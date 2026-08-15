import cors from "cors";
import express from "express";
import { createCache } from "./cache.js";
import {
  addDocument,
  createAccessGrant,
  drainReminders,
  generateAccessKit,
  getSnapshot,
  resetUser,
  revokeAccessGrant,
  updateDocumentStatus
} from "./store.js";

const app = express();
const port = Number(process.env.PORT || 4410);
const cache = await createCache();

app.use(cors());
app.use(express.json({ limit: "256kb" }));

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    service: "personal-emergency-document-vault-api",
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

app.post("/api/documents/:userId", async (req, res) => {
  const document = addDocument(req.params.userId, req.body);
  await invalidate(req.params.userId);
  res.status(201).json(document);
});

app.patch("/api/documents/:userId/:documentId/status", async (req, res) => {
  const document = updateDocumentStatus(req.params.userId, req.params.documentId, req.body.status);
  await invalidate(req.params.userId);
  if (!document) return res.status(404).json({ ok: false, error: "Document not found" });
  res.json(document);
});

app.post("/api/grants/:userId", async (req, res) => {
  const grant = createAccessGrant(req.params.userId, req.body);
  await invalidate(req.params.userId);
  res.status(201).json(grant);
});

app.post("/api/grants/:userId/:grantId/revoke", async (req, res) => {
  const grant = revokeAccessGrant(req.params.userId, req.params.grantId);
  await invalidate(req.params.userId);
  if (!grant) return res.status(404).json({ ok: false, error: "Grant not found" });
  res.json(grant);
});

app.post("/api/kits/:userId/:grantId", async (req, res) => {
  const kit = generateAccessKit(req.params.userId, req.params.grantId);
  await invalidate(req.params.userId);
  if (!kit) return res.status(404).json({ ok: false, error: "Active grant not found" });
  res.status(201).json(kit);
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
  console.log(`Emergency document vault API running on http://127.0.0.1:${port}`);
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
