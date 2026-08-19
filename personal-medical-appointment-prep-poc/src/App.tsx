import { useEffect, useMemo, useState } from "react";
import {
  Bell,
  CalendarCheck2,
  CheckCircle2,
  ClipboardCheck,
  ClipboardList,
  FileText,
  HeartPulse,
  HelpCircle,
  History,
  MessageSquarePlus,
  NotebookPen,
  Plus,
  RefreshCcw,
  RotateCcw,
  Send,
  Stethoscope,
  TimerReset,
  XCircle
} from "lucide-react";

type Appointment = {
  id: string;
  clinician: string;
  specialty: string;
  location: string;
  startsAt: string;
  reason: string;
  status: "scheduled";
};

type Symptom = {
  id: string;
  title: string;
  severity: "low" | "medium" | "high";
  startedAt: string;
  frequency: string;
  notes: string;
  status: "active";
};

type Question = {
  id: string;
  text: string;
  priority: "low" | "medium" | "high";
  status: "open";
};

type PrepTask = {
  id: string;
  title: string;
  status: "open" | "done";
  dueAt: string;
};

type Instruction = {
  id: string;
  title: string;
  owner: string;
  dueAt: string;
  status: "open" | "in_progress" | "done";
};

type Summary = {
  id: string;
  title: string;
  checksum: string;
  status: string;
  createdAt: string;
  payload: { symptoms: Symptom[]; questions: Question[]; openTasks: PrepTask[] };
};

type ReminderJob = {
  id: string;
  kind: string;
  title: string;
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
  appointments: Appointment[];
  symptoms: Symptom[];
  questions: Question[];
  tasks: PrepTask[];
  instructions: Instruction[];
  summaries: Summary[];
  reminders: ReminderJob[];
  audits: AuditEvent[];
  insights: {
    upcoming?: Appointment;
    openPrepTasks: PrepTask[];
    unansweredQuestions: Question[];
    activeSymptoms: Symptom[];
    pendingInstructions: Instruction[];
    queuedReminders: ReminderJob[];
    retryingReminders: ReminderJob[];
    recentSummaries: Summary[];
    stats: {
      totalAppointments: number;
      openPrepTasks: number;
      activeSymptoms: number;
      unansweredQuestions: number;
      pendingInstructions: number;
      queuedReminders: number;
    };
  };
  cacheHit?: boolean;
};

const userId = "appointment-prep-demo";

