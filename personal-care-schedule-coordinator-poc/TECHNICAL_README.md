# Personal Care Schedule Coordinator Technical README

## Problem Statement

Medication and care reminders are more sensitive than ordinary todo reminders. A useful system needs durable action history, idempotent commands, missed-dose detection, refill forecasting, retryable reminders, and escalation when critical reminders fail.

## Architecture Overview

```text
React dashboard
  -> Express API
    -> SQLite state tables
    -> Redis or memory snapshot cache
    -> Reminder drain endpoint that simulates a worker
```

The API owns all state changes. The UI requests a snapshot, then sends commands for medication creation, care actions, refill updates, schedule rebuilds, and reminder draining.

## Core Data Model

- `medications`: name, dose, instructions, daily times, remaining doses, refill threshold, critical flag, and active state.
- `appointments`: provider visits with start time, location, reminder lead time, and status.
- `care_tasks`: non-medication care tasks such as pharmacy calls or vitals logging.
- `care_actions`: idempotent occurrence-level actions such as taken, skipped, completed, or missed.
- `reminder_jobs`: queued, dispatched, cancelled, locked, retrying, failed-provider, and escalated reminder state.
- `escalation_contacts`: trusted contacts for missed or failed critical reminders.
- `audit_events`: append-only operational history.
- `idempotency_keys`: command dedupe table.

## Request Or Event Flow

1. `GET /api/snapshot/:userId` seeds demo data if needed.
2. The schedule builder expands active medications, appointments, and care tasks into today’s occurrences.
3. Existing care actions are joined by occurrence ID to derive visible status.
4. The API rebuilds missing reminder jobs for pending occurrences.
5. A care action writes or updates the occurrence action and cancels the queued reminder.
6. A taken medication dose decrements remaining inventory.
7. Reminder draining locks due jobs, dispatches them, or schedules retry with an escalation flag for medication failures.
8. Every transition writes an audit event and invalidates the snapshot cache.

## Key Tradeoffs

- SQLite keeps the POC portable while demonstrating durable state and indexes.
- Schedule occurrences are generated from source records instead of stored as rows, which keeps recurring medication schedules simple.
- Reminder jobs are persisted because reminder state must survive cache loss.
- Escalation is represented in state and audit history rather than using an external messaging provider.
- The UI exposes operational state directly so a reviewer can inspect failure and retry paths.

## Failure Handling

- Idempotency keys prevent duplicate medication creation and duplicate dose actions.
- Reminder jobs use `locked_until` so stuck jobs can be retried after the lock expires.
- Simulated provider failure increments attempts, records `last_error`, reschedules due time, and escalates medication reminders.
- Completing or skipping a care occurrence cancels queued reminder jobs.
- Snapshot cache is invalidated after writes and can fall back to memory if Redis is unavailable.

## Scaling Path

- Move reminder draining into a dedicated worker process.
- Use Postgres with row-level locking for concurrent reminder workers.
- Add Redis sorted sets for high-volume due reminder lookup.
- Materialize schedule occurrences for multi-day planning and historical reporting.
- Add pharmacy, calendar, SMS, push, and caregiver messaging integrations.
- Add per-user timezone settings and daylight-saving-safe schedule generation.

## What Is Intentionally Simplified

- No authentication or authorization.
- No real notification provider.
- No clinical validation, prescribing logic, or medical recommendations.
- No pharmacy system integration.
- No multi-day recurring occurrence materialization.
