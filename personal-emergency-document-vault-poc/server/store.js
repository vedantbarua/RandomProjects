import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, "../data/vault.json");

const categories = ["identity", "insurance", "medical", "home", "vehicle", "pet", "financial"];
const sensitivities = ["standard", "sensitive", "critical"];

let db = load();

export function getSnapshot(userId) {
  seedUser(userId);
  refreshReminderQueue(userId);
  expireAccessGrants(userId);
  const documents = db.documents.filter((doc) => doc.userId === userId);
  const contacts = db.contacts.filter((contact) => contact.userId === userId);
  const grants = db.accessGrants.filter((grant) => grant.userId === userId);
  const kits = db.exportKits.filter((kit) => kit.userId === userId);
  const reminders = db.reminderJobs.filter((job) => job.userId === userId);
  const audits = db.auditEvents.filter((event) => event.userId === userId).slice(-16).reverse();
  const expiring = documents
    .filter((doc) => doc.status === "active" && daysUntil(doc.expiresAt) <= 45)
    .sort((a, b) => new Date(a.expiresAt) - new Date(b.expiresAt));

  return {
    userId,
    documents,
    contacts,
    grants,
    kits,
    reminders,
    audits,
    insights: {
      expiring,
      activeGrants: grants.filter((grant) => grant.status === "active"),
      emergencyDocuments: documents.filter((doc) => doc.emergencyReady),
      queuedReminders: reminders.filter((job) => job.status === "queued"),
      retryingReminders: reminders.filter((job) => job.attempts > 0 && job.status === "queued"),
      recentKits: kits.slice(-5).reverse(),
      stats: {
        totalDocuments: documents.length,
        expiringSoon: expiring.length,
        activeGrants: grants.filter((grant) => grant.status === "active").length,
        exportKits: kits.length,
        queuedReminders: reminders.filter((job) => job.status === "queued").length,
        auditEvents: audits.length
      }
    }
  };
}

export function addDocument(userId, input) {
  seedUser(userId);
  const key = input.idempotencyKey || `${userId}:document:${input.title}:${input.expiresAt}`;
  const replay = db.idempotencyKeys[key];
  if (replay) return db.documents.find((doc) => doc.id === replay.entityId);

  const now = new Date().toISOString();
  const document = {
    id: `doc_${crypto.randomUUID()}`,
    userId,
    title: String(input.title || "Untitled document"),
    category: categories.includes(input.category) ? input.category : "identity",
    holder: String(input.holder || "Household"),
    issuer: String(input.issuer || "Unknown issuer"),
    identifierHint: String(input.identifierHint || "ending unknown"),
    expiresAt: input.expiresAt || addDays(365),
    storageRef: String(input.storageRef || "vault://pending-upload"),
    tags: Array.isArray(input.tags) ? input.tags.slice(0, 6).map(String) : [],
    sensitivity: sensitivities.includes(input.sensitivity) ? input.sensitivity : "sensitive",
    emergencyReady: Boolean(input.emergencyReady ?? true),
    status: "active",
    createdAt: now,
    updatedAt: now
  };

  db.documents.push(document);
  db.idempotencyKeys[key] = { entityId: document.id, createdAt: now };
  scheduleReminder(userId, document, "expiry_notice", addDays(-30, document.expiresAt));
  audit(userId, "document.added", document.id, `${document.title} was added to the vault`);
  save();
  return document;
}

export function updateDocumentStatus(userId, documentId, status) {
  const document = db.documents.find((doc) => doc.userId === userId && doc.id === documentId);
  if (!document) return null;
  document.status = ["active", "archived", "needs_review"].includes(status) ? status : document.status;
  document.updatedAt = new Date().toISOString();
  audit(userId, "document.status_changed", document.id, `${document.title} marked ${document.status}`);
  save();
  return document;
}

