const checklistByCategory = {
  appliance: ["receipt", "serial number photo", "issue photos", "model label photo"],
  electronics: ["receipt", "serial number photo", "diagnostic notes", "issue photos"],
  furniture: ["receipt", "damage photos", "warranty card"],
  vehicle: ["purchase record", "service records", "issue photos", "VIN photo"],
  home: ["contract", "inspection notes", "issue photos", "provider invoice"]
};

export function buildWarrantyInsights(items, claims, documents, jobs, nowInput = new Date().toISOString()) {
  const now = new Date(nowInput);
  const docsByClaim = groupBy(documents, "claimId");
  const openClaims = claims.filter((claim) => !["completed", "denied", "withdrawn"].includes(claim.status));
  const expiringItems = items
    .map((item) => ({ ...item, daysUntilExpiry: daysBetween(now, new Date(item.warrantyEndsAt)) }))
    .filter((item) => item.daysUntilExpiry <= 45)
    .sort((a, b) => a.daysUntilExpiry - b.daysUntilExpiry);
  const missingDocuments = openClaims.flatMap((claim) => {
    const provided = new Set((docsByClaim.get(claim.id) || []).map((doc) => doc.type));
    return claim.requiredDocuments
      .filter((docType) => !provided.has(docType))
      .map((docType) => ({ claimId: claim.id, itemId: claim.itemId, docType }));
  });

  return {
    expiringItems,
    missingDocuments,
    openClaims,
    queuedJobs: jobs.filter((job) => job.status === "queued"),
    retryingJobs: jobs.filter((job) => job.status === "queued" && job.attempts > 0),
    overdueJobs: jobs.filter((job) => job.status === "queued" && new Date(job.runAt) <= now),
    stats: {
      totalItems: items.length,
      expiringSoon: expiringItems.length,
      openClaims: openClaims.length,
      missingDocuments: missingDocuments.length,
      queuedFollowUps: jobs.filter((job) => job.status === "queued").length,
      failedAttempts: jobs.reduce((total, job) => total + job.attempts, 0)
    }
  };
}

export function checklistFor(category) {
  return checklistByCategory[category] || checklistByCategory.electronics;
}

export function warrantyEndsAt(purchaseDate, warrantyMonths) {
  const date = new Date(`${purchaseDate}T00:00:00.000`);
  date.setMonth(date.getMonth() + Number(warrantyMonths || 12));
  return date.toISOString();
}

export function nextFollowUpFor(status, now = new Date()) {
  const days = {
    draft: 1,
    submitted: 5,
    waiting: 7,
    approved: 3,
    denied: 2,
    completed: 30,
    withdrawn: 30
  }[status] || 5;
  return new Date(now.getTime() + days * 24 * 60 * 60 * 1000).toISOString();
}

function groupBy(values, key) {
  const grouped = new Map();
  for (const value of values) {
    const groupKey = value[key];
    grouped.set(groupKey, [...(grouped.get(groupKey) || []), value]);
  }
  return grouped;
}

function daysBetween(start, end) {
  return Math.ceil((end.getTime() - start.getTime()) / 86400000);
}
