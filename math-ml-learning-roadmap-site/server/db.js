import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const dataDir = path.resolve("data");
mkdirSync(dataDir, { recursive: true });

const db = new DatabaseSync(path.join(dataDir, "learning-roadmap.db"));

db.exec(`
  CREATE TABLE IF NOT EXISTS learner_progress (
    user_id TEXT PRIMARY KEY,
    active_id TEXT NOT NULL,
    pace TEXT NOT NULL,
    completed_json TEXT NOT NULL,
    bookmarked_json TEXT NOT NULL,
    notes TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS weekly_plans (
    user_id TEXT PRIMARY KEY,
    plan_json TEXT NOT NULL,
    generated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS assessment_questions (
    id TEXT PRIMARY KEY,
    step_id TEXT NOT NULL,
    topic TEXT NOT NULL,
    type TEXT NOT NULL,
    prompt TEXT NOT NULL,
    choices_json TEXT NOT NULL,
    answer TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS assessment_attempts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    step_id TEXT NOT NULL,
    score INTEGER NOT NULL,
    total INTEGER NOT NULL,
    answers_json TEXT NOT NULL,
    weak_topics_json TEXT NOT NULL,
    recommendation TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_assessment_attempts_user_step ON assessment_attempts(user_id, step_id, created_at);
`);

const defaultProgress = {
  activeId: "algebra",
  pace: "steady",
  completed: ["algebra"],
  bookmarked: ["linear-algebra-intuition"],
  notes: "Pair intuition with mechanics: watch the visual lesson before heavy exercises, then summarize the idea in your own words."
};

export function getProgress(userId) {
  const row = db.prepare("SELECT * FROM learner_progress WHERE user_id = ?").get(userId);
  if (!row) {
    return saveProgress(userId, defaultProgress);
  }

  return {
    userId,
    activeId: row.active_id,
    pace: row.pace,
    completed: JSON.parse(row.completed_json),
    bookmarked: JSON.parse(row.bookmarked_json),
    notes: row.notes,
    updatedAt: row.updated_at
  };
}

export function saveProgress(userId, progress) {
  const updatedAt = new Date().toISOString();
  db.prepare(`
    INSERT INTO learner_progress (user_id, active_id, pace, completed_json, bookmarked_json, notes, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET
      active_id = excluded.active_id,
      pace = excluded.pace,
      completed_json = excluded.completed_json,
      bookmarked_json = excluded.bookmarked_json,
      notes = excluded.notes,
      updated_at = excluded.updated_at
  `).run(
    userId,
    progress.activeId || defaultProgress.activeId,
    progress.pace || defaultProgress.pace,
    JSON.stringify(Array.isArray(progress.completed) ? progress.completed : []),
    JSON.stringify(Array.isArray(progress.bookmarked) ? progress.bookmarked : []),
    typeof progress.notes === "string" ? progress.notes : defaultProgress.notes,
    updatedAt
  );

  return getProgressRow(userId);
}

export function saveWeeklyPlan(userId, plan) {
  const generatedAt = new Date().toISOString();
  db.prepare(`
    INSERT INTO weekly_plans (user_id, plan_json, generated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET
      plan_json = excluded.plan_json,
      generated_at = excluded.generated_at
  `).run(userId, JSON.stringify(plan), generatedAt);
  return { userId, plan, generatedAt };
}

export function getWeeklyPlan(userId) {
  const row = db.prepare("SELECT * FROM weekly_plans WHERE user_id = ?").get(userId);
  if (!row) return { userId, plan: [], generatedAt: null };
  return {
    userId,
    plan: JSON.parse(row.plan_json),
    generatedAt: row.generated_at
  };
}

