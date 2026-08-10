# Smart Daily Planner Reminder Technical README

## Problem Statement

Everyday planners need more than task CRUD. A useful system must order work by urgency, detect overloaded days, prevent duplicate task submissions, and deliver reminders reliably even when a provider fails.

## Architecture Overview

The POC has a React dashboard, an Express API, SQLite persistence, and an optional Redis cache.

```text
React UI
  -> Express API
    -> SQLite tables for tasks, plans, reminders, audits, idempotency
    -> Redis or memory cache for short-lived snapshots
```

The API owns all state transitions. The UI asks for a snapshot and sends commands such as create task, update status, generate plan, and drain reminders.

## Core Data Model

- `tasks`: source-of-truth task records with due time, estimate, reminder lead time, priority, category, recurrence, and status.
- `day_plans`: generated daily plan JSON keyed by user and date.
- `reminder_jobs`: queued, dispatched, cancelled, locked, and retrying reminder jobs.
- `audit_events`: append-only operational history.
- `idempotency_keys`: dedupe table for repeated task creation requests.

## Request And Event Flow

1. Task creation validates and normalizes client input.
2. The API writes the task and reminder job in SQLite.
3. The idempotency response is stored when the client supplies a key.
4. The snapshot cache is invalidated.
5. Plan generation loads open tasks and scores them by priority, due pressure, and category.
6. Reminder draining selects due queued jobs, locks each one, then dispatches or schedules a retry.
7. Every meaningful transition writes an audit event.

## Key Tradeoffs

- SQLite keeps the POC easy to run while still showing persistent state and indexes.
- Generated plans are stored as JSON snapshots so the UI can show exactly what was planned at a point in time.
- Reminder draining is command-driven instead of a daemon so reviewers can trigger success and failure paths from the UI.
- Redis is optional because the reliability behavior is in SQLite, not cache-only state.

## Failure Handling

- Idempotency keys prevent duplicate task creation during retries.
- Reminder jobs use `locked_until` so another worker can reclaim stuck jobs after a timeout.
- Simulated provider failure increments attempts, clears the lock, records the error, and moves the job due time forward.
- Status changes cancel queued reminders for completed or cancelled tasks.
- Snapshot cache invalidation happens after writes.

## Scaling Path

- Move reminder draining to a real background worker.
- Partition reminder jobs by due date or user hash.
- Replace SQLite with Postgres and use transactional row locking.
- Add Redis sorted sets for high-volume due reminder discovery.
- Introduce calendar availability and optimization constraints.
- Emit reminder and task events to Kafka for downstream notifications and analytics.

## What Is Intentionally Simplified

- No authentication or authorization layer.
- No external notification provider.
- No recurring task materialization beyond storing recurrence metadata.
- No timezone preference model.
- No calendar conflict integration.
