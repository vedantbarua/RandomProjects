# Technical README

## Architecture

- React TypeScript dashboard on Vite
- Node and Express API
- Local durable JSON persistence
- Optional Redis snapshot cache through `REDIS_URL`
- Reminder queue modeled as persisted jobs with attempts and retry errors

## Data Model

- `appointments`: clinician, specialty, location, start time, reason, status
- `symptoms`: timeline notes with severity, frequency, start time, and status
- `questions`: visit agenda items with priority and status
- `tasks`: generated prep checklist tasks
- `instructions`: follow-up work after or around a visit
- `summaries`: generated visit summary payloads with checksum
- `medications`: lightweight medication summary for visit context
- `reminderJobs`: queued prep, appointment-day, and follow-up reminders
- `auditEvents`: append-only operational history
- `idempotencyKeys`: duplicate appointment intake protection

## Core Flows

### Appointment Intake

New appointments create checklist tasks and reminder jobs. Idempotency keys prevent duplicate appointments when the same intake request is retried.

### Visit Prep

Symptoms, questions, and prep tasks are collected into a single snapshot. The dashboard highlights unresolved prep work, open questions, and active symptoms.

### Summary Generation

The summary generator packages appointment details, symptom timeline, open questions, prep status, after-visit instructions, and medication context into a checksum-stamped payload.

### Reminder Drain

Reminder jobs are deduped by user, kind, and entity. The drain endpoint can dispatch due reminders or simulate provider timeout retries so the UI can show retry states.

## Production Considerations

- Replace local JSON with Postgres transactions.
- Add authentication, authorization, consent records, and household or caregiver sharing roles.
- Encrypt protected health information at rest and in transit.
- Add timezone-aware appointment and reminder scheduling.
- Add calendar integrations and patient portal import/export.
- Add document upload for lab results and after-visit summaries.
- Add notification provider integrations for SMS, email, and push.
- Add tests for idempotency, reminder retries, summary generation, and status transitions.
