import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Archive,
  CheckCircle2,
  ClipboardCheck,
  FilePlus2,
  Headphones,
  History,
  PackageCheck,
  Plus,
  RefreshCcw,
  RotateCcw,
  ShieldCheck,
  Timer,
  Upload
} from "lucide-react";

type Category = "appliance" | "electronics" | "furniture" | "vehicle" | "home";
type ClaimStatus = "draft" | "submitted" | "waiting" | "approved" | "denied" | "completed" | "withdrawn";

type OwnedItem = {
  id: string;
  name: string;
  category: Category;
  brand: string;
  model: string;
  serialNumber: string;
  purchaseDate: string;
  warrantyMonths: number;
  warrantyEndsAt: string;
  provider: string;
  receiptRef: string;
};

type ClaimCase = {
  id: string;
  itemId: string;
  issue: string;
  status: ClaimStatus;
  requiredDocuments: string[];
  submittedAt: string | null;
  updatedAt: string;
};

type ClaimDocument = {
  id: string;
  claimId: string;
  type: string;
  fileRef: string;
  verified: boolean;
  uploadedAt: string;
};

type FollowUpJob = {
  id: string;
  claimId: string | null;
  itemId: string | null;
  kind: string;
  runAt: string;
  status: "queued" | "dispatched" | "cancelled";
  attempts: number;
  lastError: string | null;
};

type ContactAttempt = {
  id: number;
  claimId: string;
  provider: string;
  channel: string;
  outcome: string;
  note: string;
  attemptedAt: string;
};

type AuditEvent = {
  id: number;
  type: string;
  entityId: string;
  createdAt: string;
};

type Snapshot = {
  userId: string;
  items: OwnedItem[];
  claims: ClaimCase[];
  documents: ClaimDocument[];
  jobs: FollowUpJob[];
  contacts: ContactAttempt[];
  audits: AuditEvent[];
  insights: {
    expiringItems: (OwnedItem & { daysUntilExpiry: number })[];
    missingDocuments: { claimId: string; itemId: string; docType: string }[];
    openClaims: ClaimCase[];
    queuedJobs: FollowUpJob[];
    retryingJobs: FollowUpJob[];
    overdueJobs: FollowUpJob[];
    stats: {
      totalItems: number;
      expiringSoon: number;
      openClaims: number;
      missingDocuments: number;
      queuedFollowUps: number;
      failedAttempts: number;
    };
  };
  cacheHit?: boolean;
};

const userId = "warranty-demo";
const categories: Category[] = ["appliance", "electronics", "furniture", "vehicle", "home"];
const statuses: ClaimStatus[] = ["draft", "submitted", "waiting", "approved", "denied", "completed", "withdrawn"];

