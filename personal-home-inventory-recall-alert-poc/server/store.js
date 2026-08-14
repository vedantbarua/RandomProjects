import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { buildInsights, matchRecallToItems } from "./matcher.js";

const dataDir = path.resolve("data");
mkdirSync(dataDir, { recursive: true });

const db = new DatabaseSync(path.join(dataDir, "recall-alerts.db"));

db.exec(`
  CREATE TABLE IF NOT EXISTS inventory_items (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    brand TEXT NOT NULL,
    model TEXT NOT NULL,
    serial_number TEXT NOT NULL,
    purchase_date TEXT NOT NULL,
    location TEXT NOT NULL,
    notes TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS recall_feed (
    id TEXT PRIMARY KEY,
    source_event_id TEXT NOT NULL UNIQUE,
    category TEXT NOT NULL,
    brand TEXT NOT NULL,
    model_pattern TEXT NOT NULL,
    serial_pattern TEXT NOT NULL,
    severity TEXT NOT NULL,
    title TEXT NOT NULL,
    hazard TEXT NOT NULL,
    remedy TEXT NOT NULL,
    published_at TEXT NOT NULL,
    ingested_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS recall_alerts (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    item_id TEXT NOT NULL,
    recall_id TEXT NOT NULL,
    severity TEXT NOT NULL,
    status TEXT NOT NULL,
    match_score INTEGER NOT NULL,
    match_reasons_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE(user_id, item_id, recall_id)
  );

  CREATE TABLE IF NOT EXISTS notification_jobs (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    alert_id TEXT NOT NULL,
    channel TEXT NOT NULL,
    run_at TEXT NOT NULL,
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

  CREATE INDEX IF NOT EXISTS idx_items_user ON inventory_items(user_id, brand, model);
  CREATE INDEX IF NOT EXISTS idx_alerts_user_status ON recall_alerts(user_id, status);
  CREATE INDEX IF NOT EXISTS idx_jobs_due ON notification_jobs(status, run_at, locked_until);
  CREATE INDEX IF NOT EXISTS idx_audits_user_created ON audit_events(user_id, created_at);
`);

export function getSnapshot(userId) {
  seedDemoData(userId);
  const items = getItems(userId);
  const recalls = getRecalls();
  const alerts = getAlerts(userId);
  const jobs = getJobs(userId);
  const audits = getAuditEvents(userId, 14);
  const insights = buildInsights({ items, recalls, alerts, jobs });
  return { userId, items, recalls, alerts, jobs, audits, insights };
}

