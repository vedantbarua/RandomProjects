const graceMinutes = 45;

export function buildCareSchedule({ medications, appointments, tasks, actions }, dateKey = todayKey(), nowInput = new Date().toISOString()) {
  const now = new Date(nowInput);
  const schedule = [];
  const actionByOccurrence = new Map(actions.map((action) => [action.occurrenceId, action]));

  for (const med of medications.filter((item) => item.active)) {
    for (const doseTime of med.times) {
      const dueAt = new Date(`${dateKey}T${doseTime}:00.000`);
      const occurrenceId = `dose:${med.id}:${dateKey}:${doseTime}`;
      const action = actionByOccurrence.get(occurrenceId);
      schedule.push({
        occurrenceId,
        entityId: med.id,
        kind: "medication",
        title: `${med.name} · ${med.dose}`,
        detail: `${med.instructions} · ${med.remainingDoses} doses left`,
        dueAt: dueAt.toISOString(),
        priority: med.critical ? "critical" : "normal",
        status: statusFor(dueAt, now, action),
        action
      });
    }
  }

  for (const appointment of appointments) {
    const dueAt = new Date(appointment.startsAt);
    if (dueAt.toISOString().slice(0, 10) !== dateKey) continue;
    const occurrenceId = `appointment:${appointment.id}:${dateKey}`;
    const action = actionByOccurrence.get(occurrenceId);
    schedule.push({
      occurrenceId,
      entityId: appointment.id,
      kind: "appointment",
      title: appointment.title,
      detail: `${appointment.provider} · ${appointment.location}`,
      dueAt: dueAt.toISOString(),
      priority: "high",
      status: statusFor(dueAt, now, action),
      action
    });
  }

  for (const task of tasks.filter((item) => item.status !== "done" && item.status !== "cancelled")) {
    const dueAt = new Date(task.dueAt);
    if (dueAt.toISOString().slice(0, 10) !== dateKey) continue;
    const occurrenceId = `task:${task.id}:${dateKey}`;
    const action = actionByOccurrence.get(occurrenceId);
    schedule.push({
      occurrenceId,
      entityId: task.id,
      kind: "care-task",
      title: task.title,
      detail: task.detail,
      dueAt: dueAt.toISOString(),
      priority: task.priority,
      status: statusFor(dueAt, now, action),
      action
    });
  }

  return schedule.sort((a, b) => new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime());
}

export function buildRefillRisks(medications) {
  return medications
    .filter((med) => med.active)
    .map((med) => {
      const dailyUse = Math.max(1, med.times.length);
      const daysLeft = Math.floor(med.remainingDoses / dailyUse);
      return {
        medicationId: med.id,
        name: med.name,
        remainingDoses: med.remainingDoses,
        daysLeft,
        thresholdDays: med.refillThresholdDays,
        risk: daysLeft <= med.refillThresholdDays ? "refill-soon" : "ok"
      };
    })
    .sort((a, b) => a.daysLeft - b.daysLeft);
}

export function todayKey(now = new Date()) {
  return now.toISOString().slice(0, 10);
}

function statusFor(dueAt, now, action) {
  if (action) return action.action;
  const diffMinutes = (dueAt.getTime() - now.getTime()) / 60000;
  if (diffMinutes < -graceMinutes) return "missed";
  if (diffMinutes < 0) return "late";
  if (diffMinutes <= 90) return "due-soon";
  return "scheduled";
}
