import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Bell,
  CheckCircle2,
  ClipboardList,
  History,
  Home,
  PackagePlus,
  Radio,
  RefreshCcw,
  RotateCcw,
  SearchCheck,
  ShieldAlert,
  Siren,
  Warehouse
} from "lucide-react";

type Category = "appliance" | "electronics" | "furniture" | "vehicle" | "home" | "baby" | "tool";
type Severity = "critical" | "high" | "medium" | "low";
type AlertStatus = "open" | "acknowledged" | "resolved" | "dismissed";

type InventoryItem = {
  id: string;
  name: string;
  category: Category;
  brand: string;
  model: string;
  serialNumber: string;
  purchaseDate: string;
  location: string;
  notes: string;
};

type Recall = {
  id: string;
  sourceEventId: string;
  category: Category;
  brand: string;
  modelPattern: string;
  serialPattern: string;
  severity: Severity;
  title: string;
  hazard: string;
  remedy: string;
  publishedAt: string;
};

type RecallAlert = {
  id: string;
  itemId: string;
  recallId: string;
  severity: Severity;
  status: AlertStatus;
  matchScore: number;
  matchReasons: string[];
  createdAt: string;
};

type NotificationJob = {
  id: string;
  alertId: string;
  channel: string;
  runAt: string;
  status: "queued" | "dispatched" | "cancelled";
  attempts: number;
  lastError: string | null;
};

type AuditEvent = {
  id: number;
  type: string;
  entityId: string;
  createdAt: string;
};

type Snapshot = {
  userId: string;
  items: InventoryItem[];
  recalls: Recall[];
  alerts: RecallAlert[];
  jobs: NotificationJob[];
  audits: AuditEvent[];
  insights: {
    openAlerts: RecallAlert[];
    urgentAlerts: RecallAlert[];
    affectedItems: InventoryItem[];
    recentRecalls: Recall[];
    queuedJobs: NotificationJob[];
    retryingJobs: NotificationJob[];
    stats: {
      totalItems: number;
      recallFeed: number;
      openAlerts: number;
      urgentAlerts: number;
      affectedItems: number;
      queuedNotifications: number;
      failedAttempts: number;
    };
  };
  cacheHit?: boolean;
};

const userId = "recall-demo";
const categories: Category[] = ["appliance", "electronics", "furniture", "vehicle", "home", "baby", "tool"];
const severities: Severity[] = ["critical", "high", "medium", "low"];

