const workdayStartHour = 8;
const workdayEndHour = 20;

export function buildDailyPlan(tasks, dateInput = todayKey()) {
  const date = parseDateKey(dateInput);
  const start = new Date(date);
  start.setHours(workdayStartHour, 0, 0, 0);
  const end = new Date(date);
  end.setHours(workdayEndHour, 0, 0, 0);
  let cursor = new Date(start);

  const candidates = tasks
    .filter((task) => task.status !== "done" && task.status !== "cancelled")
    .map((task) => ({ ...task, pressure: scoreTask(task, date) }))
    .sort((a, b) => b.pressure - a.pressure || new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime());

  const slots = [];
  const unscheduled = [];

  for (const task of candidates) {
    const estimate = Math.max(15, Math.min(Number(task.estimateMinutes) || 30, 180));
    const taskStart = new Date(Math.max(cursor.getTime(), task.earliestAt ? new Date(task.earliestAt).getTime() : start.getTime()));
    const taskEnd = new Date(taskStart.getTime() + estimate * 60 * 1000);

    if (taskEnd <= end) {
      slots.push({
        taskId: task.id,
        title: task.title,
        category: task.category,
        priority: task.priority,
        startAt: taskStart.toISOString(),
        endAt: taskEnd.toISOString(),
        estimateMinutes: estimate,
        reason: reasonFor(task, date)
      });
      cursor = new Date(taskEnd.getTime() + 10 * 60 * 1000);
    } else {
      unscheduled.push({
        taskId: task.id,
        title: task.title,
        estimateMinutes: estimate,
        reason: "No remaining capacity today"
      });
    }
  }

  const plannedMinutes = slots.reduce((total, slot) => total + slot.estimateMinutes, 0);
  const capacityMinutes = (workdayEndHour - workdayStartHour) * 60;
  return {
    date: dateInput,
    generatedAt: new Date().toISOString(),
    capacityMinutes,
    plannedMinutes,
    loadPercent: Math.round((plannedMinutes / capacityMinutes) * 100),
    overload: unscheduled.length > 0 || plannedMinutes > capacityMinutes * 0.9,
    slots,
    unscheduled
  };
}

export function todayKey(now = new Date()) {
  return now.toISOString().slice(0, 10);
}

function parseDateKey(value) {
  const date = new Date(`${value}T00:00:00.000`);
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

function scoreTask(task, date) {
  const priorityScore = { urgent: 90, high: 70, medium: 45, low: 20 }[task.priority] || 45;
  const dueAt = new Date(task.dueAt);
  const hoursUntilDue = (dueAt.getTime() - date.getTime()) / 36e5;
  const duePressure = hoursUntilDue <= 0 ? 100 : Math.max(0, 80 - hoursUntilDue);
  const categoryBoost = task.category === "bill" || task.category === "appointment" ? 18 : 0;
  return priorityScore + duePressure + categoryBoost;
}

function reasonFor(task, date) {
  const dueAt = new Date(task.dueAt);
  if (dueAt.toDateString() === date.toDateString()) return "Due today";
  if (task.priority === "urgent") return "Urgent priority";
  if (task.category === "bill") return "Bill deadline protection";
  if (task.category === "habit") return "Daily routine consistency";
  return "Best fit by priority and available time";
}
