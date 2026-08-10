# Smart Daily Planner Reminder POC

React, Node, Express, SQLite, and optional Redis proof-of-concept for everyday task planning, automatic daily schedules, reminder queues, retry handling, and operational visibility.

## Goal

Build a practical planner that turns tasks, bills, errands, habits, and appointments into a daily schedule while making the backend system behavior visible.

## What It Covers

- Task intake with priority, category, due date, estimate, and reminder lead time
- Idempotent task creation to prevent duplicate submissions
- SQLite persistence for tasks, generated plans, reminder jobs, and audit events
- Automatic daily plan generation with capacity and overload detection
- Reminder queue with due-job draining, temporary locks, retries, and dispatch state
- Optional Redis snapshot cache with in-memory fallback
- React dashboard for plan load, reminders, open tasks, due-soon work, and audit history

## Quick Start

```bash
cd smart-daily-planner-reminder-poc
npm install
npm run dev:api
```

In another terminal:

```bash
cd smart-daily-planner-reminder-poc
npm run dev
```

Open:

```text
http://127.0.0.1:5370
```

API:

```text
http://127.0.0.1:4370/api/health
```

## UI Flows

- Add a task with due date, priority, category, estimate, and reminder timing.
- Regenerate the daily plan and inspect scheduled versus unscheduled work.
- Mark tasks as todo, doing, done, or cancelled.
- Drain due reminders to simulate a background worker dispatching notifications.
- Simulate reminder provider failure to see retry scheduling.
- Reset the demo data.

## API Endpoints

- `GET /api/health`
- `GET /api/snapshot/:userId`
- `POST /api/tasks/:userId`
- `PATCH /api/tasks/:userId/:taskId/status`
- `POST /api/plan/:userId/generate`
- `POST /api/reminders/drain`
- `POST /api/reset/:userId`

Example task:

```bash
curl -X POST http://127.0.0.1:4370/api/tasks/demo-user \
  -H "Content-Type: application/json" \
  -d '{"title":"Pay rent","category":"bill","priority":"urgent","dueAt":"2026-08-10T22:00:00.000Z","estimateMinutes":15,"reminderMinutesBefore":180,"idempotencyKey":"demo-user:rent-august"}'
```

## Configuration

- `PORT`: API port. Defaults to `4370`.
- `REDIS_URL`: optional Redis connection string for snapshot caching.

Without Redis, the API uses an in-memory cache:

```bash
REDIS_URL=redis://127.0.0.1:6379 npm run dev:api
```

## Notes And Limitations

- Reminder dispatch is simulated by an API call instead of a long-running worker process.
- The daily planner uses deterministic priority scoring, not calendar-aware optimization.
- Authentication and multi-user isolation are simplified to a URL-level `userId`.
- SQLite is used for local portability.

## Technologies Used

- React
- TypeScript
- Vite
- Node.js
- Express
- SQLite via `node:sqlite`
- Redis client with memory fallback
