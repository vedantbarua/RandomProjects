const severityWeights = {
  critical: 100,
  high: 75,
  medium: 45,
  low: 20
};

export function matchRecallToItems(recall, items) {
  return items
    .map((item) => ({ item, score: scoreMatch(recall, item), reasons: reasonsFor(recall, item) }))
    .filter((match) => match.score >= 60)
    .sort((a, b) => b.score - a.score);
}

export function buildInsights({ items, recalls, alerts, jobs }) {
  const openAlerts = alerts.filter((alert) => ["open", "acknowledged"].includes(alert.status));
  const urgentAlerts = openAlerts.filter((alert) => alert.severity === "critical" || alert.severity === "high");
  const affectedItemIds = new Set(openAlerts.map((alert) => alert.itemId));
  return {
    openAlerts,
    urgentAlerts,
    affectedItems: items.filter((item) => affectedItemIds.has(item.id)),
    recentRecalls: recalls.slice().sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()).slice(0, 5),
    queuedJobs: jobs.filter((job) => job.status === "queued"),
    retryingJobs: jobs.filter((job) => job.status === "queued" && job.attempts > 0),
    stats: {
      totalItems: items.length,
      recallFeed: recalls.length,
      openAlerts: openAlerts.length,
      urgentAlerts: urgentAlerts.length,
      affectedItems: affectedItemIds.size,
      queuedNotifications: jobs.filter((job) => job.status === "queued").length,
      failedAttempts: jobs.reduce((total, job) => total + job.attempts, 0)
    }
  };
}

function scoreMatch(recall, item) {
  let score = 0;
  if (same(recall.category, item.category)) score += 20;
  if (same(recall.brand, item.brand)) score += 35;
  if (modelMatches(recall.modelPattern, item.model)) score += 35;
  if (serialMatches(recall.serialPattern, item.serialNumber)) score += 25;
  return Math.min(100, score);
}

function reasonsFor(recall, item) {
  const reasons = [];
  if (same(recall.category, item.category)) reasons.push("category");
  if (same(recall.brand, item.brand)) reasons.push("brand");
  if (modelMatches(recall.modelPattern, item.model)) reasons.push("model");
  if (serialMatches(recall.serialPattern, item.serialNumber)) reasons.push("serial");
  reasons.push(`${severityWeights[recall.severity] || 20} severity weight`);
  return reasons;
}

function same(left, right) {
  return String(left || "").trim().toLowerCase() === String(right || "").trim().toLowerCase();
}

function modelMatches(pattern, model) {
  const normalizedPattern = String(pattern || "*").trim().toLowerCase();
  const normalizedModel = String(model || "").trim().toLowerCase();
  if (normalizedPattern === "*") return true;
  if (normalizedPattern.endsWith("*")) return normalizedModel.startsWith(normalizedPattern.slice(0, -1));
  return normalizedPattern === normalizedModel;
}

function serialMatches(pattern, serialNumber) {
  const normalizedPattern = String(pattern || "*").trim().toLowerCase();
  const normalizedSerial = String(serialNumber || "").trim().toLowerCase();
  if (normalizedPattern === "*") return true;
  if (normalizedPattern.endsWith("*")) return normalizedSerial.startsWith(normalizedPattern.slice(0, -1));
  return normalizedPattern === normalizedSerial;
}
