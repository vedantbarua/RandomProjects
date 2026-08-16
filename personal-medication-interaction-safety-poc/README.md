# Personal Medication Interaction Safety POC

A practical medication safety dashboard for interaction warnings, duplicate active ingredients, refill risk, missed-dose reminders, caregiver escalation, and audit history.

## What It Demonstrates

- Medication intake with idempotency keys
- Local safety rule evaluation for interactions and duplicate ingredients
- Refill risk detection based on supply days and thresholds
- Missed-dose warnings from dose logs
- Reminder queue with retry simulation
- Caregiver escalation toggle and audit trail
- Redis snapshot cache when `REDIS_URL` is available, with memory fallback

## Run Locally

```bash
npm install
npm run dev:api
npm run dev
```

- Frontend: `http://127.0.0.1:5420`
- API: `http://127.0.0.1:4420`

## Demo Flow

1. Open the dashboard and review seeded medication warnings.
2. Add a medication such as `Simvastatin`.
3. Resolve a warning after review.
4. Log a dose for an active medication.
5. Refill a medication to clear refill pressure.
6. Drain reminders normally or simulate notification retry failure.
7. Toggle caregiver escalation and inspect the audit trail.

## API Surface

- `GET /api/health`
- `GET /api/snapshot/:userId`
- `POST /api/medications/:userId`
- `POST /api/doses/:userId/:medicationId`
- `POST /api/refills/:userId/:medicationId`
- `POST /api/warnings/:userId/:warningId/resolve`
- `POST /api/caregivers/:userId/escalation`
- `POST /api/reminders/drain`
- `POST /api/reset/:userId`

## Safety Note

This is a system design POC, not medical advice. The rules are intentionally small and local so the architecture is visible. A production system would require licensed clinical drug databases, pharmacist review workflows, and strict medical privacy controls.
