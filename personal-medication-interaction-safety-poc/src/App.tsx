import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  BellRing,
  CheckCircle2,
  ClipboardPlus,
  HeartPulse,
  History,
  Pill,
  Plus,
  RefreshCcw,
  RotateCcw,
  Send,
  ShieldAlert,
  Siren,
  Stethoscope,
  UserRoundCheck,
  XCircle
} from "lucide-react";

type Severity = "low" | "medium" | "high" | "critical";

type Medication = {
  id: string;
  name: string;
  ingredient: string;
  strength: string;
  schedule: string;
  pharmacy: string;
  prescriber: string;
  supplyDaysRemaining: number;
  refillThresholdDays: number;
  criticalDose: boolean;
  status: "active";
};

type Warning = {
  id: string;
  type: string;
  severity: Severity;
  title: string;
  message: string;
  guidance: string;
  medicationIds: string[];
};

type ReminderJob = {
  id: string;
  medicationName: string;
  kind: string;
  runAt: string;
  status: "queued" | "dispatched";
  attempts: number;
  lastError: string | null;
};

type Caregiver = {
  id: string;
  name: string;
  relationship: string;
  channel: string;
  destination: string;
  escalationEnabled: boolean;
};

type DoseLog = {
  id: string;
  medicationName: string;
  status: string;
  takenAt: string;
};

type AuditEvent = {
  id: number;
  type: string;
  message: string;
  createdAt: string;
};

type Snapshot = {
  medications: Medication[];
  warnings: Warning[];
  reminders: ReminderJob[];
  caregivers: Caregiver[];
  doseLogs: DoseLog[];
  audits: AuditEvent[];
  insights: {
    urgentWarnings: Warning[];
    refillRisk: Warning[];
    interactionRisk: Warning[];
    queuedReminders: ReminderJob[];
    retryingReminders: ReminderJob[];
    activeCaregivers: Caregiver[];
    stats: {
      totalMedications: number;
      urgentWarnings: number;
      refillRisk: number;
      interactionRisk: number;
      queuedReminders: number;
      caregiverEscalations: number;
    };
  };
  cacheHit?: boolean;
};

const userId = "med-safety-demo";
const schedules = ["daily morning", "daily evening", "daily dinner", "as needed"];

