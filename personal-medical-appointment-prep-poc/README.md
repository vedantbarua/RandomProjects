# Personal Medical Appointment Prep POC

A practical appointment workspace for visit prep, symptom timelines, questions, after-visit instructions, reminder retries, summary exports, and audit history.

## What It Demonstrates

- Appointment intake with idempotency keys
- Prep checklist generation for each visit
- Symptom timeline and question capture
- After-visit instruction tracking
- Shareable visit summary generation with checksums
- Reminder queue with retry simulation
- Redis snapshot cache when `REDIS_URL` is available, with memory fallback
- Audit history for prep, follow-up, exports, and reminder events

## Run Locally

```bash
npm install
npm run dev:api
npm run dev
```

- Frontend: `http://127.0.0.1:5430`
- API: `http://127.0.0.1:4430`

## Demo Flow

1. Open the dashboard and review the upcoming appointment.
2. Add a symptom note to the timeline.
3. Add a question for the clinician.
4. Complete a prep checklist task.
5. Mark an after-visit instruction done.
6. Generate a visit summary and inspect its checksum.
7. Drain reminders normally or simulate retry failure.

## API Surface

- `GET /api/health`
- `GET /api/snapshot/:userId`
- `POST /api/appointments/:userId`
- `POST /api/symptoms/:userId`
- `POST /api/questions/:userId`
- `POST /api/tasks/:userId/:taskId/complete`
- `PATCH /api/instructions/:userId/:instructionId/status`
- `POST /api/summaries/:userId`
- `POST /api/reminders/drain`
- `POST /api/reset/:userId`

## System Design Notes

This POC focuses on the workflow around a medical visit rather than clinical advice. The backend keeps a local durable JSON store for easy local execution while modeling entities that would normally live in transactional storage: appointments, symptoms, questions, prep tasks, after-visit instructions, export summaries, reminders, and audits.
