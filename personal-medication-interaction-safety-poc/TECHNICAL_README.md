# Technical README

## Architecture

- React TypeScript dashboard on Vite
- Node and Express API
- Local durable JSON store for runnable persistence
- Optional Redis snapshot cache through `REDIS_URL`
- Rule engine for interaction, duplicate ingredient, refill, and missed-dose checks
- Reminder queue modeled as persisted jobs with attempts and retry errors

## Data Model

- `medications`: active medication profile, ingredient, strength, schedule, pharmacy, prescriber, supply days, threshold, status
- `doseLogs`: taken, skipped, and snoozed dose events
- `caregivers`: trusted escalation contacts
- `reminderJobs`: queued dose and refill checks
- `warningResolutions`: user-reviewed warning records
- `auditEvents`: append-only operational history
- `idempotencyKeys`: duplicate intake protection

## Core Flows

### Safety Evaluation

The API evaluates active medications on each snapshot. It returns unresolved warnings ordered by severity. Rule categories include known ingredient interactions, duplicate ingredients, low supply, and missing daily dose logs.

### Refill Risk

Each medication has `supplyDaysRemaining` and `refillThresholdDays`. The rule engine creates refill warnings when supply is at or below threshold. Refill updates reset the supply count and write audit history.

### Reminder Drain

Reminder jobs are deduped by user, medication, and reminder kind. The drain endpoint dispatches due work and can simulate provider timeout retries so the UI can show retry state transitions.

### Caregiver Escalation

The caregiver toggle models a common safety feature: missed critical doses can escalate to a trusted contact. In this POC, the toggle is persisted and audited.

## Production Considerations

- Replace local rules with a licensed drug interaction database.
- Add clinician or pharmacist review workflow before suppressing serious warnings.
- Store protected health data in encrypted databases with strict access controls.
- Add authentication, authorization, consent records, and audit retention policies.
- Move reminders to Redis Streams, BullMQ, SQS, or Kafka.
- Add timezone-aware medication schedules and daylight-saving handling.
- Add notification provider integrations for SMS, email, and push.
- Add tests for interaction rules, idempotency, reminder retries, and warning resolution.