export default function App() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [apiStatus, setApiStatus] = useState("Connecting");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: "Simvastatin",
    ingredient: "simvastatin",
    strength: "20 mg",
    schedule: "daily evening",
    pharmacy: "Cedar Pharmacy",
    prescriber: "Dr. Chen",
    supplyDaysRemaining: 6,
    refillThresholdDays: 7,
    criticalDose: true
  });

  const firstMedication = useMemo(() => snapshot?.medications[0] || null, [snapshot]);
  const caregiver = snapshot?.caregivers[0];

  useEffect(() => {
    loadSnapshot();
  }, []);

  async function loadSnapshot() {
    try {
      const [healthRes, snapshotRes] = await Promise.all([
        fetch("/api/health"),
        fetch(`/api/snapshot/${userId}`)
      ]);
      if (!healthRes.ok || !snapshotRes.ok) throw new Error("Medication safety API unavailable");
      const health = await healthRes.json() as { cache: string };
      const payload = await snapshotRes.json() as Snapshot;
      setSnapshot(payload);
      setApiStatus(`API online · ${health.cache} cache${payload.cacheHit ? " · cached" : ""}`);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Medication safety API unavailable");
    }
  }

  async function addMedication() {
    setSaving(true);
    try {
      const res = await fetch(`/api/medications/${userId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, idempotencyKey: `${userId}:med:${form.name}:${form.strength}` })
      });
      if (!res.ok) throw new Error("Medication creation failed");
      await loadSnapshot();
      setForm((current) => ({ ...current, name: "", ingredient: "", strength: "" }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Medication creation failed");
    } finally {
      setSaving(false);
    }
  }

  async function logDose(medicationId = firstMedication?.id, status = "taken") {
    if (!medicationId) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/doses/${userId}/${medicationId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status })
      });
      if (!res.ok) throw new Error("Dose logging failed");
      await loadSnapshot();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Dose logging failed");
    } finally {
      setSaving(false);
    }
  }

  async function refill(medicationId: string) {
    setSaving(true);
    try {
      const res = await fetch(`/api/refills/${userId}/${medicationId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ supplyDays: 30 })
      });
      if (!res.ok) throw new Error("Refill update failed");
      await loadSnapshot();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Refill update failed");
    } finally {
      setSaving(false);
    }
  }

  async function resolveWarning(warningId: string) {
    setSaving(true);
    try {
      const res = await fetch(`/api/warnings/${userId}/${encodeURIComponent(warningId)}/resolve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note: "Reviewed in dashboard" })
      });
      if (!res.ok) throw new Error("Warning resolution failed");
      await loadSnapshot();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Warning resolution failed");
    } finally {
      setSaving(false);
    }
  }

  async function toggleCaregiver(enabled: boolean) {
    setSaving(true);
    try {
      const res = await fetch(`/api/caregivers/${userId}/escalation`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled })
      });
      if (!res.ok) throw new Error("Caregiver update failed");
      await loadSnapshot();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Caregiver update failed");
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
        body: JSON.stringify({ now: new Date().toISOString(), limit: 5, simulateFailure })
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
          <HeartPulse size={42} />
          <h1>Medication Safety</h1>
          <p>{error || "Loading safety dashboard..."}</p>
          <button onClick={loadSnapshot}><RefreshCcw size={16} /> Retry</button>
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
            <span className="eyebrow"><ShieldAlert size={16} /> Everyday medication safety</span>
            <h1>Personal Medication Interaction & Refill Safety</h1>
            <p>Check active medications for interactions, duplicate ingredients, refill risk, missed-dose reminders, caregiver escalation, and retryable notifications.</p>
          </div>
          <div className="hero-actions">
            <button onClick={loadSnapshot} disabled={saving}><RefreshCcw size={16} /> Refresh</button>
            <button className="secondary" onClick={resetDemo} disabled={saving}><RotateCcw size={16} /> Reset</button>
          </div>
        </div>
      </section>

      <section className="status-row">
        <span className="status-pill good"><CheckCircle2 size={16} /> {apiStatus}</span>
        {error && <span className="status-pill bad"><XCircle size={16} /> {error}</span>}
      </section>

      <section className="metric-grid">
        <Metric icon={<Pill />} label="Medications" value={snapshot.insights.stats.totalMedications} />
        <Metric icon={<Siren />} label="Urgent warnings" value={snapshot.insights.stats.urgentWarnings} tone="danger" />
        <Metric icon={<ClipboardPlus />} label="Refill risks" value={snapshot.insights.stats.refillRisk} tone="warn" />
        <Metric icon={<AlertTriangle />} label="Interaction risks" value={snapshot.insights.stats.interactionRisk} tone="danger" />
        <Metric icon={<BellRing />} label="Queued reminders" value={snapshot.insights.stats.queuedReminders} />
      </section>

      <section className="workbench">
        <div className="panel">
          <div className="panel-heading">
            <h2><Plus size={18} /> Add medication</h2>
            <span>idempotent intake</span>
          </div>
          <div className="form-grid">
            <label>Name<input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></label>
            <label>Ingredient<input value={form.ingredient} onChange={(event) => setForm({ ...form, ingredient: event.target.value })} /></label>
            <label>Strength<input value={form.strength} onChange={(event) => setForm({ ...form, strength: event.target.value })} /></label>
            <label>Schedule<select value={form.schedule} onChange={(event) => setForm({ ...form, schedule: event.target.value })}>{schedules.map((schedule) => <option key={schedule}>{schedule}</option>)}</select></label>
            <label>Pharmacy<input value={form.pharmacy} onChange={(event) => setForm({ ...form, pharmacy: event.target.value })} /></label>
            <label>Prescriber<input value={form.prescriber} onChange={(event) => setForm({ ...form, prescriber: event.target.value })} /></label>
            <label>Supply days<input type="number" min="0" value={form.supplyDaysRemaining} onChange={(event) => setForm({ ...form, supplyDaysRemaining: Number(event.target.value) })} /></label>
            <label>Refill threshold<input type="number" min="0" value={form.refillThresholdDays} onChange={(event) => setForm({ ...form, refillThresholdDays: Number(event.target.value) })} /></label>
          </div>
          <label className="checkbox-line">
            <input type="checkbox" checked={form.criticalDose} onChange={(event) => setForm({ ...form, criticalDose: event.target.checked })} />
            Critical daily dose
          </label>
          <button onClick={addMedication} disabled={saving || !form.name || !form.ingredient}><Plus size={16} /> Add medication</button>
        </div>

        <div className="panel">
          <div className="panel-heading">
            <h2><UserRoundCheck size={18} /> Caregiver escalation</h2>
            <span>missed dose alerts</span>
          </div>
          {caregiver && (
            <div className="caregiver-card">
              <strong>{caregiver.name}</strong>
              <span>{caregiver.relationship} · {caregiver.channel} · {caregiver.destination}</span>
              <label className="toggle-line">
                <input type="checkbox" checked={caregiver.escalationEnabled} onChange={(event) => toggleCaregiver(event.target.checked)} />
                Escalation enabled
              </label>
            </div>
          )}
          <div className="queue-actions">
            <button onClick={() => logDose()} disabled={saving || !firstMedication}><CheckCircle2 size={16} /> Log first dose</button>
            <button className="secondary" onClick={() => drainReminders(false)} disabled={saving}><Send size={16} /> Drain due</button>
            <button className="secondary" onClick={() => drainReminders(true)} disabled={saving}><RefreshCcw size={16} /> Simulate retry</button>
          </div>
        </div>
      </section>

      <section className="content-grid">
        <Panel title="Safety warnings" icon={<ShieldAlert size={18} />}>
          {snapshot.warnings.length === 0 && <p className="empty">No active warnings.</p>}
          {snapshot.warnings.map((warning) => (
            <div className="warning-row" key={warning.id}>
              <div>
                <span className={`severity ${warning.severity}`}>{warning.severity}</span>
                <strong>{warning.title}</strong>
                <p>{warning.message}</p>
                <small>{warning.guidance}</small>
              </div>
              <button className="secondary" onClick={() => resolveWarning(warning.id)} disabled={saving}><CheckCircle2 size={16} /> Resolve</button>
            </div>
          ))}
        </Panel>

        <Panel title="Medication list" icon={<Pill size={18} />}>
          {snapshot.medications.map((med) => (
            <div className="med-row" key={med.id}>
              <div>
                <strong>{med.name} <span>{med.strength}</span></strong>
                <small>{med.ingredient} · {med.schedule} · {med.prescriber}</small>
                <small>{med.pharmacy}</small>
              </div>
              <div className="row-actions">
                <span className={med.supplyDaysRemaining <= med.refillThresholdDays ? "supply warn" : "supply"}>{med.supplyDaysRemaining} days</span>
                <button className="secondary" onClick={() => logDose(med.id)} disabled={saving}><CheckCircle2 size={16} /> Dose</button>
                <button className="secondary" onClick={() => refill(med.id)} disabled={saving}><ClipboardPlus size={16} /> Refill</button>
              </div>
            </div>
          ))}
        </Panel>

        <Panel title="Reminder queue" icon={<BellRing size={18} />}>
          {snapshot.insights.queuedReminders.slice(0, 8).map((job) => (
            <div className="compact-row" key={job.id}>
              <div>
                <strong>{job.medicationName}</strong>
                <span>{job.kind} · run {formatDate(job.runAt)} · attempts {job.attempts}</span>
                {job.lastError && <small>{job.lastError}</small>}
              </div>
              <span className="state queued">{job.status}</span>
            </div>
          ))}
        </Panel>

        <Panel title="Recent dose logs" icon={<Stethoscope size={18} />}>
          {snapshot.doseLogs.length === 0 && <p className="empty">No dose logs yet.</p>}
          {snapshot.doseLogs.slice(0, 8).map((log) => (
            <div className="compact-row" key={log.id}>
              <div>
                <strong>{log.medicationName}</strong>
                <span>{log.status} · {new Date(log.takenAt).toLocaleString()}</span>
              </div>
              <span className="state taken">{log.status}</span>
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

function Metric({ icon, label, value, tone = "normal" }: { icon: React.ReactNode; label: string; value: number; tone?: "normal" | "warn" | "danger" }) {
  return (
    <div className={`metric ${tone}`}>
      <div>{icon}</div>
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}
