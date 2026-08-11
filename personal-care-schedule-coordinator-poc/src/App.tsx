import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  Bell,
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  HeartPulse,
  PhoneForwarded,
  Pill,
  Plus,
  RefreshCcw,
  RotateCcw,
  ShieldAlert,
  Syringe
} from "lucide-react";

type ScheduleStatus = "scheduled" | "due-soon" | "late" | "missed" | "taken" | "skipped" | "completed" | "cancelled";
type Priority = "critical" | "high" | "normal" | "low";

type Medication = {
  id: string;
  name: string;
  dose: string;
  instructions: string;
  times: string[];
  remainingDoses: number;
  refillThresholdDays: number;
  critical: boolean;
  active: boolean;
};

type ScheduleItem = {
  occurrenceId: string;
  entityId: string;
  kind: "medication" | "appointment" | "care-task";
  title: string;
  detail: string;
  dueAt: string;
  priority: Priority;
  status: ScheduleStatus;
};

type RefillRisk = {
  medicationId: string;
  name: string;
  remainingDoses: number;
  daysLeft: number;
  thresholdDays: number;
  risk: "ok" | "refill-soon";
};

type ReminderJob = {
  id: string;
  occurrenceId: string;
  kind: string;
  dueAt: string;
  status: "queued" | "dispatched" | "cancelled";
  attempts: number;
  lastError: string | null;
  escalated: boolean;
};

type AuditEvent = {
  id: number;
  type: string;
  entityId: string;
  createdAt: string;
};

type Contact = {
  id: string;
  name: string;
  channel: string;
  destination: string;
  relationship: string;
};

type Snapshot = {
  userId: string;
  medications: Medication[];
  schedule: ScheduleItem[];
  refillRisks: RefillRisk[];
  reminders: ReminderJob[];
  contacts: Contact[];
  audits: AuditEvent[];
  stats: {
    dueSoon: number;
    lateOrMissed: number;
    completed: number;
    refillRisks: number;
    queuedReminders: number;
    escalations: number;
  };
  cacheHit?: boolean;
};

const userId = "care-demo";

