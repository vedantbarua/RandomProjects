import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { buildWarrantyInsights, checklistFor, nextFollowUpFor, warrantyEndsAt } from "./rules.js";

const dataDir = path.resolve("data");
mkdirSync(dataDir, { recursive: true });

const db = new DatabaseSync(path.join(dataDir, "warranty-claims.db"));

db.exec(`
  CREATE TABLE IF NOT EXISTS owned_items (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    brand TEXT NOT NULL,
    model TEXT NOT NULL,
    serial_number TEXT NOT NULL,
    purchase_date TEXT NOT NULL,
    warranty_months INTEGER NOT NULL,
    warranty_ends_at TEXT NOT NULL,
    provider TEXT NOT NULL,
    receipt_ref TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS claim_cases (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    item_id TEXT NOT NULL,
    issue TEXT NOT NULL,
    status TEXT NOT NULL,
    required_documents_json TEXT NOT NULL,
    submitted_at TEXT,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS claim_documents (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    claim_id TEXT NOT NULL,
    type TEXT NOT NULL,
    file_ref TEXT NOT NULL,
    verified INTEGER NOT NULL,
    uploaded_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS follow_up_jobs (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    claim_id TEXT,
    item_id TEXT,
    kind TEXT NOT NULL,
    run_at TEXT NOT NULL,
    status TEXT NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0,
    locked_until TEXT,
    last_error TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS contact_attempts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    claim_id TEXT NOT NULL,
    provider TEXT NOT NULL,
    channel TEXT NOT NULL,
    outcome TEXT NOT NULL,
    note TEXT NOT NULL,
    attempted_at TEXT NOT NULL
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

  CREATE INDEX IF NOT EXISTS idx_items_user_expiry ON owned_items(user_id, warranty_ends_at);
  CREATE INDEX IF NOT EXISTS idx_claims_user_status ON claim_cases(user_id, status);
  CREATE INDEX IF NOT EXISTS idx_jobs_due ON follow_up_jobs(status, run_at, locked_until);
  CREATE INDEX IF NOT EXISTS idx_audits_user_created ON audit_events(user_id, created_at);
`);