export function createAccessGrant(userId, input) {
  seedUser(userId);
  const contact = db.contacts.find((candidate) => candidate.userId === userId && candidate.id === input.contactId);
  if (!contact) throw new Error("Trusted contact is required");

  const now = new Date().toISOString();
  const grant = {
    id: `grant_${crypto.randomUUID()}`,
    userId,
    contactId: contact.id,
    contactName: contact.name,
    scope: normalizeScope(input.scope),
    reason: String(input.reason || "Emergency access"),
    expiresAt: input.expiresAt || addDays(7),
    status: "active",
    createdAt: now,
    updatedAt: now
  };

  db.accessGrants.push(grant);
  scheduleReminder(userId, { id: grant.id, title: `Access grant for ${contact.name}` }, "grant_expiry", addDays(-1, grant.expiresAt));
  audit(userId, "access.granted", grant.id, `${contact.name} received ${grant.scope.join(", ")} access`);
  save();
  return grant;
}

export function revokeAccessGrant(userId, grantId) {
  const grant = db.accessGrants.find((candidate) => candidate.userId === userId && candidate.id === grantId);
  if (!grant) return null;
  grant.status = "revoked";
  grant.updatedAt = new Date().toISOString();
  audit(userId, "access.revoked", grant.id, `${grant.contactName} access was revoked`);
  save();
  return grant;
}

export function generateAccessKit(userId, grantId) {
  expireAccessGrants(userId);
  const grant = db.accessGrants.find((candidate) => candidate.userId === userId && candidate.id === grantId && candidate.status === "active");
  if (!grant) return null;

  const documents = db.documents
    .filter((doc) => doc.userId === userId && doc.status === "active")
    .filter((doc) => grant.scope.includes("all") || grant.scope.includes(doc.category))
    .map((doc) => ({
      id: doc.id,
      title: doc.title,
      category: doc.category,
      holder: doc.holder,
      issuer: doc.issuer,
      identifierHint: doc.identifierHint,
      expiresAt: doc.expiresAt,
      storageRef: doc.storageRef
    }));

  const manifest = {
    generatedFor: grant.contactName,
    grantId: grant.id,
    validUntil: grant.expiresAt,
    documents,
    instructions: [
      "Verify identity before sharing full document contents.",
      "Use the storage references to retrieve originals from the encrypted vault.",
      "Revoke the grant after the emergency or when contact access is no longer needed."
    ]
  };
  const checksum = crypto.createHash("sha256").update(JSON.stringify(manifest)).digest("hex").slice(0, 16);
  const kit = {
    id: `kit_${crypto.randomUUID()}`,
    userId,
    grantId,
    contactName: grant.contactName,
    status: "generated",
    manifest,
    checksum,
    createdAt: new Date().toISOString()
  };

  db.exportKits.push(kit);
  audit(userId, "kit.generated", kit.id, `${documents.length} documents packaged for ${grant.contactName}`);
  save();
  return kit;
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
      job.lastError = "Simulated provider timeout";
      job.runAt = addMinutes(10);
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
  db.documents = db.documents.filter((doc) => doc.userId !== userId);
  db.contacts = db.contacts.filter((contact) => contact.userId !== userId);
  db.accessGrants = db.accessGrants.filter((grant) => grant.userId !== userId);
  db.exportKits = db.exportKits.filter((kit) => kit.userId !== userId);
  db.reminderJobs = db.reminderJobs.filter((job) => job.userId !== userId);
  db.auditEvents = db.auditEvents.filter((event) => event.userId !== userId);
  for (const key of Object.keys(db.idempotencyKeys)) {
    if (key.startsWith(`${userId}:`)) delete db.idempotencyKeys[key];
  }
  save();
  return getSnapshot(userId);
}