export default function App() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [apiStatus, setApiStatus] = useState("Connecting");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [symptomForm, setSymptomForm] = useState({
    title: "Headache after screen time",
    severity: "medium" as "low" | "medium" | "high",
    frequency: "2 times this week",
    notes: "Usually late afternoon"
  });
  const [questionText, setQuestionText] = useState("Should I adjust my medication before fasting labs?");

  const upcoming = useMemo(() => snapshot?.insights.upcoming, [snapshot]);
  const firstOpenTask = useMemo(() => snapshot?.insights.openPrepTasks[0], [snapshot]);
  const firstInstruction = useMemo(() => snapshot?.insights.pendingInstructions[0], [snapshot]);

  useEffect(() => {
    loadSnapshot();
  }, []);

  async function loadSnapshot() {
    try {
      const [healthRes, snapshotRes] = await Promise.all([
        fetch("/api/health"),
        fetch(`/api/snapshot/${userId}`)
      ]);
      if (!healthRes.ok || !snapshotRes.ok) throw new Error("Appointment prep API unavailable");
      const health = await healthRes.json() as { cache: string };
      const payload = await snapshotRes.json() as Snapshot;
      setSnapshot(payload);
      setApiStatus(`API online · ${health.cache} cache${payload.cacheHit ? " · cached" : ""}`);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Appointment prep API unavailable");
    }
  }

  async function addSymptom() {
    setSaving(true);
    try {
      const res = await fetch(`/api/symptoms/${userId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...symptomForm, startedAt: new Date().toISOString() })
      });
      if (!res.ok) throw new Error("Symptom creation failed");
      await loadSnapshot();
      setSymptomForm((current) => ({ ...current, title: "", notes: "" }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Symptom creation failed");
    } finally {
      setSaving(false);
    }
  }

  async function addQuestion() {
    if (!upcoming) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/questions/${userId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ appointmentId: upcoming.id, text: questionText, priority: "high" })
      });
      if (!res.ok) throw new Error("Question creation failed");
      await loadSnapshot();
      setQuestionText("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Question creation failed");
    } finally {
      setSaving(false);
    }
  }

  async function completeTask(taskId = firstOpenTask?.id) {
    if (!taskId) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/tasks/${userId}/${taskId}/complete`, { method: "POST" });
      if (!res.ok) throw new Error("Task completion failed");
      await loadSnapshot();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Task completion failed");
    } finally {
      setSaving(false);
    }
  }

  async function updateInstruction(instructionId = firstInstruction?.id, status = "done") {
    if (!instructionId) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/instructions/${userId}/${instructionId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status })
      });
      if (!res.ok) throw new Error("Instruction update failed");
      await loadSnapshot();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Instruction update failed");
    } finally {
      setSaving(false);
    }
  }

  async function generateSummary() {
    if (!upcoming) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/summaries/${userId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ appointmentId: upcoming.id })
      });
      if (!res.ok) throw new Error("Summary generation failed");
      await loadSnapshot();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Summary generation failed");
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
          <Stethoscope size={42} />
          <h1>Appointment Prep</h1>
          <p>{error || "Loading appointment workspace..."}</p>
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
            <span className="eyebrow"><CalendarCheck2 size={16} /> Appointment command center</span>
            <h1>Medical Appointment Prep & Follow-Up</h1>
            <p>Keep symptoms, questions, prep tasks, after-visit instructions, reminder retries, and shareable summaries organized before and after care visits.</p>
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
        <Metric icon={<CalendarCheck2 />} label="Appointments" value={snapshot.insights.stats.totalAppointments} />
        <Metric icon={<ClipboardCheck />} label="Open prep tasks" value={snapshot.insights.stats.openPrepTasks} tone="warn" />
        <Metric icon={<HeartPulse />} label="Active symptoms" value={snapshot.insights.stats.activeSymptoms} />
        <Metric icon={<HelpCircle />} label="Open questions" value={snapshot.insights.stats.unansweredQuestions} tone="warn" />
        <Metric icon={<Bell />} label="Queued reminders" value={snapshot.insights.stats.queuedReminders} />
      </section>

      {upcoming && (
        <section className="appointment-strip">
          <div>
            <strong>{upcoming.specialty} with {upcoming.clinician}</strong>
            <span>{formatDate(upcoming.startsAt)} · {upcoming.location}</span>
            <p>{upcoming.reason}</p>
          </div>
          <button onClick={generateSummary} disabled={saving}><FileText size={16} /> Generate summary</button>
        </section>
      )}

      <section className="workbench">
        <div className="panel">
          <div className="panel-heading">
            <h2><NotebookPen size={18} /> Add symptom note</h2>
            <span>timeline</span>
          </div>
          <div className="form-grid">
            <label>Symptom<input value={symptomForm.title} onChange={(event) => setSymptomForm({ ...symptomForm, title: event.target.value })} /></label>
            <label>Severity<select value={symptomForm.severity} onChange={(event) => setSymptomForm({ ...symptomForm, severity: event.target.value as "low" | "medium" | "high" })}>
              <option>low</option>
              <option>medium</option>
              <option>high</option>
            </select></label>
            <label>Frequency<input value={symptomForm.frequency} onChange={(event) => setSymptomForm({ ...symptomForm, frequency: event.target.value })} /></label>
            <label>Notes<input value={symptomForm.notes} onChange={(event) => setSymptomForm({ ...symptomForm, notes: event.target.value })} /></label>
          </div>
          <button onClick={addSymptom} disabled={saving || !symptomForm.title}><Plus size={16} /> Add symptom</button>
        </div>

        <div className="panel">
          <div className="panel-heading">
            <h2><MessageSquarePlus size={18} /> Add question</h2>
            <span>visit agenda</span>
          </div>
          <label>Question<input value={questionText} onChange={(event) => setQuestionText(event.target.value)} /></label>
          <div className="queue-actions">
            <button onClick={addQuestion} disabled={saving || !questionText}><Plus size={16} /> Add question</button>
            <button className="secondary" onClick={() => completeTask()} disabled={saving || !firstOpenTask}><CheckCircle2 size={16} /> Complete next task</button>
            <button className="secondary" onClick={() => updateInstruction()} disabled={saving || !firstInstruction}><ClipboardCheck size={16} /> Finish instruction</button>
          </div>
        </div>
      </section>

      <section className="content-grid">
        <Panel title="Prep checklist" icon={<ClipboardList size={18} />}>
          {snapshot.tasks.map((task) => (
            <div className="task-row" key={task.id}>
              <div>
                <strong>{task.title}</strong>
                <span>due {formatDate(task.dueAt)}</span>
              </div>
              <div className="row-actions">
                <span className={`state ${task.status}`}>{task.status}</span>
                {task.status === "open" && <button className="secondary" onClick={() => completeTask(task.id)} disabled={saving}><CheckCircle2 size={16} /> Done</button>}
              </div>
            </div>
          ))}
        </Panel>

        <Panel title="Symptom timeline" icon={<HeartPulse size={18} />}>
          {snapshot.symptoms.map((symptom) => (
            <div className="compact-row" key={symptom.id}>
              <div>
                <strong>{symptom.title}</strong>
                <span>{symptom.frequency} · started {formatDate(symptom.startedAt)}</span>
                <small>{symptom.notes}</small>
              </div>
              <span className={`severity ${symptom.severity}`}>{symptom.severity}</span>
            </div>
          ))}
        </Panel>

        <Panel title="Questions" icon={<HelpCircle size={18} />}>
          {snapshot.questions.map((question) => (
            <div className="compact-row" key={question.id}>
              <div>
                <strong>{question.text}</strong>
                <span>{question.priority} priority</span>
              </div>
              <span className="state open">{question.status}</span>
            </div>
          ))}
        </Panel>

        <Panel title="After-visit instructions" icon={<ClipboardCheck size={18} />}>
          {snapshot.instructions.map((instruction) => (
            <div className="task-row" key={instruction.id}>
              <div>
                <strong>{instruction.title}</strong>
                <span>{instruction.owner} · due {formatDate(instruction.dueAt)}</span>
              </div>
              <div className="row-actions">
                <span className={`state ${instruction.status}`}>{instruction.status}</span>
                {instruction.status !== "done" && <button className="secondary" onClick={() => updateInstruction(instruction.id)} disabled={saving}><CheckCircle2 size={16} /> Done</button>}
              </div>
            </div>
          ))}
        </Panel>

        <Panel title="Summary exports" icon={<FileText size={18} />}>
          {snapshot.summaries.length === 0 && <p className="empty">No summary generated yet.</p>}
          {snapshot.insights.recentSummaries.map((summary) => (
            <div className="compact-row" key={summary.id}>
              <div>
                <strong>{summary.title}</strong>
                <span>{summary.payload.symptoms.length} symptoms · {summary.payload.questions.length} questions · checksum {summary.checksum}</span>
              </div>
              <span className="state done">{summary.status}</span>
            </div>
          ))}
        </Panel>

        <Panel title="Reminder queue" icon={<TimerReset size={18} />}>
          <div className="queue-actions">
            <button onClick={() => drainReminders(false)} disabled={saving}><Send size={16} /> Drain due</button>
            <button className="secondary" onClick={() => drainReminders(true)} disabled={saving}><RefreshCcw size={16} /> Simulate retry</button>
          </div>
          {snapshot.insights.queuedReminders.slice(0, 8).map((job) => (
            <div className="compact-row" key={job.id}>
              <div>
                <strong>{job.title}</strong>
                <span>{job.kind} · run {formatDate(job.runAt)} · attempts {job.attempts}</span>
                {job.lastError && <small>{job.lastError}</small>}
              </div>
              <span className="state open">{job.status}</span>
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
  return new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}
