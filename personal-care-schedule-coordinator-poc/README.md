# Personal Care Schedule Coordinator POC

React, Node, Express, SQLite, and optional Redis proof-of-concept for coordinating medications, appointments, care tasks, refill risk, reminders, escalation, and audit history.

## Goal

Build a practical everyday care coordinator that shows how higher-stakes reminders can be modeled with durable state transitions, retryable jobs, idempotent commands, and escalation visibility.

## What It Covers

- Medication schedules with multiple dose times per day
- Appointment and care-task schedule generation
- Dose actions: taken, skipped, late, missed, completed, and cancelled
- Remaining-dose tracking and refill-risk calculation
- Reminder jobs with due scans, leases, retries, and simulated provider failures
- Escalation flags for failed critical medication reminders
- Idempotent medication creation and care-action recording
- SQLite persistence for source-of-truth state
- Optional Redis snapshot cache with in-memory fallback
- React dashboard for today’s schedule, refill risk, reminder queue, contacts, and audits

## Quick Start

```bash
cd personal-care-schedule-coordinator-poc
npm install
npm run dev:api
```

In another terminal:

```bash
cd personal-care-schedule-coordinator-poc
npm run dev
```

Open:

```text
http://127.0.0.1:5380
```

API:

```text
http://127.0.0.1:4380/api/health
```

## UI Flows

- View today’s care schedule across medications, appointments, and care tasks.
- Mark a medication dose as taken or skipped.
- Mark appointment and care tasks as completed.
- Add a new medication with dose times and refill threshold.
- Record a refill to reduce refill risk.
- Drain due reminders to simulate a worker dispatch.
- Simulate reminder provider failure to trigger retry and escalation paths.
- Reset the demo state.

## API Endpoints

- `GET /api/health`
- `GET /api/snapshot/:userId`
- `POST /api/medications/:userId`
- `POST /api/actions/:userId`
- `POST /api/refills/:userId/:medicationId`
- `POST /api/schedule/:userId/rebuild`
- `POST /api/reminders/drain`
- `POST /api/reset/:userId`

Example medication:

```bash
curl -X POST http://127.0.0.1:4380/api/medications/care-demo \
  -H "Content-Type: application/json" \
  -d '{"name":"Magnesium","dose":"200mg","instructions":"Take before bed","times":["22:00"],"remainingDoses":12,"refillThresholdDays":5,"critical":false,"idempotencyKey":"care-demo:magnesium"}'
```

Example reminder drain:

```bash
curl -X POST http://127.0.0.1:4380/api/reminders/drain \
  -H "Content-Type: application/json" \
  -d '{"now":"2026-08-12T00:00:00.000Z","limit":8,"simulateFailure":true}'
```

## Configuration

- `PORT`: API port. Defaults to `4380`.
- `REDIS_URL`: optional Redis connection string for snapshot caching.

Without Redis, the API uses an in-memory cache:

```bash
REDIS_URL=redis://127.0.0.1:6379 npm run dev:api
```

## Notes And Limitations

- Reminder delivery is simulated; no SMS, push, email, or pharmacy integration is called.
- Timezone support uses local ISO timestamps only and does not model user timezone preferences.
- Caregiver escalation is represented as durable state and audit events, not real messages.
- Recurring medication schedules are generated for the current day only.
- This is not medical advice and should not be used for real care decisions.

## Technologies Used

- React
- TypeScript
- Vite
- Node.js
- Express
- SQLite via `node:sqlite`
- Redis client with memory fallback