export function addItem(userId, input) {
  const idempotencyKey = String(input.idempotencyKey || "").trim();
  if (idempotencyKey) {
    const cached = db.prepare("SELECT response_json FROM idempotency_keys WHERE key = ?").get(idempotencyKey);
    if (cached) return JSON.parse(cached.response_json);
  }

  const now = new Date().toISOString();
  const item = normalizeItem(userId, input, now);
  db.prepare(`
    INSERT INTO inventory_items
      (id, user_id, name, category, brand, model, serial_number, purchase_date, location, notes, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(item.id, userId, item.name, item.category, item.brand, item.model, item.serialNumber, item.purchaseDate, item.location, item.notes, now);
  logEvent(userId, "ITEM_ADDED", item.id, { name: item.name, brand: item.brand, model: item.model });
  const alerts = matchRecallsForUser(userId);
  const response = { item, alertsCreated: alerts.created.length };
  saveIdempotency(idempotencyKey, response, now);
  return response;
}

export function ingestRecallFeed(userId, recalls) {
  const now = new Date().toISOString();
  const inserted = [];
  const skipped = [];
  const insert = db.prepare(`
    INSERT OR IGNORE INTO recall_feed
      (id, source_event_id, category, brand, model_pattern, serial_pattern, severity, title, hazard, remedy, published_at, ingested_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const input of Array.isArray(recalls) ? recalls : []) {
    const recall = normalizeRecall(input, now);
    const result = insert.run(recall.id, recall.sourceEventId, recall.category, recall.brand, recall.modelPattern, recall.serialPattern, recall.severity, recall.title, recall.hazard, recall.remedy, recall.publishedAt, now);
    if (result.changes > 0) inserted.push(recall);
    else skipped.push(recall.sourceEventId);
  }

  if (inserted.length > 0) logEvent(userId, "RECALL_FEED_INGESTED", "recall-feed", { inserted: inserted.length, skipped: skipped.length });
  const matchResult = matchRecallsForUser(userId);
  return { inserted, skipped, alertsCreated: matchResult.created.length };
}

export function matchRecallsForUser(userId) {
  const items = getItems(userId);
  const recalls = getRecalls();
  const now = new Date().toISOString();
  const created = [];
  const deduped = [];
  const alertInsert = db.prepare(`
    INSERT OR IGNORE INTO recall_alerts
      (id, user_id, item_id, recall_id, severity, status, match_score, match_reasons_json, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, 'open', ?, ?, ?, ?)
  `);

  for (const recall of recalls) {
    for (const match of matchRecallToItems(recall, items)) {
      const alertId = `alert:${userId}:${match.item.id}:${recall.id}`;
      const result = alertInsert.run(alertId, userId, match.item.id, recall.id, recall.severity, match.score, JSON.stringify(match.reasons), now, now);
      if (result.changes > 0) {
        const alert = getAlert(userId, alertId);
        created.push(alert);
        scheduleNotification(userId, alert, recall.severity);
        logEvent(userId, "RECALL_ALERT_CREATED", alertId, { itemId: match.item.id, recallId: recall.id, score: match.score });
      } else {
        deduped.push(alertId);
      }
    }
  }

  return { created, deduped };
}

export function updateAlertStatus(userId, alertId, status) {
  const normalized = ["open", "acknowledged", "resolved", "dismissed"].includes(status) ? status : "open";
  const now = new Date().toISOString();
  db.prepare("UPDATE recall_alerts SET status = ?, updated_at = ? WHERE user_id = ? AND id = ?").run(normalized, now, userId, alertId);
  if (["resolved", "dismissed"].includes(normalized)) {
    db.prepare("UPDATE notification_jobs SET status = 'cancelled', updated_at = ? WHERE user_id = ? AND alert_id = ? AND status = 'queued'").run(now, userId, alertId);
  }
  logEvent(userId, "ALERT_STATUS_UPDATED", alertId, { status: normalized });
  return getAlert(userId, alertId);
}

export function drainNotifications(nowInput = new Date().toISOString(), limit = 8, simulateFailure = false) {
  const now = new Date(nowInput).toISOString();
  const rows = db.prepare(`
    SELECT * FROM notification_jobs
    WHERE status = 'queued'
      AND run_at <= ?
      AND (locked_until IS NULL OR locked_until <= ?)
    ORDER BY run_at ASC
    LIMIT ?
  `).all(now, now, Math.max(1, Math.min(Number(limit) || 8, 25)));
  const dispatched = [];
  const failed = [];

  for (const row of rows) {
    const lockedUntil = new Date(Date.now() + 30_000).toISOString();
    db.prepare("UPDATE notification_jobs SET locked_until = ?, updated_at = ? WHERE id = ? AND status = 'queued'").run(lockedUntil, now, row.id);
    const shouldFail = simulateFailure && row.attempts < 1;
    if (shouldFail) {
      const nextRun = new Date(Date.now() + 120_000).toISOString();
      db.prepare(`
        UPDATE notification_jobs
        SET attempts = attempts + 1, run_at = ?, locked_until = NULL, last_error = ?, updated_at = ?
        WHERE id = ?
      `).run(nextRun, "simulated notification provider failure", now, row.id);
      logEvent(row.user_id, "NOTIFICATION_RETRY_SCHEDULED", row.alert_id, { jobId: row.id, nextRun });
      failed.push(jobFromRow(db.prepare("SELECT * FROM notification_jobs WHERE id = ?").get(row.id)));
    } else {
      db.prepare(`
        UPDATE notification_jobs
        SET status = 'dispatched', attempts = attempts + 1, locked_until = NULL, last_error = NULL, updated_at = ?
        WHERE id = ?
      `).run(now, row.id);
      logEvent(row.user_id, "NOTIFICATION_DISPATCHED", row.alert_id, { jobId: row.id, channel: row.channel });
      dispatched.push(jobFromRow(db.prepare("SELECT * FROM notification_jobs WHERE id = ?").get(row.id)));
    }
  }

  return { now, scanned: rows.length, dispatched, failed };
}

export function resetUser(userId) {
  db.prepare("DELETE FROM idempotency_keys WHERE key LIKE ?").run(`${userId}:%`);
  db.prepare("DELETE FROM audit_events WHERE user_id = ?").run(userId);
  db.prepare("DELETE FROM notification_jobs WHERE user_id = ?").run(userId);
  db.prepare("DELETE FROM recall_alerts WHERE user_id = ?").run(userId);
  db.prepare("DELETE FROM inventory_items WHERE user_id = ?").run(userId);
  db.prepare("DELETE FROM recall_feed").run();
  return getSnapshot(userId);
}

function seedDemoData(userId) {
  const count = db.prepare("SELECT COUNT(*) AS total FROM inventory_items WHERE user_id = ?").get(userId).total;
  if (count > 0) return;
  addItem(userId, {
    id: "item-airfryer",
    name: "Kitchen air fryer",
    category: "appliance",
    brand: "CrispCo",
    model: "AF-500",
    serialNumber: "AF500-2199",
    purchaseDate: "2025-11-09",
    location: "Kitchen",
    notes: "Used weekly",
    idempotencyKey: `${userId}:seed:airfryer`
  });
  addItem(userId, {
    id: "item-baby-monitor",
    name: "Nursery baby monitor",
    category: "electronics",
    brand: "Nestling",
    model: "NM-2",
    serialNumber: "NM2-8812",
    purchaseDate: "2026-02-16",
    location: "Nursery",
    notes: "Battery-powered receiver",
    idempotencyKey: `${userId}:seed:baby-monitor`
  });
  addItem(userId, {
    id: "item-ladder",
    name: "Garage folding ladder",
    category: "home",
    brand: "SafeStep",
    model: "SS-6",
    serialNumber: "SS6-1402",
    purchaseDate: "2024-08-21",
    location: "Garage",
    notes: "Aluminum 6 foot ladder",
    idempotencyKey: `${userId}:seed:ladder`
  });
  ingestRecallFeed(userId, demoRecalls());
  logEvent(userId, "DEMO_SEEDED", userId, { items: 3, recalls: 3 });
}

function demoRecalls() {
  return [
    {
      sourceEventId: "recall-crispco-af500-heat",
      category: "appliance",
      brand: "CrispCo",
      modelPattern: "AF-500",
      serialPattern: "AF500-*",
      severity: "critical",
      title: "CrispCo AF-500 overheating recall",
      hazard: "Heating element can overheat during high-temperature cooking.",
      remedy: "Stop use and request a replacement basket kit.",
      publishedAt: "2026-08-01T12:00:00.000Z"
    },
    {
      sourceEventId: "recall-nestling-nm2-battery",
      category: "electronics",
      brand: "Nestling",
      modelPattern: "NM-2",
      serialPattern: "*",
      severity: "high",
      title: "Nestling NM-2 battery swelling recall",
      hazard: "Receiver battery may swell after repeated charging.",
      remedy: "Request free replacement receiver.",
      publishedAt: "2026-07-18T12:00:00.000Z"
    },
    {
      sourceEventId: "recall-safestep-ss4",
      category: "home",
      brand: "SafeStep",
      modelPattern: "SS-4",
      serialPattern: "*",
      severity: "medium",
      title: "SafeStep SS-4 hinge inspection",
      hazard: "Selected 4 foot ladders may have loose hinge rivets.",
      remedy: "Inspect hinge and contact support if loose.",
      publishedAt: "2026-06-02T12:00:00.000Z"
    }
  ];
}

function normalizeItem(userId, input, now) {
  return {
    id: String(input.id || randomUUID()),
    userId,
    name: String(input.name || "Household item").trim().slice(0, 120),
    category: normalizeEnum(input.category, ["appliance", "electronics", "furniture", "vehicle", "home", "baby", "tool"], "home"),
    brand: String(input.brand || "Unknown").trim().slice(0, 80),
    model: String(input.model || "Unknown").trim().slice(0, 80),
    serialNumber: String(input.serialNumber || "not-recorded").trim().slice(0, 100),
    purchaseDate: String(input.purchaseDate || new Date().toISOString().slice(0, 10)).slice(0, 10),
    location: String(input.location || "Home").trim().slice(0, 80),
    notes: String(input.notes || "").trim().slice(0, 200),
    createdAt: now
  };
}

function normalizeRecall(input, now) {
  return {
    id: String(input.id || randomUUID()),
    sourceEventId: String(input.sourceEventId || input.id || randomUUID()),
    category: normalizeEnum(input.category, ["appliance", "electronics", "furniture", "vehicle", "home", "baby", "tool"], "home"),
    brand: String(input.brand || "Unknown").trim().slice(0, 80),
    modelPattern: String(input.modelPattern || "*").trim().slice(0, 80),
    serialPattern: String(input.serialPattern || "*").trim().slice(0, 100),
    severity: normalizeEnum(input.severity, ["critical", "high", "medium", "low"], "medium"),
    title: String(input.title || "Recall notice").trim().slice(0, 160),
    hazard: String(input.hazard || "Potential safety issue").trim().slice(0, 240),
    remedy: String(input.remedy || "Contact provider for next steps").trim().slice(0, 240),
    publishedAt: input.publishedAt ? new Date(input.publishedAt).toISOString() : now,
    ingestedAt: now
  };
}

function scheduleNotification(userId, alert, severity) {
  const now = new Date().toISOString();
  const runAt = severity === "critical" ? now : new Date(Date.now() + 30 * 60 * 1000).toISOString();
  db.prepare(`
    INSERT OR IGNORE INTO notification_jobs
      (id, user_id, alert_id, channel, run_at, status, attempts, locked_until, last_error, created_at, updated_at)
    VALUES (?, ?, ?, 'push', ?, 'queued', 0, NULL, NULL, ?, ?)
  `).run(`notify:${alert.id}`, userId, alert.id, runAt, now, now);
}

function getItems(userId) {
  return db.prepare("SELECT * FROM inventory_items WHERE user_id = ? ORDER BY created_at DESC").all(userId).map(itemFromRow);
}

function getRecalls() {
  return db.prepare("SELECT * FROM recall_feed ORDER BY published_at DESC").all().map(recallFromRow);
}

function getAlerts(userId) {
  return db.prepare("SELECT * FROM recall_alerts WHERE user_id = ? ORDER BY created_at DESC").all(userId).map(alertFromRow);
}

function getAlert(userId, alertId) {
  const row = db.prepare("SELECT * FROM recall_alerts WHERE user_id = ? AND id = ?").get(userId, alertId);
  return row ? alertFromRow(row) : null;
}

function getJobs(userId) {
  return db.prepare("SELECT * FROM notification_jobs WHERE user_id = ? ORDER BY run_at ASC").all(userId).map(jobFromRow);
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

function itemFromRow(row) {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    category: row.category,
    brand: row.brand,
    model: row.model,
    serialNumber: row.serial_number,
    purchaseDate: row.purchase_date,
    location: row.location,
    notes: row.notes,
    createdAt: row.created_at
  };
}

function recallFromRow(row) {
  return {
    id: row.id,
    sourceEventId: row.source_event_id,
    category: row.category,
    brand: row.brand,
    modelPattern: row.model_pattern,
    serialPattern: row.serial_pattern,
    severity: row.severity,
    title: row.title,
    hazard: row.hazard,
    remedy: row.remedy,
    publishedAt: row.published_at,
    ingestedAt: row.ingested_at
  };
}

function alertFromRow(row) {
  return {
    id: row.id,
    userId: row.user_id,
    itemId: row.item_id,
    recallId: row.recall_id,
    severity: row.severity,
    status: row.status,
    matchScore: row.match_score,
    matchReasons: JSON.parse(row.match_reasons_json),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function jobFromRow(row) {
  return {
    id: row.id,
    userId: row.user_id,
    alertId: row.alert_id,
    channel: row.channel,
    runAt: row.run_at,
    status: row.status,
    attempts: row.attempts,
    lockedUntil: row.locked_until,
    lastError: row.last_error,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
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

function saveIdempotency(key, response, createdAt) {
  if (!key) return;
  db.prepare("INSERT INTO idempotency_keys (key, response_json, created_at) VALUES (?, ?, ?)").run(key, JSON.stringify(response), createdAt);
}

function normalizeEnum(value, allowed, fallback) {
  return allowed.includes(value) ? value : fallback;
}