export default function App() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [apiStatus, setApiStatus] = useState("Connecting");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [itemForm, setItemForm] = useState({
    name: "Basement dehumidifier",
    category: "appliance" as Category,
    brand: "DryHome",
    model: "DH-70",
    serialNumber: "DH70-4491",
    purchaseDate: new Date().toISOString().slice(0, 10),
    location: "Basement",
    notes: "Runs during summer"
  });
  const [recallForm, setRecallForm] = useState({
    brand: "DryHome",
    category: "appliance" as Category,
    modelPattern: "DH-70",
    serialPattern: "DH70-*",
    severity: "high" as Severity,
    title: "DryHome DH-70 compressor recall",
    hazard: "Compressor relay may overheat under continuous use.",
    remedy: "Unplug unit and request free relay replacement."
  });

  const activeAlert = useMemo(() => snapshot?.insights.openAlerts[0] || null, [snapshot]);

  useEffect(() => {
    loadSnapshot();
  }, []);

  async function loadSnapshot() {
    try {
      const [healthRes, snapshotRes] = await Promise.all([
        fetch("/api/health"),
        fetch(`/api/snapshot/${userId}`)
      ]);
      if (!healthRes.ok || !snapshotRes.ok) throw new Error("Recall API unavailable");
      const health = await healthRes.json() as { cache: string };
      const payload = await snapshotRes.json() as Snapshot;
      setSnapshot(payload);
      setApiStatus(`API online · ${health.cache} cache${payload.cacheHit ? " · cached" : ""}`);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Recall API unavailable");
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
      setItemForm((current) => ({ ...current, name: "", serialNumber: "", notes: "" }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Item creation failed");
    } finally {
      setSaving(false);
    }
  }

  async function ingestRecall() {
    setSaving(true);
    try {
      const res = await fetch(`/api/recalls/${userId}/ingest`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recalls: [{
            ...recallForm,
            sourceEventId: `${recallForm.brand}-${recallForm.modelPattern}-${Date.now()}`,
            publishedAt: new Date().toISOString()
          }]
        })
      });
      if (!res.ok) throw new Error("Recall ingestion failed");
      await loadSnapshot();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Recall ingestion failed");
    } finally {
      setSaving(false);
    }
  }

  async function updateAlert(alertId: string, status: AlertStatus) {
    setSaving(true);
    try {
      const res = await fetch(`/api/alerts/${userId}/${encodeURIComponent(alertId)}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status })
      });
      if (!res.ok) throw new Error("Alert update failed");
      await loadSnapshot();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Alert update failed");
    } finally {
      setSaving(false);
    }
  }

  async function drainNotifications(simulateFailure = false) {
    setSaving(true);
    try {
      const res = await fetch("/api/notifications/drain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ now: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), limit: 8, simulateFailure })
      });
      if (!res.ok) throw new Error("Notification drain failed");
      await loadSnapshot();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Notification drain failed");
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
          <span><ShieldAlert /></span>
          <div>
            <strong>Home Recall Alerts</strong>
            <small>{error || apiStatus}</small>
          </div>
        </div>
        <div className="top-actions">
          <button onClick={loadSnapshot} disabled={saving}><RefreshCcw /> Refresh</button>
          <button onClick={resetDemo} disabled={saving}><RotateCcw /> Reset</button>
        </div>
      </header>

      <section className="hero">
        <div>
          <span className="eyebrow"><Siren /> Recall matching engine</span>
          <h1>Know when something in your home is affected by a product recall.</h1>
          <p>{activeAlert ? `${itemName(activeAlert.itemId, snapshot)} matched a ${activeAlert.severity} recall at ${activeAlert.matchScore}%.` : "No open recall alerts need action right now."}</p>
        </div>
        <article className="hero-card">
          <strong>{stats?.urgentAlerts ?? 0}</strong>
          <span>urgent open alerts</span>
          <meter min="0" max="10" value={stats?.urgentAlerts ?? 0} />
        </article>
      </section>

      <section className="metrics">
        <Metric icon={Warehouse} label="Inventory" value={String(stats?.totalItems ?? 0)} />
        <Metric icon={Radio} label="Recall feed" value={String(stats?.recallFeed ?? 0)} />
        <Metric icon={AlertTriangle} label="Open alerts" value={String(stats?.openAlerts ?? 0)} tone={(stats?.openAlerts ?? 0) > 0 ? "warn" : "ok"} />
        <Metric icon={Bell} label="Notify jobs" value={String(stats?.queuedNotifications ?? 0)} />
      </section>

      <section className="workspace">
        <aside className="panel form-panel">
          <h2><PackagePlus /> Add Item</h2>
          <label>Name<input value={itemForm.name} onChange={(event) => setItemForm({ ...itemForm, name: event.target.value })} /></label>
          <div className="split">
            <label>Category<select value={itemForm.category} onChange={(event) => setItemForm({ ...itemForm, category: event.target.value as Category })}>{categories.map((category) => <option key={category}>{category}</option>)}</select></label>
            <label>Location<input value={itemForm.location} onChange={(event) => setItemForm({ ...itemForm, location: event.target.value })} /></label>
          </div>
          <div className="split">
            <label>Brand<input value={itemForm.brand} onChange={(event) => setItemForm({ ...itemForm, brand: event.target.value })} /></label>
            <label>Model<input value={itemForm.model} onChange={(event) => setItemForm({ ...itemForm, model: event.target.value })} /></label>
          </div>
          <label>Serial<input value={itemForm.serialNumber} onChange={(event) => setItemForm({ ...itemForm, serialNumber: event.target.value })} /></label>
          <label>Purchase date<input type="date" value={itemForm.purchaseDate} onChange={(event) => setItemForm({ ...itemForm, purchaseDate: event.target.value })} /></label>
          <label>Notes<input value={itemForm.notes} onChange={(event) => setItemForm({ ...itemForm, notes: event.target.value })} /></label>
          <button className="primary" onClick={addItem} disabled={saving || !itemForm.name.trim()}><PackagePlus /> Add item</button>
        </aside>

        <section className="panel alerts-panel">
          <header className="panel-head">
            <div>
              <h2><SearchCheck /> Recall Alerts</h2>
              <small>{snapshot?.insights.affectedItems.length ?? 0} affected items</small>
            </div>
            <div className="control-row">
              <button onClick={() => drainNotifications(false)} disabled={saving}>Drain jobs</button>
              <button onClick={() => drainNotifications(true)} disabled={saving}>Simulate retry</button>
            </div>
          </header>
          <div className="alert-list">
            {(snapshot?.alerts || []).map((alert) => {
              const recall = snapshot?.recalls.find((entry) => entry.id === alert.recallId);
              return (
                <article className={`alert-card ${alert.severity}`} key={alert.id}>
                  <div>
                    <strong>{itemName(alert.itemId, snapshot)}</strong>
                    <span>{recall?.title || "Recall notice"}</span>
                    <small>{alert.matchScore}% match · {alert.matchReasons.join(", ")}</small>
                  </div>
                  <select value={alert.status} onChange={(event) => updateAlert(alert.id, event.target.value as AlertStatus)}>
                    <option value="open">open</option>
                    <option value="acknowledged">acknowledged</option>
                    <option value="resolved">resolved</option>
                    <option value="dismissed">dismissed</option>
                  </select>
                </article>
              );
            })}
          </div>
        </section>

        <aside className="panel side-panel">
          <h2><Radio /> Ingest Recall</h2>
          <label>Brand<input value={recallForm.brand} onChange={(event) => setRecallForm({ ...recallForm, brand: event.target.value })} /></label>
          <label>Model pattern<input value={recallForm.modelPattern} onChange={(event) => setRecallForm({ ...recallForm, modelPattern: event.target.value })} /></label>
          <label>Serial pattern<input value={recallForm.serialPattern} onChange={(event) => setRecallForm({ ...recallForm, serialPattern: event.target.value })} /></label>
          <div className="split">
            <label>Category<select value={recallForm.category} onChange={(event) => setRecallForm({ ...recallForm, category: event.target.value as Category })}>{categories.map((category) => <option key={category}>{category}</option>)}</select></label>
            <label>Severity<select value={recallForm.severity} onChange={(event) => setRecallForm({ ...recallForm, severity: event.target.value as Severity })}>{severities.map((severity) => <option key={severity}>{severity}</option>)}</select></label>
          </div>
          <label>Title<input value={recallForm.title} onChange={(event) => setRecallForm({ ...recallForm, title: event.target.value })} /></label>
          <label>Hazard<input value={recallForm.hazard} onChange={(event) => setRecallForm({ ...recallForm, hazard: event.target.value })} /></label>
          <label>Remedy<input value={recallForm.remedy} onChange={(event) => setRecallForm({ ...recallForm, remedy: event.target.value })} /></label>
          <button className="primary" onClick={ingestRecall} disabled={saving}><Radio /> Ingest and match</button>
        </aside>
      </section>

      <section className="lower-grid">
        <div className="panel">
          <h2><Home /> Affected Items</h2>
          <div className="item-list">
            {(snapshot?.insights.affectedItems || []).map((item) => (
              <article key={item.id}>
                <strong>{item.name}</strong>
                <span>{item.brand} {item.model} · {item.location}</span>
                <small>{item.serialNumber}</small>
              </article>
            ))}
          </div>
        </div>
        <div className="panel">
          <h2><ClipboardList /> Recent Recalls</h2>
          <div className="recall-list">
            {(snapshot?.insights.recentRecalls || []).map((recall) => (
              <article key={recall.id}>
                <strong>{recall.title}</strong>
                <span>{recall.hazard}</span>
                <small>{recall.brand} {recall.modelPattern} · {recall.severity}</small>
              </article>
            ))}
          </div>
        </div>
        <div className="panel">
          <h2><Bell /> Notification Queue</h2>
          <div className="job-list">
            {(snapshot?.jobs || []).slice(0, 10).map((job) => (
              <article key={job.id}>
                <span className={`dot ${job.status}`} />
                <div>
                  <strong>{job.channel} · {job.status}</strong>
                  <small>{formatDateTime(job.runAt)} · attempts {job.attempts}</small>
                  {job.lastError ? <small>{job.lastError}</small> : null}
                </div>
              </article>
            ))}
          </div>
        </div>
        <div className="panel">
          <h2><History /> Audit Trail</h2>
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

function Metric({ icon: Icon, label, value, tone = "neutral" }: { icon: typeof Bell; label: string; value: string; tone?: "neutral" | "ok" | "warn" }) {
  return <article className={`metric ${tone}`}><Icon /><small>{label}</small><strong>{value}</strong></article>;
}

function itemName(itemId: string, snapshot: Snapshot | null) {
  return snapshot?.items.find((item) => item.id === itemId)?.name || "Unknown item";
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(value));
}