export default function App() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [apiStatus, setApiStatus] = useState("Connecting");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [itemForm, setItemForm] = useState({
    name: "Noise cancelling headphones",
    category: "electronics" as Category,
    brand: "SoundLab",
    model: "Quiet 2",
    serialNumber: "SL-Q2-449",
    purchaseDate: new Date().toISOString().slice(0, 10),
    warrantyMonths: 12,
    provider: "SoundLab Support",
    receiptRef: "receipt://soundlab-headphones"
  });
  const [claimIssue, setClaimIssue] = useState("Device intermittently powers off and will not charge reliably.");

  const selectedItem = useMemo(() => snapshot?.items[0] || null, [snapshot]);
  const selectedClaim = useMemo(() => snapshot?.claims[0] || null, [snapshot]);

  useEffect(() => {
    loadSnapshot();
  }, []);

  async function loadSnapshot() {
    try {
      const [healthRes, snapshotRes] = await Promise.all([
        fetch("/api/health"),
        fetch(`/api/snapshot/${userId}`)
      ]);
      if (!healthRes.ok || !snapshotRes.ok) throw new Error("Warranty API unavailable");
      const health = await healthRes.json() as { cache: string };
      const payload = await snapshotRes.json() as Snapshot;
      setSnapshot(payload);
      setApiStatus(`API online · ${health.cache} cache${payload.cacheHit ? " · cached" : ""}`);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Warranty API unavailable");
    }
  }

  async function addItem() {
    setSaving(true);
    try {
      const res = await fetch(`/api/items/${userId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...itemForm, idempotencyKey: `${userId}:item:${itemForm.serialNumber}` })
      });
      if (!res.ok) throw new Error("Item creation failed");
      await loadSnapshot();
      setItemForm((current) => ({ ...current, name: "", serialNumber: "", receiptRef: "" }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Item creation failed");
    } finally {
      setSaving(false);
    }
  }

  async function startClaimFor(itemId: string) {
    setSaving(true);
    try {
      const res = await fetch(`/api/claims/${userId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId, issue: claimIssue, idempotencyKey: `${userId}:claim:${itemId}:${claimIssue}` })
      });
      if (!res.ok) throw new Error("Claim creation failed");
      await loadSnapshot();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Claim creation failed");
    } finally {
      setSaving(false);
    }
  }

  async function updateStatus(claimId: string, status: ClaimStatus) {
    setSaving(true);
    try {
      const res = await fetch(`/api/claims/${userId}/${claimId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status })
      });
      if (!res.ok) throw new Error("Claim update failed");
      await loadSnapshot();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Claim update failed");
    } finally {
      setSaving(false);
    }
  }

  async function addMissingDocument(missing: { claimId: string; docType: string }) {
    setSaving(true);
    try {
      const res = await fetch(`/api/documents/${userId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ claimId: missing.claimId, type: missing.docType, fileRef: `file://${missing.claimId}/${missing.docType.replaceAll(" ", "-")}` })
      });
      if (!res.ok) throw new Error("Document upload failed");
      await loadSnapshot();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Document upload failed");
    } finally {
      setSaving(false);
    }
  }

  async function drainJobs(simulateFailure = false) {
    setSaving(true);
    try {
      const res = await fetch("/api/jobs/drain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ now: new Date(Date.now() + 40 * 24 * 60 * 60 * 1000).toISOString(), limit: 8, simulateFailure })
      });
      if (!res.ok) throw new Error("Job drain failed");
      await loadSnapshot();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Job drain failed");
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

  const stats = snapshot?.insights.stats;

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand">
          <span><ShieldCheck /></span>
          <div>
            <strong>Warranty Claim Assistant</strong>
            <small>{error || apiStatus}</small>
          </div>
        </div>
        <div className="top-actions">
          <button onClick={() => loadSnapshot()} disabled={saving}><RefreshCcw /> Refresh</button>
          <button onClick={resetDemo} disabled={saving}><RotateCcw /> Reset</button>
        </div>
      </header>

      <section className="hero">
        <div>
          <span className="eyebrow"><PackageCheck /> Ownership to claim workflow</span>
          <h1>Track warranties, missing proof, service claims, and provider follow-ups.</h1>
          <p>{snapshot?.insights.expiringItems[0] ? `${snapshot.insights.expiringItems[0].name} expires in ${snapshot.insights.expiringItems[0].daysUntilExpiry} days.` : "No warranties are inside the 45-day expiry window."}</p>
        </div>
        <article className="hero-card">
          <strong>{stats?.openClaims ?? 0}</strong>
          <span>open claim cases</span>
          <meter min="0" max="10" value={stats?.openClaims ?? 0} />
        </article>
      </section>

      <section className="metrics">
        <Metric icon={Archive} label="Items" value={String(stats?.totalItems ?? 0)} />
        <Metric icon={Timer} label="Expiring" value={String(stats?.expiringSoon ?? 0)} tone={(stats?.expiringSoon ?? 0) > 0 ? "warn" : "ok"} />
        <Metric icon={FilePlus2} label="Missing docs" value={String(stats?.missingDocuments ?? 0)} tone={(stats?.missingDocuments ?? 0) > 0 ? "warn" : "ok"} />
        <Metric icon={Headphones} label="Follow-ups" value={String(stats?.queuedFollowUps ?? 0)} />
      </section>

      <section className="workspace">
        <aside className="panel form-panel">
          <h2><Plus /> Add Item</h2>
          <label>Name<input value={itemForm.name} onChange={(event) => setItemForm({ ...itemForm, name: event.target.value })} /></label>
          <div className="split">
            <label>Category<select value={itemForm.category} onChange={(event) => setItemForm({ ...itemForm, category: event.target.value as Category })}>{categories.map((category) => <option key={category}>{category}</option>)}</select></label>
            <label>Warranty months<input type="number" min="1" max="120" value={itemForm.warrantyMonths} onChange={(event) => setItemForm({ ...itemForm, warrantyMonths: Number(event.target.value) })} /></label>
          </div>
          <div className="split">
            <label>Brand<input value={itemForm.brand} onChange={(event) => setItemForm({ ...itemForm, brand: event.target.value })} /></label>
            <label>Model<input value={itemForm.model} onChange={(event) => setItemForm({ ...itemForm, model: event.target.value })} /></label>
          </div>
          <label>Serial<input value={itemForm.serialNumber} onChange={(event) => setItemForm({ ...itemForm, serialNumber: event.target.value })} /></label>
          <label>Purchase date<input type="date" value={itemForm.purchaseDate} onChange={(event) => setItemForm({ ...itemForm, purchaseDate: event.target.value })} /></label>
          <label>Provider<input value={itemForm.provider} onChange={(event) => setItemForm({ ...itemForm, provider: event.target.value })} /></label>
          <label>Receipt ref<input value={itemForm.receiptRef} onChange={(event) => setItemForm({ ...itemForm, receiptRef: event.target.value })} /></label>
          <button className="primary" onClick={addItem} disabled={saving || !itemForm.name.trim()}><Plus /> Add item</button>
          <label>Claim issue<input value={claimIssue} onChange={(event) => setClaimIssue(event.target.value)} /></label>
          <button onClick={() => selectedItem && startClaimFor(selectedItem.id)} disabled={saving || !selectedItem}>Start claim for first item</button>
        </aside>

        <section className="panel claims-panel">
          <header className="panel-head">
            <div>
              <h2><ClipboardCheck /> Claims</h2>
              <small>{snapshot?.insights.openClaims.length ?? 0} active workflows</small>
            </div>
            <div className="control-row">
              <button onClick={() => drainJobs(false)} disabled={saving}>Drain jobs</button>
              <button onClick={() => drainJobs(true)} disabled={saving}>Simulate retry</button>
            </div>
          </header>
          <div className="claim-list">
            {(snapshot?.claims || []).map((claim) => {
              const item = snapshot?.items.find((entry) => entry.id === claim.itemId);
              const docs = snapshot?.documents.filter((doc) => doc.claimId === claim.id) || [];
              return (
                <article className="claim-card" key={claim.id}>
                  <div>
                    <strong>{item?.name || "Unknown item"}</strong>
                    <span>{claim.issue}</span>
                    <small>{docs.length}/{claim.requiredDocuments.length} docs · updated {formatDateTime(claim.updatedAt)}</small>
                  </div>
                  <select value={claim.status} onChange={(event) => updateStatus(claim.id, event.target.value as ClaimStatus)}>
                    {statuses.map((status) => <option key={status}>{status}</option>)}
                  </select>
                </article>
              );
            })}
          </div>
        </section>

        <aside className="panel side-panel">
          <h2><Timer /> Expiring Warranties</h2>
          <div className="expiry-list">
            {(snapshot?.insights.expiringItems || []).map((item) => (
              <article key={item.id} className={item.daysUntilExpiry < 0 ? "expired" : ""}>
                <strong>{item.name}</strong>
                <span>{item.daysUntilExpiry < 0 ? `${Math.abs(item.daysUntilExpiry)} days expired` : `${item.daysUntilExpiry} days left`}</span>
                <small>{item.provider}</small>
              </article>
            ))}
            {snapshot?.insights.expiringItems.length === 0 ? <p className="muted">No warranties expiring soon.</p> : null}
          </div>
          <h2><Upload /> Missing Documents</h2>
          <div className="doc-list">
            {(snapshot?.insights.missingDocuments || []).map((missing) => (
              <article key={`${missing.claimId}-${missing.docType}`}>
                <span>{missing.docType}</span>
                <button onClick={() => addMissingDocument(missing)} disabled={saving}>Add</button>
              </article>
            ))}
          </div>
        </aside>
      </section>

      <section className="lower-grid">
        <div className="panel">
          <h2><PackageCheck /> Owned Items</h2>
          <div className="item-list">
            {(snapshot?.items || []).map((item) => (
              <article key={item.id}>
                <div>
                  <strong>{item.name}</strong>
                  <span>{item.brand} {item.model} · {item.category}</span>
                  <small>Warranty ends {formatDate(item.warrantyEndsAt)}</small>
                </div>
                <button onClick={() => startClaimFor(item.id)} disabled={saving}>Claim</button>
              </article>
            ))}
          </div>
        </div>
        <div className="panel">
          <h2><Headphones /> Follow-Up Queue</h2>
          <div className="job-list">
            {(snapshot?.jobs || []).slice(0, 10).map((job) => (
              <article key={job.id}>
                <span className={`dot ${job.status}`} />
                <div>
                  <strong>{job.kind} · {job.status}</strong>
                  <small>{formatDateTime(job.runAt)} · attempts {job.attempts}</small>
                  {job.lastError ? <small>{job.lastError}</small> : null}
                </div>
              </article>
            ))}
          </div>
        </div>
        <div className="panel">
          <h2><History /> Contact Attempts</h2>
          <div className="contact-list">
            {(snapshot?.contacts || []).map((contact) => (
              <article key={contact.id}>
                <strong>{contact.provider}</strong>
                <span>{contact.outcome}</span>
                <small>{formatDateTime(contact.attemptedAt)}</small>
              </article>
            ))}
            {snapshot?.contacts.length === 0 ? <p className="muted">No provider contacts yet.</p> : null}
          </div>
        </div>
        <div className="panel">
          <h2><CheckCircle2 /> Audit Trail</h2>
          <div className="audit-list">
            {(snapshot?.audits || []).map((event) => (
              <article key={event.id}>
                <strong>{event.type.replaceAll("_", " ")}</strong>
                <span>{formatDateTime(event.createdAt)}</span>
                <small>{event.entityId}</small>
              </article>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}

function Metric({ icon: Icon, label, value, tone = "neutral" }: { icon: typeof Archive; label: string; value: string; tone?: "neutral" | "ok" | "warn" }) {
  return <article className={`metric ${tone}`}><Icon /><small>{label}</small><strong>{value}</strong></article>;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(new Date(value));
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(value));
}
