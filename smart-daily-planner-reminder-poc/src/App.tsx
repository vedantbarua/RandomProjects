import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Bell,
  CalendarClock,
  CheckCircle2,
  Clock3,
  ListChecks,
  Play,
  Plus,
  RefreshCcw,
  Route,
  ShieldCheck,
  TimerReset,
  Zap
} from "lucide-react";

type Priority = "urgent" | "high" | "medium" | "low";
type Category = "work" | "bill" | "errand" | "study" | "habit" | "appointment" | "home";
type Status = "todo" | "doing" | "done" | "cancelled";

type Task = {
  id: string;
  title: string;
  category: Category;
  priority: Priority;
  dueAt: string;
  earliestAt: string | null;
  estimateMinutes: number;
  reminderMinutesBefore: number;
  recurrence: "none" | "daily" | "weekly" | "monthly";
  status: Status;
};

type PlanSlot = {
  taskId: string;
  title: string;
  category: Category;
  priority: Priority;
  startAt: string;
  endAt: string;
  estimateMinutes: number;
  reason: string;
};

type DayPlan = {
  date: string;
  generatedAt: string;
  capacityMinutes: number;
  plannedMinutes: number;
  loadPercent: number;
  overload: boolean;
  slots: PlanSlot[];
  unscheduled: { taskId: string; title: string; estimateMinutes: number; reason: string }[];
};

type ReminderJob = {
  id: string;
  taskId: string;
  dueAt: string;
  status: "queued" | "dispatched" | "cancelled";
  attempts: number;
  lockedUntil: string | null;
  lastError: string | null;
};

type AuditEvent = {
  id: number;
  type: string;
  entityId: string;
  detail: Record<string, unknown>;
  createdAt: string;
};

type Snapshot = {
  userId: string;
  tasks: Task[];
  plan: DayPlan;
  reminders: ReminderJob[];
  events: AuditEvent[];
  stats: {
    openTasks: number;
    doneTasks: number;
    overdueTasks: number;
    queuedReminders: number;
    dispatchedReminders: number;
    planLoadPercent: number;
    overloaded: boolean;
  };
  cacheHit?: boolean;
};

const userId = "demo-user";
const categories: Category[] = ["work", "bill", "errand", "study", "habit", "appointment", "home"];
const priorities: Priority[] = ["urgent", "high", "medium", "low"];

const defaultDue = () => {
  const date = new Date(Date.now() + 4 * 60 * 60 * 1000);
  date.setMinutes(0, 0, 0);
  return date.toISOString().slice(0, 16);
};