function seedUser(userId) {
  if (db.documents.some((doc) => doc.userId === userId)) return;
  const now = new Date().toISOString();
  db.contacts.push(
    {
      id: `contact_${crypto.randomUUID()}`,
      userId,
      name: "Maya Rao",
      relationship: "Sister",
      channel: "sms",
      destination: "+1 *** *** 0142",
      verified: true,
      createdAt: now
    },
    {
      id: `contact_${crypto.randomUUID()}`,
      userId,
      name: "Jordan Lee",
      relationship: "Neighbor",
      channel: "email",
      destination: "jordan@example.test",
      verified: true,
      createdAt: now
    }
  );

  [
    ["Passport", "identity", "Vedant", "US Department of State", "ending 8341", 24, "critical", true],
    ["Auto insurance card", "insurance", "Household", "SafeRoad Mutual", "policy 91A2", 34, "sensitive", true],
    ["Prescription list", "medical", "Vedant", "Primary Care", "updated Aug", 12, "critical", true],
    ["Home deed copy", "home", "Household", "County Recorder", "parcel 7742", 520, "critical", false],
    ["Pet vaccination record", "pet", "Milo", "Oak Park Vet", "rabies 2026", 42, "standard", true]
  ].forEach(([title, category, holder, issuer, hint, days, sensitivity, emergencyReady]) => {
    const document = {
      id: `doc_${crypto.randomUUID()}`,
      userId,
      title,
      category,
      holder,
      issuer,
      identifierHint: hint,
      expiresAt: addDays(days),
      storageRef: `vault://${category}/${slug(title)}.pdf`,
      tags: [category, holder.toLowerCase()],
      sensitivity,
      emergencyReady,
      status: "active",
      createdAt: now,
      updatedAt: now
    };
    db.documents.push(document);
    scheduleReminder(userId, document, "expiry_notice", addDays(-30, document.expiresAt));
  });

  audit(userId, "vault.seeded", userId, "Emergency vault demo data created");
  save();
}

function refreshReminderQueue(userId) {
  db.documents
    .filter((doc) => doc.userId === userId && doc.status === "active")
    .forEach((doc) => scheduleReminder(userId, doc, "expiry_notice", addDays(-30, doc.expiresAt)));
}

function scheduleReminder(userId, entity, kind, runAt) {
  const key = `${userId}:${kind}:${entity.id}`;
  if (db.reminderJobs.some((job) => job.dedupeKey === key && job.status === "queued")) return;
  const now = new Date().toISOString();
  db.reminderJobs.push({
    id: `job_${crypto.randomUUID()}`,
    userId,
    entityId: entity.id,
    dedupeKey: key,
    kind,
    title: entity.title,
    runAt,
    status: "queued",
    attempts: 0,
    lastError: null,
    createdAt: now,
    updatedAt: now
  });
}

function expireAccessGrants(userId) {
  const now = Date.now();
  db.accessGrants
    .filter((grant) => grant.userId === userId && grant.status === "active" && new Date(grant.expiresAt).getTime() <= now)
    .forEach((grant) => {
      grant.status = "expired";
      grant.updatedAt = new Date().toISOString();
      audit(userId, "access.expired", grant.id, `${grant.contactName} access expired`);
    });
}

function normalizeScope(scope) {
  if (!Array.isArray(scope) || scope.length === 0) return ["all"];
  const clean = scope.map(String).filter((value) => value === "all" || categories.includes(value));
  return clean.length ? [...new Set(clean)] : ["all"];
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

function daysUntil(date) {
  return Math.ceil((new Date(date).getTime() - Date.now()) / 86400000);
}

function addDays(days, from = new Date().toISOString()) {
  const date = new Date(from);
  date.setDate(date.getDate() + Number(days));
  return date.toISOString();
}

function addMinutes(minutes) {
  const date = new Date();
  date.setMinutes(date.getMinutes() + Number(minutes));
  return date.toISOString();
}

function slug(value) {
  return String(value).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function load() {
  try {
    return JSON.parse(fs.readFileSync(dbPath, "utf8"));
  } catch {
    return {
      documents: [],
      contacts: [],
      accessGrants: [],
      exportKits: [],
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