export default function App() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [apiStatus, setApiStatus] = useState("Connecting");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [medForm, setMedForm] = useState({
    name: "Magnesium",
    dose: "200mg",
    instructions: "Take before bed",
    times: "22:00",
    remainingDoses: 12,
    refillThresholdDays: 5,
    critical: false
  });

  const nextDose = useMemo(() => {
    return snapshot?.schedule.find((item) => ["scheduled", "due-soon", "late"].includes(item.status));
  }, [snapshot]);

  useEffect(() => {
    loadSnapshot();
  }, []);

  async function loadSnapshot() {
    try {
      const [healthRes, snapshotRes] = await Promise.all([
        fetch("/api/health"),
        fetch(`/api/snapshot/${userId}`)
      ]);
      if (!healthRes.ok || !snapshotRes.ok) throw new Error("Care API unavailable");
      const health = await healthRes.json() as { cache: string };
      const payload = await snapshotRes.json() as Snapshot;
      setSnapshot(payload);
      setApiStatus(`API online · ${health.cache} cache${payload.cacheHit ? " · cached" : ""}`);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Care API unavailable");
    }
  }

  async function addMedication() {
    setSaving(true);
    try {
      const res = await fetch(`/api/medications/${userId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...medForm,
          times: medForm.times.split(",").map((time) => time.trim()),
          idempotencyKey: `${userId}:med:${medForm.name}:${medForm.times}`
        })
      });
      if (!res.ok) throw new Error("Medication creation failed");
      await rebuildSchedule();
      setMedForm((current) => ({ ...current, name: "", dose: "", instructions: "", times: "08:00" }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Medication creation failed");
    } finally {
      setSaving(false);
    }
  }

  async function recordAction(item: ScheduleItem, action: "taken" | "skipped" | "completed") {
    setSaving(true);
    try {
      const res = await fetch(`/api/actions/${userId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          occurrenceId: item.occurrenceId,
          entityId: item.entityId,
          action,
          note: `${action} from dashboard`,
          idempotencyKey: `${userId}:action:${item.occurrenceId}:${action}`
        })
      });
      if (!res.ok) throw new Error("Care action failed");
      await loadSnapshot();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Care action failed");
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
        body: JSON.stringify({ dosesAdded: 30 })
      });
      if (!res.ok) throw new Error("Refill update failed");
      await loadSnapshot();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Refill update failed");
    } finally {
      setSaving(false);
    }
  }

  async function rebuildSchedule() {
    const res = await fetch(`/api/schedule/${userId}/rebuild`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date: new Date().toISOString().slice(0, 10) })
    });
    if (!res.ok) throw new Error("Schedule rebuild failed");
    await loadSnapshot();
  }

  async function drainReminders(simulateFailure = false) {
    setSaving(true);
    try {
      const res = await fetch("/api/reminders/drain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ now: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), limit: 8, simulateFailure })
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

  const stats = snapshot?.stats;

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand">
          <span><HeartPulse /></span>
          <div>
            <strong>Personal Care Coordinator</strong>
            <small>{error || apiStatus}</small>
          </div>
        </div>
        <div className="top-actions">
          <button onClick={() => rebuildSchedule()} disabled={saving}><RefreshCcw /> Rebuild</button>
          <button onClick={resetDemo} disabled={saving}><RotateCcw /> Reset</button>
        </div>
      </header>

      <section className="hero">
        <div>
          <span className="eyebrow"><ShieldAlert /> Care-critical reminders</span>
          <h1>Coordinate doses, appointments, refills, and escalation in one daily view.</h1>
          <p>{nextDose ? `Next: ${nextDose.title} at ${formatTime(nextDose.dueAt)}.` : "All visible care items are handled for now."}</p>
        </div>
        <div className="hero-card">
          <strong>{stats?.lateOrMissed ?? 0}</strong>
          <span>late or missed items</span>
          <meter min="0" max="10" value={stats?.lateOrMissed ?? 0} />
        </div>
      </section>

      <section className="metrics">
        <Metric icon={CalendarClock} label="Due soon" value={String(stats?.dueSoon ?? 0)} />
        <Metric icon={CheckCircle2} label="Completed" value={String(stats?.completed ?? 0)} tone="ok" />
        <Metric icon={Syringe} label="Refill risks" value={String(stats?.refillRisks ?? 0)} tone={(stats?.refillRisks ?? 0) > 0 ? "warn" : "ok"} />
        <Metric icon={PhoneForwarded} label="Escalations" value={String(stats?.escalations ?? 0)} tone={(stats?.escalations ?? 0) > 0 ? "warn" : "neutral"} />
      </section>

      <section className="workspace">
        <aside className="panel form-panel">
          <h2><Plus /> Add Medication</h2>
          <label>Name<input value={medForm.name} onChange={(event) => setMedForm({ ...medForm, name: event.target.value })} /></label>
          <label>Dose<input value={medForm.dose} onChange={(event) => setMedForm({ ...medForm, dose: event.target.value })} /></label>
          <label>Instructions<input value={medForm.instructions} onChange={(event) => setMedForm({ ...medForm, instructions: event.target.value })} /></label>
          <label>Times<input value={medForm.times} onChange={(event) => setMedForm({ ...medForm, times: event.target.value })} /></label>
          <div className="split">
            <label>Doses left<input type="number" min="0" value={medForm.remainingDoses} onChange={(event) => setMedForm({ ...medForm, remainingDoses: Number(event.target.value) })} /></label>
            <label>Refill days<input type="number" min="1" value={medForm.refillThresholdDays} onChange={(event) => setMedForm({ ...medForm, refillThresholdDays: Number(event.target.value) })} /></label>
          </div>
          <label className="checkline"><input type="checkbox" checked={medForm.critical} onChange={(event) => setMedForm({ ...medForm, critical: event.target.checked })} />Critical medication</label>
          <button className="primary" onClick={addMedication} disabled={saving || !medForm.name.trim()}><Plus /> Add medication</button>
          <div className="control-row">
            <button onClick={() => drainReminders(false)} disabled={saving}><Bell /> Drain due</button>
            <button onClick={() => drainReminders(true)} disabled={saving}><AlertTriangle /> Simulate failure</button>
          </div>
        </aside>

        <section className="panel schedule-panel">
          <header className="panel-head">
            <div>
              <h2><ClipboardList /> Today</h2>
              <small>{snapshot?.schedule.length ?? 0} care items generated</small>
            </div>
            <span className={(stats?.lateOrMissed ?? 0) > 0 ? "badge warn" : "badge ok"}>{(stats?.lateOrMissed ?? 0) > 0 ? "Needs attention" : "On track"}</span>
          </header>
          <div className="schedule-list">
            {(snapshot?.schedule || []).map((item) => (
              <article className={`schedule-item ${item.status}`} key={item.occurrenceId}>
                <time>{formatTime(item.dueAt)}</time>
                <div>
                  <strong>{item.title}</strong>
                  <span>{item.detail}</span>
                  <small>{item.kind} · {item.status}</small>
                </div>
                <div className="item-actions">
                  {item.kind === "medication" ? <button onClick={() => recordAction(item, "taken")} disabled={saving || item.status === "taken"}>Taken</button> : <button onClick={() => recordAction(item, "completed")} disabled={saving || item.status === "completed"}>Done</button>}
                  <button onClick={() => recordAction(item, "skipped")} disabled={saving || item.status === "skipped"}>Skip</button>
                </div>
              </article>
            ))}
          </div>
        </section>

        <aside className="panel side-panel">
          <h2><Pill /> Refill Risk</h2>
          <div className="risk-list">
            {(snapshot?.refillRisks || []).map((risk) => (
              <article key={risk.medicationId} className={risk.risk === "refill-soon" ? "risk warn" : "risk"}>
                <div>
                  <strong>{risk.name}</strong>
                  <span>{risk.remainingDoses} doses · {risk.daysLeft} days left</span>
                </div>
                <button onClick={() => refill(risk.medicationId)} disabled={saving}>+30</button>
              </article>
            ))}
          </div>
          <h2><PhoneForwarded /> Escalation</h2>
          {(snapshot?.contacts || []).map((contact) => (
            <article className="contact" key={contact.id}>
              <strong>{contact.name}</strong>
              <span>{contact.relationship} · {contact.channel}</span>
              <small>{contact.destination}</small>
            </article>
          ))}
        </aside>
      </section>

      <section className="lower-grid">
        <div className="panel">
          <h2><Activity /> Reminder Queue</h2>
          <div className="queue-list">
            {(snapshot?.reminders || []).slice(0, 10).map((job) => (
              <article key={job.id}>
                <span className={`dot ${job.status}`} />
                <div>
                  <strong>{job.kind} · {job.status}</strong>
                  <small>{formatDateTime(job.dueAt)} · attempts {job.attempts}{job.escalated ? " · escalated" : ""}</small>
                  {job.lastError ? <small>{job.lastError}</small> : null}
                </div>
              </article>
            ))}
          </div>
        </div>
        <div className="panel">
          <h2><ShieldAlert /> Audit Trail</h2>
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

function Metric({ icon: Icon, label, value, tone = "neutral" }: { icon: typeof Pill; label: string; value: string; tone?: "neutral" | "ok" | "warn" }) {
  return <article className={`metric ${tone}`}><Icon /><small>{label}</small><strong>{value}</strong></article>;
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(new Date(value));
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(value));
}