export function seedAssessmentQuestions(questions) {
  const insert = db.prepare(`
    INSERT OR IGNORE INTO assessment_questions
      (id, step_id, topic, type, prompt, choices_json, answer)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  for (const question of Array.isArray(questions) ? questions : []) {
    if (!question.id || !question.stepId || !question.topic || !question.type || !question.prompt || !question.answer) continue;
    insert.run(
      question.id,
      question.stepId,
      question.topic,
      question.type,
      question.prompt,
      JSON.stringify(Array.isArray(question.choices) ? question.choices : []),
      question.answer
    );
  }
}

export function getAssessment(userId, stepId) {
  const questions = db.prepare(`
    SELECT * FROM assessment_questions
    WHERE step_id = ?
    ORDER BY id ASC
  `).all(stepId).map(questionFromRow);

  const latestAttempt = getLatestAttempt(userId, stepId);
  return { stepId, questions, latestAttempt };
}

export function submitAssessment(userId, stepId, answers) {
  const questions = db.prepare("SELECT * FROM assessment_questions WHERE step_id = ? ORDER BY id ASC").all(stepId).map(questionFromRow);
  const answerMap = answers && typeof answers === "object" ? answers : {};
  let score = 0;
  const weakTopics = [];

  for (const question of questions) {
    const submitted = String(answerMap[question.id] || "").trim();
    const expected = String(question.answer).trim();
    const isCorrect = question.type === "explain"
      ? submitted.length >= 40
      : submitted.toLowerCase() === expected.toLowerCase();
    if (isCorrect) {
      score += 1;
    } else if (!weakTopics.includes(question.topic)) {
      weakTopics.push(question.topic);
    }
  }

  const total = questions.length;
  const percent = total === 0 ? 0 : Math.round((score / total) * 100);
  const recommendation = recommendationFor(percent, weakTopics);
  const createdAt = new Date().toISOString();

  const result = db.prepare(`
    INSERT INTO assessment_attempts
      (user_id, step_id, score, total, answers_json, weak_topics_json, recommendation, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(userId, stepId, score, total, JSON.stringify(answerMap), JSON.stringify(weakTopics), recommendation, createdAt);

  return {
    id: Number(result.lastInsertRowid),
    userId,
    stepId,
    score,
    total,
    percent,
    weakTopics,
    recommendation,
    createdAt
  };
}

export function getMasterySummary(userId) {
  const attempts = db.prepare(`
    SELECT * FROM assessment_attempts
    WHERE user_id = ?
    ORDER BY created_at DESC
  `).all(userId).map(attemptFromRow);
  const latestByStep = new Map();

  for (const attempt of attempts) {
    if (!latestByStep.has(attempt.stepId)) latestByStep.set(attempt.stepId, attempt);
  }

  const latestAttempts = Array.from(latestByStep.values());
  const averageMastery = latestAttempts.length === 0
    ? 0
    : Math.round(latestAttempts.reduce((sum, attempt) => sum + attempt.percent, 0) / latestAttempts.length);
  const weakTopicCounts = new Map();

  for (const attempt of latestAttempts) {
    for (const topic of attempt.weakTopics) {
      weakTopicCounts.set(topic, (weakTopicCounts.get(topic) || 0) + 1);
    }
  }

  const weakTopics = Array.from(weakTopicCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([topic, count]) => ({ topic, count }));

  return {
    userId,
    averageMastery,
    attemptedSteps: latestAttempts.length,
    latestAttempts,
    weakTopics,
    nextAction: weakTopics.length > 0
      ? `Review ${weakTopics[0].topic}, then retake the weakest assessment.`
      : "Take the active assessment to unlock mastery analytics."
  };
}

function getProgressRow(userId) {
  const row = db.prepare("SELECT * FROM learner_progress WHERE user_id = ?").get(userId);
  return {
    userId,
    activeId: row.active_id,
    pace: row.pace,
    completed: JSON.parse(row.completed_json),
    bookmarked: JSON.parse(row.bookmarked_json),
    notes: row.notes,
    updatedAt: row.updated_at
  };
}

function questionFromRow(row) {
  return {
    id: row.id,
    stepId: row.step_id,
    topic: row.topic,
    type: row.type,
    prompt: row.prompt,
    choices: JSON.parse(row.choices_json),
    answer: row.answer
  };
}

function attemptFromRow(row) {
  const total = Number(row.total);
  const score = Number(row.score);
  return {
    id: row.id,
    userId: row.user_id,
    stepId: row.step_id,
    score,
    total,
    percent: total === 0 ? 0 : Math.round((score / total) * 100),
    answers: JSON.parse(row.answers_json),
    weakTopics: JSON.parse(row.weak_topics_json),
    recommendation: row.recommendation,
    createdAt: row.created_at
  };
}

function getLatestAttempt(userId, stepId) {
  const row = db.prepare(`
    SELECT * FROM assessment_attempts
    WHERE user_id = ? AND step_id = ?
    ORDER BY created_at DESC
    LIMIT 1
  `).get(userId, stepId);
  return row ? attemptFromRow(row) : null;
}

function recommendationFor(percent, weakTopics) {
  if (percent >= 85) return "Ready to move forward. Keep this topic in spaced review.";
  if (percent >= 60) return `Review ${weakTopics.slice(0, 2).join(" and ") || "missed topics"} and retake tomorrow.`;
  return `Pause advancement. Rewatch intuition resources and drill ${weakTopics[0] || "the foundations"}.`;
}
