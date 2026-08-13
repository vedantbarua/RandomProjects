# Personal Warranty Service Claim Assistant Improvements

## Production Gaps

- Add authentication, household sharing, and per-item access controls.
- Add object storage for receipts, photos, warranty PDFs, and service reports.
- Add OCR and receipt parsing for purchase date, provider, and warranty extraction.
- Add manufacturer-specific claim requirements and support-channel metadata.
- Add email/calendar reminders for warranty expiry and claim follow-ups.

## Reliability Improvements

- Wrap item, claim, document, job, and audit mutations in transactions.
- Move follow-up draining to a dedicated worker with graceful shutdown.
- Add dead-letter status for repeatedly failing provider contact attempts.
- Add reconciliation to recreate missing expiry and claim follow-up jobs.
- Add provider-specific retry policies and backoff.

## Scaling Improvements

- Replace SQLite with Postgres for concurrent writes and row-level locks.
- Use Redis sorted sets or a queue system for due follow-up discovery.
- Partition follow-up jobs by user or due-time bucket.
- Add paginated APIs for items, claims, audits, and contact attempts.
- Materialize warranty-expiry projections for large inventories.

## Security Improvements

- Validate request payloads with schemas.
- Encrypt sensitive proof documents and receipt metadata.
- Redact serial numbers and receipt references from logs.
- Add rate limiting on write and job-drain endpoints.
- Add audit review tooling for shared household access.

## Testing Improvements

- Unit test warranty expiry calculations and checklist rules.
- API test idempotency, claim status transitions, document projection, and job retries.
- Frontend test item creation, claim updates, and missing-document flows.
- Add clock-controlled tests for due follow-up selection.
- Add load tests for job draining and snapshot caching.