export function getSnapshot(userId) {
  seedDemoData(userId);
  rebuildExpiryJobs(userId);
  const items = getItems(userId);
  const claims = getClaims(userId);
  const documents = getDocuments(userId);
  const jobs = getJobs(userId);
  const contacts = getContactAttempts(userId);
  const audits = getAuditEvents(userId, 14);
  const insights = buildWarrantyInsights(items, claims, documents, jobs);

  return { userId, items, claims, documents, jobs, contacts, audits, insights };
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
    INSERT INTO owned_items
      (id, user_id, name, category, brand, model, serial_number, purchase_date, warranty_months, warranty_ends_at, provider, receipt_ref, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(item.id, userId, item.name, item.category, item.brand, item.model, item.serialNumber, item.purchaseDate, item.warrantyMonths, item.warrantyEndsAt, item.provider, item.receiptRef, now);
  scheduleExpiryJob(userId, item);
  logEvent(userId, "ITEM_ADDED", item.id, { name: item.name, warrantyEndsAt: item.warrantyEndsAt });
  const response = { item };
  saveIdempotency(idempotencyKey, response, now);
  return response;
}

export function startClaim(userId, input) {
  const idempotencyKey = String(input.idempotencyKey || "").trim();
  if (idempotencyKey) {
    const cached = db.prepare("SELECT response_json FROM idempotency_keys WHERE key = ?").get(idempotencyKey);
    if (cached) return JSON.parse(cached.response_json);
  }

  const now = new Date().toISOString();
  const item = getItem(userId, input.itemId);
  if (!item) throw new Error("Item not found");
  const claim = {
    id: String(input.id || randomUUID()),
    userId,
    itemId: item.id,
    issue: String(input.issue || "Service issue").trim().slice(0, 240),
    status: "draft",
    requiredDocuments: checklistFor(item.category),
    submittedAt: null,
    updatedAt: now
  };
  db.prepare(`
    INSERT INTO claim_cases (id, user_id, item_id, issue, status, required_documents_json, submitted_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, NULL, ?)
  `).run(claim.id, userId, claim.itemId, claim.issue, claim.status, JSON.stringify(claim.requiredDocuments), now);
  scheduleFollowUp(userId, claim, item, "claim-follow-up", nextFollowUpFor(claim.status));
  logEvent(userId, "CLAIM_STARTED", claim.id, { itemId: item.id, issue: claim.issue });
  const response = { claim };
  saveIdempotency(idempotencyKey, response, now);
  return response;
}

export function updateClaimStatus(userId, claimId, status) {
  const normalized = ["draft", "submitted", "waiting", "approved", "denied", "completed", "withdrawn"].includes(status) ? status : "draft";
  const now = new Date().toISOString();
  const submittedAt = normalized === "submitted" ? now : null;
  db.prepare(`
    UPDATE claim_cases
    SET status = ?, submitted_at = COALESCE(submitted_at, ?), updated_at = ?
    WHERE user_id = ? AND id = ?
  `).run(normalized, submittedAt, now, userId, claimId);
  const claim = getClaim(userId, claimId);
  if (!claim) return null;
  const item = getItem(userId, claim.itemId);
  if (["completed", "denied", "withdrawn"].includes(normalized)) {
    db.prepare("UPDATE follow_up_jobs SET status = 'cancelled', updated_at = ? WHERE user_id = ? AND claim_id = ? AND status = 'queued'").run(now, userId, claimId);
  } else {
    scheduleFollowUp(userId, claim, item, "claim-follow-up", nextFollowUpFor(normalized));
  }
  logEvent(userId, "CLAIM_STATUS_UPDATED", claimId, { status: normalized });
  return claim;
}

export function addDocument(userId, input) {
  const claim = getClaim(userId, input.claimId);
  if (!claim) throw new Error("Claim not found");
  const now = new Date().toISOString();
  const document = {
    id: String(input.id || randomUUID()),
    userId,
    claimId: claim.id,
    type: String(input.type || claim.requiredDocuments[0] || "receipt").trim().slice(0, 80),
    fileRef: String(input.fileRef || `file://${claim.id}/${Date.now()}`).trim().slice(0, 160),
    verified: Boolean(input.verified ?? true),
    uploadedAt: now
  };
  db.prepare(`
    INSERT INTO claim_documents (id, user_id, claim_id, type, file_ref, verified, uploaded_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(document.id, userId, document.claimId, document.type, document.fileRef, document.verified ? 1 : 0, now);
  logEvent(userId, "DOCUMENT_ADDED", document.claimId, { type: document.type, fileRef: document.fileRef });
  return { document };
}

export function drainJobs(nowInput = new Date().toISOString(), limit = 8, simulateFailure = false) {
  const now = new Date(nowInput).toISOString();
  const rows = db.prepare(`
    SELECT * FROM follow_up_jobs
    WHERE status = 'queued'
      AND run_at <= ?
      AND (locked_until IS NULL OR locked_until <= ?)
    ORDER BY run_at ASC
    LIMIT ?
  `).all(now, now, Math.max(1, Math.min(Number(limit) || 8, 25)));
  const dispatched = [];
  const failed = [];
  const contacts = [];

  for (const row of rows) {
    const lockUntil = new Date(Date.now() + 30_000).toISOString();
    db.prepare("UPDATE follow_up_jobs SET locked_until = ?, updated_at = ? WHERE id = ? AND status = 'queued'").run(lockUntil, now, row.id);
    const shouldFail = simulateFailure && row.attempts < 1;
    if (shouldFail) {
      const nextRun = new Date(Date.now() + 120_000).toISOString();
      db.prepare(`
        UPDATE follow_up_jobs
        SET attempts = attempts + 1, run_at = ?, locked_until = NULL, last_error = ?, updated_at = ?
        WHERE id = ?
      `).run(nextRun, "simulated provider contact failure", now, row.id);
      logEvent(row.user_id, "FOLLOW_UP_RETRY_SCHEDULED", row.id, { nextRun, kind: row.kind });
      failed.push(jobFromRow(db.prepare("SELECT * FROM follow_up_jobs WHERE id = ?").get(row.id)));
    } else {
      db.prepare(`
        UPDATE follow_up_jobs
        SET status = 'dispatched', attempts = attempts + 1, locked_until = NULL, last_error = NULL, updated_at = ?
        WHERE id = ?
      `).run(now, row.id);
      if (row.claim_id) {
        const contact = recordContact(row.user_id, row.claim_id, "portal", "follow-up sent", "Automated follow-up job dispatched", now);
        contacts.push(contact);
      }
      logEvent(row.user_id, "FOLLOW_UP_DISPATCHED", row.id, { kind: row.kind });
      dispatched.push(jobFromRow(db.prepare("SELECT * FROM follow_up_jobs WHERE id = ?").get(row.id)));
    }
  }

  return { now, scanned: rows.length, dispatched, failed, contacts };
}

export function resetUser(userId) {
  db.prepare("DELETE FROM idempotency_keys WHERE key LIKE ?").run(`${userId}:%`);
  db.prepare("DELETE FROM audit_events WHERE user_id = ?").run(userId);
  db.prepare("DELETE FROM contact_attempts WHERE user_id = ?").run(userId);
  db.prepare("DELETE FROM follow_up_jobs WHERE user_id = ?").run(userId);
  db.prepare("DELETE FROM claim_documents WHERE user_id = ?").run(userId);
  db.prepare("DELETE FROM claim_cases WHERE user_id = ?").run(userId);
  db.prepare("DELETE FROM owned_items WHERE user_id = ?").run(userId);
  return getSnapshot(userId);
}

function seedDemoData(userId) {
  const count = db.prepare("SELECT COUNT(*) AS total FROM owned_items WHERE user_id = ?").get(userId).total;
  if (count > 0) return;
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const oldPurchase = new Date(now);
  oldPurchase.setMonth(oldPurchase.getMonth() - 11);
  const olderPurchase = new Date(now);
  olderPurchase.setMonth(olderPurchase.getMonth() - 22);
  const recentPurchase = new Date(now);
  recentPurchase.setMonth(recentPurchase.getMonth() - 2);

  const washer = addItem(userId, {
    id: "item-washer",
    name: "Front-load washer",
    category: "appliance",
    brand: "HomePro",
    model: "HP-W900",
    serialNumber: "WASH-3391",
    purchaseDate: oldPurchase.toISOString().slice(0, 10),
    warrantyMonths: 12,
    provider: "HomePro Warranty",
    receiptRef: "receipt://washer-2025",
    idempotencyKey: `${userId}:seed:washer`
  }).item;
  addItem(userId, {
    id: "item-laptop",
    name: "Work laptop",
    category: "electronics",
    brand: "Northstar",
    model: "N14",
    serialNumber: "NS-1442",
    purchaseDate: olderPurchase.toISOString().slice(0, 10),
    warrantyMonths: 24,
    provider: "Northstar Care",
    receiptRef: "receipt://laptop-2024",
    idempotencyKey: `${userId}:seed:laptop`
  });
  addItem(userId, {
    id: "item-sofa",
    name: "Living room sofa",
    category: "furniture",
    brand: "UrbanHome",
    model: "Luna",
    serialNumber: "SOFA-220",
    purchaseDate: recentPurchase.toISOString().slice(0, 10),
    warrantyMonths: 36,
    provider: "UrbanHome Claims",
    receiptRef: "receipt://sofa-2026",
    idempotencyKey: `${userId}:seed:sofa`
  });
  const claim = startClaim(userId, {
    id: "claim-washer-leak",
    itemId: washer.id,
    issue: "Washer leaks during spin cycle and leaves water under the unit.",
    idempotencyKey: `${userId}:seed:washer-claim`
  }).claim;
  addDocument(userId, { claimId: claim.id, type: "receipt", fileRef: "receipt://washer-2025" });
  updateClaimStatus(userId, claim.id, "submitted");
  logEvent(userId, "DEMO_SEEDED", today, { items: 3, claims: 1 });
}

function normalizeItem(userId, input, now) {
  const purchaseDate = String(input.purchaseDate || new Date().toISOString().slice(0, 10)).slice(0, 10);
  const warrantyMonths = Math.max(1, Math.min(Number(input.warrantyMonths) || 12, 120));
  return {
    id: String(input.id || randomUUID()),
    userId,
    name: String(input.name || "Owned item").trim().slice(0, 120),
    category: normalizeEnum(input.category, ["appliance", "electronics", "furniture", "vehicle", "home"], "electronics"),
    brand: String(input.brand || "Unknown").trim().slice(0, 80),
    model: String(input.model || "Unknown").trim().slice(0, 80),
    serialNumber: String(input.serialNumber || "not-recorded").trim().slice(0, 100),
    purchaseDate,
    warrantyMonths,
    warrantyEndsAt: warrantyEndsAt(purchaseDate, warrantyMonths),
    provider: String(input.provider || "Manufacturer support").trim().slice(0, 100),
    receiptRef: String(input.receiptRef || "missing").trim().slice(0, 160),
    createdAt: now
  };
}

function scheduleExpiryJob(userId, item) {
  const runAt = new Date(new Date(item.warrantyEndsAt).getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
  db.prepare(`
    INSERT OR IGNORE INTO follow_up_jobs
      (id, user_id, claim_id, item_id, kind, run_at, status, attempts, locked_until, last_error, created_at, updated_at)
    VALUES (?, ?, NULL, ?, 'warranty-expiry', ?, 'queued', 0, NULL, NULL, ?, ?)
  `).run(`expiry:${item.id}`, userId, item.id, runAt, item.createdAt, item.createdAt);
}

function scheduleFollowUp(userId, claim, item, kind, runAt) {
  const now = new Date().toISOString();
  db.prepare(`
    INSERT OR REPLACE INTO follow_up_jobs
      (id, user_id, claim_id, item_id, kind, run_at, status, attempts, locked_until, last_error, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, 'queued', 0, NULL, NULL, ?, ?)
  `).run(`followup:${claim.id}`, userId, claim.id, item?.id || claim.itemId, kind, runAt, now, now);
}

function rebuildExpiryJobs(userId) {
  for (const item of getItems(userId)) scheduleExpiryJob(userId, item);
}

function recordContact(userId, claimId, channel, outcome, note, attemptedAt) {
  const claim = getClaim(userId, claimId);
  const item = claim ? getItem(userId, claim.itemId) : null;
  const provider = item?.provider || "unknown provider";
  const result = db.prepare(`
    INSERT INTO contact_attempts (user_id, claim_id, provider, channel, outcome, note, attempted_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(userId, claimId, provider, channel, outcome, note, attemptedAt);
  return { id: Number(result.lastInsertRowid), userId, claimId, provider, channel, outcome, note, attemptedAt };
}

function getItems(userId) {
  return db.prepare("SELECT * FROM owned_items WHERE user_id = ? ORDER BY warranty_ends_at ASC").all(userId).map(itemFromRow);
}

function getItem(userId, itemId) {
  const row = db.prepare("SELECT * FROM owned_items WHERE user_id = ? AND id = ?").get(userId, itemId);
  return row ? itemFromRow(row) : null;
}

function getClaims(userId) {
  return db.prepare("SELECT * FROM claim_cases WHERE user_id = ? ORDER BY updated_at DESC").all(userId).map(claimFromRow);
}

function getClaim(userId, claimId) {
  const row = db.prepare("SELECT * FROM claim_cases WHERE user_id = ? AND id = ?").get(userId, claimId);
  return row ? claimFromRow(row) : null;
}

function getDocuments(userId) {
  return db.prepare("SELECT * FROM claim_documents WHERE user_id = ? ORDER BY uploaded_at DESC").all(userId).map((row) => ({
    id: row.id,
    userId: row.user_id,
    claimId: row.claim_id,
    type: row.type,
    fileRef: row.file_ref,
    verified: Boolean(row.verified),
    uploadedAt: row.uploaded_at
  }));
}

function getJobs(userId) {
  return db.prepare("SELECT * FROM follow_up_jobs WHERE user_id = ? ORDER BY run_at ASC").all(userId).map(jobFromRow);
}

function getContactAttempts(userId) {
  return db.prepare("SELECT * FROM contact_attempts WHERE user_id = ? ORDER BY attempted_at DESC").all(userId).map((row) => ({
    id: row.id,
    userId: row.user_id,
    claimId: row.claim_id,
    provider: row.provider,
    channel: row.channel,
    outcome: row.outcome,
    note: row.note,
    attemptedAt: row.attempted_at
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
    warrantyMonths: row.warranty_months,
    warrantyEndsAt: row.warranty_ends_at,
    provider: row.provider,
    receiptRef: row.receipt_ref,
    createdAt: row.created_at
  };
}

function claimFromRow(row) {
  return {
    id: row.id,
    userId: row.user_id,
    itemId: row.item_id,
    issue: row.issue,
    status: row.status,
    requiredDocuments: JSON.parse(row.required_documents_json),
    submittedAt: row.submitted_at,
    updatedAt: row.updated_at
  };
}

function jobFromRow(row) {
  return {
    id: row.id,
    userId: row.user_id,
    claimId: row.claim_id,
    itemId: row.item_id,
    kind: row.kind,
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
