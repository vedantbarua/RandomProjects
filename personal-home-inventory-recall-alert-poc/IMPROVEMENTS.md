# Personal Home Inventory Recall Alert Improvements

## Production Gaps

- Integrate real recall feeds from public agencies and manufacturers.
- Add receipt, barcode, QR, and product registration imports.
- Add household sharing, roles, and alert delegation.
- Add notification providers for email, SMS, push, and calendar reminders.
- Add product photo and manual matching review.

## Reliability Improvements

- Wrap item creation, alert creation, notification scheduling, and audits in transactions.
- Move notification draining to a dedicated worker with graceful shutdown.
- Add dead-letter status for repeated notification failures.
- Add reconciliation to recreate missing notification jobs for open urgent alerts.
- Add feed offset tracking and replay support.

## Scaling Improvements

- Replace SQLite with Postgres for concurrent writes and row-level locking.
- Use Redis sorted sets or a queue system for due notification discovery.
- Partition matching jobs by recall event or user hash.
- Add materialized projections for affected household dashboards.
- Add batch recall matching for large inventory sets.

## Security Improvements

- Validate request payloads with schemas.
- Add user authentication and household-level authorization.
- Redact serial numbers and locations from logs.
- Rate limit feed ingestion and alert status updates.
- Encrypt sensitive inventory metadata at rest.

## Testing Improvements

- Unit test matching scores and wildcard behavior.
- API test recall ingestion dedupe, alert dedupe, status transitions, and notification retries.
- Frontend test item creation, recall ingestion, and alert acknowledgement flows.
- Add clock-controlled tests for notification due scans.
- Add load tests for matching large recall batches.