export default function App() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [apiStatus, setApiStatus] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    title: "Call insurance about claim paperwork",
    category: "home" as Category,
    priority: "high" as Priority,
    dueAt: defaultDue(),
    estimateMinutes: 35,
    reminderMinutesBefore: 45
  });

  const dueSoon = useMemo(() => {
    if (!snapshot) return [];
    const tomorrow = Date.now() + 24 * 60 * 60 * 1000;
    return snapshot.tasks.filter((task) => task.status !== "done" && new Date(task.dueAt).getTime() <= tomorrow);
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
      if (!healthRes.ok || !snapshotRes.ok) throw new Error("Planner API unavailable");
      const health = await healthRes.json() as { cache: string };
      const payload = await snapshotRes.json() as Snapshot;
      setApiStatus(`API online · ${health.cache} cache${payload.cacheHit ? " · snapshot cached" : ""}`);
      setSnapshot(payload);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Planner API unavailable");
    }
  }

  async function createTask() {
    setSaving(true);
    try {
      const res = await fetch(`/api/tasks/${userId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          dueAt: new Date(form.dueAt).toISOString(),
          idempotencyKey: `${userId}:manual:${form.title}:${form.dueAt}`
        })
      });
      if (!res.ok) throw new Error("Task creation failed");
      await regeneratePlan();
      setForm((current) => ({ ...current, title: "", dueAt: defaultDue() }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Task creation failed");
    } finally {
      setSaving(false);
    }
  }

  async function updateStatus(taskId: string, status: Status) {
    setSaving(true);
    try {
      const res = await fetch(`/api/tasks/${userId}/${taskId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status })
      });
      if (!res.ok) throw new Error("Status update failed");
      await regeneratePlan();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Status update failed");
    } finally {
      setSaving(false);
    }
  }

  async function regeneratePlan() {
    const res = await fetch(`/api/plan/${userId}/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date: new Date().toISOString().slice(0, 10) })
    });
    if (!res.ok) throw new Error("Plan generation failed");
    await loadSnapshot();
  }

  async function drainReminders(simulateFailure = false) {
    setSaving(true);
    try {
      const res = await fetch("/api/reminders/drain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ now: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), limit: 10, simulateFailure })
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
          <span><CalendarClock /></span>
          <div>
            <strong>Smart Daily Planner</strong>
            <small>{apiStatus || error || "Connecting"}</small>
          </div>
        </div>
        <div className="top-actions">
          <button onClick={() => regeneratePlan()} disabled={saving}><RefreshCcw /> Replan</button>
          <button onClick={resetDemo} disabled={saving}><TimerReset /> Reset</button>
        </div>
      </header>

      <section className="status-grid">
        <Metric icon={ListChecks} label="Open tasks" value={String(stats?.openTasks ?? 0)} />
        <Metric icon={Route} label="Plan load" value={`${stats?.planLoadPercent ?? 0}%`} tone={stats?.overloaded ? "warn" : "ok"} />
        <Metric icon={Bell} label="Queued reminders" value={String(stats?.queuedReminders ?? 0)} />
        <Metric icon={AlertTriangle} label="Due soon" value={String(dueSoon.length)} tone={dueSoon.length > 2 ? "warn" : "ok"} />
      </section>

      <section className="workspace">
        <aside className="task-form panel">
          <h2><Plus /> Add Task</h2>
          <label>Title<input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} /></label>
          <div className="split">
            <label>Category<select value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value as Category })}>{categories.map((item) => <option key={item}>{item}</option>)}</select></label>
            <label>Priority<select value={form.priority} onChange={(event) => setForm({ ...form, priority: event.target.value as Priority })}>{priorities.map((item) => <option key={item}>{item}</option>)}</select></label>
          </div>
          <label>Due<input type="datetime-local" value={form.dueAt} onChange={(event) => setForm({ ...form, dueAt: event.target.value })} /></label>
          <div className="split">
            <label>Minutes<input type="number" min="10" max="240" value={form.estimateMinutes} onChange={(event) => setForm({ ...form, estimateMinutes: Number(event.target.value) })} /></label>
            <label>Reminder<input type="number" min="0" max="10080" value={form.reminderMinutesBefore} onChange={(event) => setForm({ ...form, reminderMinutesBefore: Number(event.target.value) })} /></label>
          </div>
          <button className="primary" onClick={createTask} disabled={saving || !form.title.trim()}><Plus /> Add to planner</button>
          <div className="control-row">
            <button onClick={() => drainReminders(false)} disabled={saving}><Play /> Drain due</button>
            <button onClick={() => drainReminders(true)} disabled={saving}><Zap /> Simulate retry</button>
          </div>
        </aside>

        <section className="plan-panel panel">
          <header className="panel-head">
            <div>
              <h2><Clock3 /> Today</h2>
              <small>{snapshot?.plan.plannedMinutes ?? 0} of {snapshot?.plan.capacityMinutes ?? 0} minutes planned</small>
            </div>
            <span className={snapshot?.plan.overload ? "badge warn" : "badge ok"}>{snapshot?.plan.overload ? "Overloaded" : "Balanced"}</span>
          </header>
          <meter min="0" max="100" value={snapshot?.plan.loadPercent ?? 0} />
          <div className="timeline">
            {(snapshot?.plan.slots || []).map((slot) => (
              <article key={`${slot.taskId}-${slot.startAt}`}>
                <time>{formatTime(slot.startAt)}-{formatTime(slot.endAt)}</time>
                <div>
                  <strong>{slot.title}</strong>
                  <span>{slot.reason} · {slot.estimateMinutes} min</span>
                </div>
                <PriorityBadge priority={slot.priority} />
              </article>
            ))}
            {snapshot?.plan.slots.length === 0 ? <p className="muted">No planned work yet.</p> : null}
          </div>
          {snapshot && snapshot.plan.unscheduled.length > 0 ? (
            <div className="overflow-box">
              <strong>Unscheduled</strong>
              {snapshot.plan.unscheduled.map((item) => <span key={item.taskId}>{item.title} · {item.reason}</span>)}
            </div>
          ) : null}
        </section>

        <aside className="queue-panel panel">
          <h2><ShieldCheck /> Reminder Queue</h2>
          <div className="queue-list">
            {(snapshot?.reminders || []).slice(0, 8).map((job) => (
              <article key={job.id}>
                <span className={`dot ${job.status}`} />
                <div>
                  <strong>{job.status}</strong>
                  <small>{formatDateTime(job.dueAt)} · attempts {job.attempts}</small>
                  {job.lastError ? <small>{job.lastError}</small> : null}
                </div>
              </article>
            ))}
          </div>
        </aside>
      </section>

      <section className="lower-grid">
        <div className="panel">
          <h2><ListChecks /> Tasks</h2>
          <div className="task-list">
            {(snapshot?.tasks || []).map((task) => (
              <article key={task.id}>
                <div>
                  <strong>{task.title}</strong>
                  <span>{task.category} · due {formatDateTime(task.dueAt)} · {task.estimateMinutes} min</span>
                </div>
                <PriorityBadge priority={task.priority} />
                <select value={task.status} onChange={(event) => updateStatus(task.id, event.target.value as Status)}>
                  <option value="todo">todo</option>
                  <option value="doing">doing</option>
                  <option value="done">done</option>
                  <option value="cancelled">cancelled</option>
                </select>
              </article>
            ))}
          </div>
        </div>
        <div className="panel">
          <h2><CheckCircle2 /> Audit Trail</h2>
          <div className="event-list">
            {(snapshot?.events || []).map((event) => (
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

function PriorityBadge({ priority }: { priority: Priority }) {
  return <span className={`priority ${priority}`}>{priority}</span>;
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(new Date(value));
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(value));
}
