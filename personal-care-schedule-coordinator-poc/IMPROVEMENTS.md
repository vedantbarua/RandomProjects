# Personal Care Schedule Coordinator Improvements

## Production Gaps

- Add authentication, caregiver roles, and consent controls.
- Add per-user timezone settings and daylight-saving-safe schedule generation.
- Integrate SMS, push, email, pharmacy, and calendar providers.
- Add care-team notes, attachments, and appointment preparation checklists.
- Add recurring appointment and task rules.

## Reliability Improvements

- Move reminder draining to a dedicated background worker.
- Wrap medication creation, reminder creation, idempotency writes, and audits in transactions.
- Add dead-letter status for repeatedly failing reminders.
- Add reconciliation to recreate missing reminder jobs for pending care occurrences.
- Add provider-specific retry policies and delivery receipts.

## Scaling Improvements

- Replace SQLite with Postgres for concurrent writes and row-level locks.
- Use Redis sorted sets or a queue system for due reminder discovery.
- Partition reminder jobs by user hash or due-time bucket.
- Add paginated APIs for audit events and historical actions.
- Materialize daily schedules asynchronously for users with many care records.

## Security Improvements

- Validate request payloads with schemas.
- Encrypt sensitive care data at rest.
- Redact care details from logs.
- Add scoped caregiver access grants and audit review.
- Add rate limiting and abuse protection on reminder-triggering endpoints.

## Testing Improvements

- Unit test schedule status transitions with controlled clocks.
- Unit test refill-risk calculations for multi-dose medications.
- API test idempotency, reminder retries, and escalation behavior.
- Frontend test dose action and refill flows.
- Add load tests for reminder drain throughput.
