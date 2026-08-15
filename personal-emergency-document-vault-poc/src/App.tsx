import { useEffect, useMemo, useState } from "react";
import {
  Archive,
  Bell,
  CheckCircle2,
  FileKey2,
  FilePlus2,
  FolderLock,
  History,
  KeyRound,
  PackageCheck,
  RefreshCcw,
  RotateCcw,
  Send,
  ShieldCheck,
  TimerReset,
  UserRoundCheck,
  XCircle
} from "lucide-react";

type Category = "identity" | "insurance" | "medical" | "home" | "vehicle" | "pet" | "financial";
type Sensitivity = "standard" | "sensitive" | "critical";

type VaultDocument = {
  id: string;
  title: string;
  category: Category;
  holder: string;
  issuer: string;
  identifierHint: string;
  expiresAt: string;
  storageRef: string;
  tags: string[];
  sensitivity: Sensitivity;
  emergencyReady: boolean;
  status: "active" | "archived" | "needs_review";
};

type TrustedContact = {
  id: string;
  name: string;
  relationship: string;
  channel: string;
  destination: string;
  verified: boolean;
};

type AccessGrant = {
  id: string;
  contactId: string;
  contactName: string;
  scope: string[];
  reason: string;
  expiresAt: string;
  status: "active" | "revoked" | "expired";
};

type ExportKit = {
  id: string;
  grantId: string;
  contactName: string;
  checksum: string;
  status: string;
  createdAt: string;
  manifest: {
    documents: Array<{ id: string; title: string; category: Category; storageRef: string }>;
    validUntil: string;
  };
};

type ReminderJob = {
  id: string;
  title: string;
  kind: string;
  runAt: string;
  status: "queued" | "dispatched";
  attempts: number;
  lastError: string | null;
};

type AuditEvent = {
  id: number;
  type: string;
  message: string;
  createdAt: string;
};

type Snapshot = {
  userId: string;
  documents: VaultDocument[];
  contacts: TrustedContact[];
  grants: AccessGrant[];
  kits: ExportKit[];
  reminders: ReminderJob[];
  audits: AuditEvent[];
  insights: {
    expiring: VaultDocument[];
    activeGrants: AccessGrant[];
    emergencyDocuments: VaultDocument[];
    queuedReminders: ReminderJob[];
    retryingReminders: ReminderJob[];
    recentKits: ExportKit[];
    stats: {
      totalDocuments: number;
      expiringSoon: number;
      activeGrants: number;
      exportKits: number;
      queuedReminders: number;
      auditEvents: number;
    };
  };
  cacheHit?: boolean;
};

const userId = "emergency-demo";
const categories: Category[] = ["identity", "insurance", "medical", "home", "vehicle", "pet", "financial"];
const sensitivities: Sensitivity[] = ["standard", "sensitive", "critical"];

