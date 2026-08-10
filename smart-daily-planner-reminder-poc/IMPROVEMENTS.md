# Smart Daily Planner Reminder Improvements

## Production Gaps

- Add authentication, user settings, and timezone-aware scheduling.
- Add real notification providers for email, SMS, push, and calendar reminders.
- Add recurring task expansion with skip, snooze, and exception handling.
- Add calendar import/export using `.ics` and external calendar APIs.

## Reliability Improvements

- Move reminder draining to a dedicated worker with graceful shutdown.
- Use database transactions around task creation, reminder creation, idempotency writes, and audit events.
- Add dead-letter status for reminders that exceed retry limits.
- Add provider-specific retry policies and exponential backoff.
- Add reconciliation that recreates missing reminder jobs for open tasks.

## Scaling Improvements

- Replace SQLite with Postgres for concurrent writes and row-level locking.
- Use Redis sorted sets for due reminder scans.
- Partition reminders by user or due-date bucket.
- Add materialized views for dashboard metrics.
- Add paginated audit and task endpoints.

## Security Improvements

- Validate all request payloads with a schema library.
- Add per-user authorization checks.
- Add rate limiting for task creation and reminder drains.
- Redact sensitive task details from logs.
- Encrypt private task notes at rest.

## Testing Improvements

- Add unit tests for planner scoring and overload behavior.
- Add API tests for idempotency, reminder retries, and status transitions.
- Add frontend tests for task creation and queue drain flows.
- Add clock-controlled tests for due reminder selection.
- Add load tests for reminder scanning and snapshot caching.
