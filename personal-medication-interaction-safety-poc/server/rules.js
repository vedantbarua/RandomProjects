const interactionRules = [
  {
    id: "warfarin-ibuprofen",
    ingredients: ["warfarin", "ibuprofen"],
    severity: "critical",
    title: "Bleeding risk",
    guidance: "Ask a clinician before combining blood thinners with NSAIDs."
  },
  {
    id: "lisinopril-potassium",
    ingredients: ["lisinopril", "potassium"],
    severity: "high",
    title: "Potassium monitoring",
    guidance: "Monitor potassium levels and kidney function."
  },
  {
    id: "metformin-contrast",
    ingredients: ["metformin", "iodinated contrast"],
    severity: "medium",
    title: "Contrast procedure check",
    guidance: "Confirm instructions around imaging procedures."
  },
  {
    id: "simvastatin-clarithromycin",
    ingredients: ["simvastatin", "clarithromycin"],
    severity: "critical",
    title: "Muscle injury risk",
    guidance: "Contact prescriber before taking these together."
  }
];

export function evaluateSafety(medications, doseLogs = []) {
  const active = medications.filter((med) => med.status === "active");
  const warnings = [
    ...findInteractions(active),
    ...findDuplicateIngredients(active),
    ...findRefillRisks(active),
    ...findMissedDoseRisks(active, doseLogs)
  ];
  return warnings.sort((a, b) => severityRank(b.severity) - severityRank(a.severity));
}

function findInteractions(medications) {
  const ingredients = new Map();
  medications.forEach((med) => {
    normalizeIngredient(med.ingredient).split("+").forEach((ingredient) => {
      ingredients.set(ingredient.trim(), med);
    });
  });

  return interactionRules
    .filter((rule) => rule.ingredients.every((ingredient) => ingredients.has(ingredient)))
    .map((rule) => ({
      id: `interaction:${rule.id}`,
      type: "interaction",
      severity: rule.severity,
      title: rule.title,
      message: `${rule.ingredients.join(" + ")} appears in the active med list.`,
      guidance: rule.guidance,
      medicationIds: rule.ingredients.map((ingredient) => ingredients.get(ingredient).id)
    }));
}

function findDuplicateIngredients(medications) {
  const grouped = new Map();
  medications.forEach((med) => {
    const ingredient = normalizeIngredient(med.ingredient);
    if (!grouped.has(ingredient)) grouped.set(ingredient, []);
    grouped.get(ingredient).push(med);
  });

  return Array.from(grouped.entries())
    .filter(([, meds]) => meds.length > 1)
    .map(([ingredient, meds]) => ({
      id: `duplicate:${ingredient}`,
      type: "duplicate_ingredient",
      severity: "high",
      title: "Duplicate active ingredient",
      message: `${ingredient} appears in ${meds.length} active medications.`,
      guidance: "Confirm these are not accidental duplicates.",
      medicationIds: meds.map((med) => med.id)
    }));
}

function findRefillRisks(medications) {
  return medications
    .filter((med) => Number(med.supplyDaysRemaining) <= Number(med.refillThresholdDays))
    .map((med) => ({
      id: `refill:${med.id}`,
      type: "refill_risk",
      severity: Number(med.supplyDaysRemaining) <= 2 ? "critical" : "medium",
      title: "Refill risk",
      message: `${med.name} has ${med.supplyDaysRemaining} supply days remaining.`,
      guidance: `Request refill from ${med.pharmacy}.`,
      medicationIds: [med.id]
    }));
}

function findMissedDoseRisks(medications, doseLogs) {
  const today = new Date().toISOString().slice(0, 10);
  const takenToday = new Set(
    doseLogs
      .filter((log) => log.status === "taken" && String(log.takenAt || "").startsWith(today))
      .map((log) => log.medicationId)
  );
  return medications
    .filter((med) => med.schedule.includes("daily") && !takenToday.has(med.id))
    .map((med) => ({
      id: `missed:${med.id}`,
      type: "missed_dose",
      severity: med.criticalDose ? "high" : "low",
      title: "Dose not logged today",
      message: `${med.name} has no taken dose logged today.`,
      guidance: "Log the dose or snooze the reminder if it was skipped intentionally.",
      medicationIds: [med.id]
    }));
}

function normalizeIngredient(value) {
  return String(value || "").trim().toLowerCase();
}

function severityRank(severity) {
  return { low: 1, medium: 2, high: 3, critical: 4 }[severity] || 0;
}