export default function App() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [apiStatus, setApiStatus] = useState("Connecting");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [docForm, setDocForm] = useState({
    title: "Health insurance card",
    category: "insurance" as Category,
    holder: "Household",
    issuer: "Northstar Health",
    identifierHint: "member ending 2038",
    expiresAt: futureDate(21),
    storageRef: "vault://insurance/health-card.pdf",
    sensitivity: "sensitive" as Sensitivity,
    emergencyReady: true
  });
  const [grantScope, setGrantScope] = useState<Category | "all">("all");

  const activeGrant = useMemo(() => snapshot?.insights.activeGrants[0] || null, [snapshot]);
  const firstContact = snapshot?.contacts[0];

  useEffect(() => {
    loadSnapshot();
  }, []);

  async function loadSnapshot() {
    try {
      const [healthRes, snapshotRes] = await Promise.all([
        fetch("/api/health"),
        fetch(`/api/snapshot/${userId}`)
      ]);
      if (!healthRes.ok || !snapshotRes.ok) throw new Error("Vault API unavailable");
      const health = await healthRes.json() as { cache: string };
      const payload = await snapshotRes.json() as Snapshot;
      setSnapshot(payload);
      setApiStatus(`API online · ${health.cache} cache${payload.cacheHit ? " · cached" : ""}`);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Vault API unavailable");
    }
  }

  async function addDocument() {
    setSaving(true);
    try {
      const res = await fetch(`/api/documents/${userId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...docForm,
          tags: [docForm.category, docForm.holder.toLowerCase()],
          idempotencyKey: `${userId}:doc:${docForm.title}:${docForm.expiresAt}`
        })
      });
      if (!res.ok) throw new Error("Document creation failed");
      await loadSnapshot();
      setDocForm((current) => ({ ...current, title: "", identifierHint: "", storageRef: "" }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Document creation failed");
    } finally {
      setSaving(false);
    }
  }

  async function createGrant() {
    if (!firstContact) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/grants/${userId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contactId: firstContact.id,
          scope: [grantScope],
          reason: "Trusted contact emergency kit",
          expiresAt: new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString()
        })
      });
      if (!res.ok) throw new Error("Grant creation failed");
      await loadSnapshot();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Grant creation failed");
    } finally {
      setSaving(false);
    }
  }

  async function generateKit(grantId = activeGrant?.id) {
    if (!grantId) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/kits/${userId}/${grantId}`, { method: "POST" });
      if (!res.ok) throw new Error("Access kit generation failed");
      await loadSnapshot();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Access kit generation failed");
    } finally {
      setSaving(false);
    }
  }

  async function revokeGrant(grantId: string) {
    setSaving(true);
    try {
      const res = await fetch(`/api/grants/${userId}/${grantId}/revoke`, { method: "POST" });
      if (!res.ok) throw new Error("Grant revocation failed");
      await loadSnapshot();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Grant revocation failed");
    } finally {
      setSaving(false);
    }
  }

  async function markNeedsReview(documentId: string) {
    setSaving(true);
    try {
      const res = await fetch(`/api/documents/${userId}/${documentId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "needs_review" })
      });
      if (!res.ok) throw new Error("Document update failed");
      await loadSnapshot();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Document update failed");
    } finally {
      setSaving(false);
    }
  }

  async function drainReminders(simulateFailure = false) {
    setSaving(true);
    try {
      const res = await fetch("/api/reminders/drain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ now: new Date().toISOString(), limit: 4, simulateFailure })
      });
      if (!res.ok) throw new Error("Reminder drain failed");
      await loadSnapshot();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Reminder drain failed");
    } finally {
      setSaving(false);
    }
  }

  async function resetDemo() {
    setSaving(true);
    try {
      const res = await fetch(`/api/reset/${userId}`, { method: "POST" });
      if (!res.ok) throw new Error("Reset failed");
      await loadSnapshot();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Reset failed");
    } finally {
      setSaving(false);
    }
  }

  if (!snapshot) {
    return (
      <main className="shell">
        <section className="loading-panel">
          <FolderLock size={40} />
          <h1>Emergency Document Vault</h1>
          <p>{error || "Loading vault snapshot..."}</p>
          <button onClick={loadSnapshot}>
            <RefreshCcw size={16} /> Retry
          </button>
        </section>
      </main>
    );
  }

  return (
    <main className="shell">
      <section className="hero">
        <div className="hero-overlay" />
        <div className="hero-content">
          <div>
            <span className="eyebrow"><ShieldCheck size={16} /> Emergency access kit</span>
            <h1>Personal Emergency Document Vault</h1>
            <p>
              Track critical household documents, expiry reminders, trusted-contact access, export manifests, and audit history in one runnable POC.
            </p>
          </div>
          <div className="hero-actions">
            <button onClick={loadSnapshot} disabled={saving}>
              <RefreshCcw size={16} /> Refresh
            </button>
            <button className="secondary" onClick={resetDemo} disabled={saving}>
              <RotateCcw size={16} /> Reset
            </button>
          </div>
        </div>
      </section>

      <section className="status-row">
        <span className="status-pill good"><CheckCircle2 size={16} /> {apiStatus}</span>
        {error && <span className="status-pill bad"><XCircle size={16} /> {error}</span>}
      </section>

      <section className="metric-grid">
        <Metric icon={<FileKey2 />} label="Documents" value={snapshot.insights.stats.totalDocuments} />
        <Metric icon={<TimerReset />} label="Expiring" value={snapshot.insights.stats.expiringSoon} tone="warn" />
        <Metric icon={<KeyRound />} label="Active grants" value={snapshot.insights.stats.activeGrants} />
        <Metric icon={<PackageCheck />} label="Access kits" value={snapshot.insights.stats.exportKits} />
        <Metric icon={<Bell />} label="Queued reminders" value={snapshot.insights.stats.queuedReminders} tone="warn" />
      </section>

      <section className="workbench">
        <div className="panel form-panel">
          <div className="panel-heading">
            <h2><FilePlus2 size={18} /> Add document metadata</h2>
            <span>idempotent intake</span>
          </div>
          <div className="form-grid">
            <label>Title<input value={docForm.title} onChange={(event) => setDocForm({ ...docForm, title: event.target.value })} /></label>
            <label>Category<select value={docForm.category} onChange={(event) => setDocForm({ ...docForm, category: event.target.value as Category })}>{categories.map((category) => <option key={category}>{category}</option>)}</select></label>
            <label>Holder<input value={docForm.holder} onChange={(event) => setDocForm({ ...docForm, holder: event.target.value })} /></label>
            <label>Issuer<input value={docForm.issuer} onChange={(event) => setDocForm({ ...docForm, issuer: event.target.value })} /></label>
            <label>Identifier hint<input value={docForm.identifierHint} onChange={(event) => setDocForm({ ...docForm, identifierHint: event.target.value })} /></label>
            <label>Expiry<input type="date" value={docForm.expiresAt} onChange={(event) => setDocForm({ ...docForm, expiresAt: event.target.value })} /></label>
            <label>Sensitivity<select value={docForm.sensitivity} onChange={(event) => setDocForm({ ...docForm, sensitivity: event.target.value as Sensitivity })}>{sensitivities.map((level) => <option key={level}>{level}</option>)}</select></label>
            <label>Storage ref<input value={docForm.storageRef} onChange={(event) => setDocForm({ ...docForm, storageRef: event.target.value })} /></label>
          </div>
          <label className="checkbox-line">
            <input type="checkbox" checked={docForm.emergencyReady} onChange={(event) => setDocForm({ ...docForm, emergencyReady: event.target.checked })} />
            Include in emergency-ready checklist
          </label>
          <button onClick={addDocument} disabled={saving || !docForm.title}>
            <FilePlus2 size={16} /> Add document
          </button>
        </div>

        <div className="panel grant-panel">
          <div className="panel-heading">
            <h2><UserRoundCheck size={18} /> Trusted access</h2>
            <span>short-lived grants</span>
          </div>
          <div className="contact-list">
            {snapshot.contacts.map((contact) => (
              <div className="contact-card" key={contact.id}>
                <strong>{contact.name}</strong>
                <span>{contact.relationship} · {contact.channel} · {contact.destination}</span>
              </div>
            ))}
          </div>
          <div className="grant-controls">
            <label>Scope<select value={grantScope} onChange={(event) => setGrantScope(event.target.value as Category | "all")}>
              <option value="all">all</option>
              {categories.map((category) => <option key={category}>{category}</option>)}
            </select></label>
            <button onClick={createGrant} disabled={saving || !firstContact}>
              <KeyRound size={16} /> Grant 72h access
            </button>
            <button className="secondary" onClick={() => generateKit()} disabled={saving || !activeGrant}>
              <PackageCheck size={16} /> Generate kit
            </button>
          </div>
        </div>
      </section>

      <section className="content-grid">
        <Panel title="Vault documents" icon={<Archive size={18} />}>
          {snapshot.documents.map((doc) => (
            <div className="document-row" key={doc.id}>
              <div>
                <strong>{doc.title}</strong>
                <span>{doc.category} · {doc.holder} · {doc.issuer}</span>
                <small>{doc.identifierHint} · {doc.storageRef}</small>
              </div>
              <div className="row-actions">
                <span className={`tag ${doc.sensitivity}`}>{doc.sensitivity}</span>
                <span className={daysUntil(doc.expiresAt) <= 45 ? "date warn" : "date"}>{formatDate(doc.expiresAt)}</span>
                <button title="Mark for review" className="icon-button" onClick={() => markNeedsReview(doc.id)} disabled={saving}>
                  <TimerReset size={16} />
                </button>
              </div>
            </div>
          ))}
        </Panel>

        <Panel title="Active grants" icon={<KeyRound size={18} />}>
          {snapshot.grants.map((grant) => (
            <div className="compact-row" key={grant.id}>
              <div>
                <strong>{grant.contactName}</strong>
                <span>{grant.scope.join(", ")} · expires {formatDate(grant.expiresAt)}</span>
              </div>
              <div className="row-actions">
                <span className={`state ${grant.status}`}>{grant.status}</span>
                {grant.status === "active" && <button className="secondary" onClick={() => generateKit(grant.id)} disabled={saving}><PackageCheck size={16} /> Kit</button>}
                {grant.status === "active" && <button className="danger" onClick={() => revokeGrant(grant.id)} disabled={saving}><XCircle size={16} /> Revoke</button>}
              </div>
            </div>
          ))}
        </Panel>

        <Panel title="Access kits" icon={<PackageCheck size={18} />}>
          {snapshot.kits.length === 0 && <p className="empty">No kit generated yet.</p>}
          {snapshot.insights.recentKits.map((kit) => (
            <div className="compact-row" key={kit.id}>
              <div>
                <strong>{kit.contactName}</strong>
                <span>{kit.manifest.documents.length} documents · checksum {kit.checksum}</span>
              </div>
              <span className="state generated">{kit.status}</span>
            </div>
          ))}
        </Panel>

        <Panel title="Reminder queue" icon={<Bell size={18} />}>
          <div className="queue-actions">
            <button onClick={() => drainReminders(false)} disabled={saving}><Send size={16} /> Drain due</button>
            <button className="secondary" onClick={() => drainReminders(true)} disabled={saving}><RefreshCcw size={16} /> Simulate retry</button>
          </div>
          {snapshot.insights.queuedReminders.slice(0, 6).map((job) => (
            <div className="compact-row" key={job.id}>
              <div>
                <strong>{job.title}</strong>
                <span>{job.kind} · run {formatDate(job.runAt)} · attempts {job.attempts}</span>
                {job.lastError && <small>{job.lastError}</small>}
              </div>
              <span className="state queued">{job.status}</span>
            </div>
          ))}
        </Panel>

        <Panel title="Audit trail" icon={<History size={18} />}>
          {snapshot.audits.map((event) => (
            <div className="audit-row" key={event.id}>
              <span>{event.type}</span>
              <strong>{event.message}</strong>
              <small>{new Date(event.createdAt).toLocaleString()}</small>
            </div>
          ))}
        </Panel>
      </section>
    </main>
  );
}

function Panel({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="panel">
      <div className="panel-heading">
        <h2>{icon} {title}</h2>
      </div>
      {children}
    </section>
  );
}

function Metric({ icon, label, value, tone = "normal" }: { icon: React.ReactNode; label: string; value: number; tone?: "normal" | "warn" }) {
  return (
    <div className={`metric ${tone}`}>
      <div>{icon}</div>
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function daysUntil(value: string) {
  return Math.ceil((new Date(value).getTime() - Date.now()) / 86400000);
}

function futureDate(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}
