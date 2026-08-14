# Personal Home Inventory Recall Alert Technical README

## Problem Statement

Households often own products for years and may miss recalls after purchase. A recall alert system needs durable inventory records, feed ingestion, matching, deduped alerts, notification retries, alert acknowledgement, and audit history.

## Architecture Overview

```text
React dashboard
  -> Express API
    -> SQLite source-of-truth tables
    -> Redis or memory snapshot cache
    -> Notification drain endpoint simulating a worker
```

The API owns all state transitions. The UI loads a snapshot and sends commands to add items, ingest recalls, match recalls, update alert status, and drain notification jobs.

## Core Data Model

- `inventory_items`: household-owned products with category, brand, model, serial number, location, and purchase date.
- `recall_feed`: ingested recall events with source-event dedupe, matching patterns, hazard, remedy, severity, and publication time.
- `recall_alerts`: deduped matches between users, items, and recalls.
- `notification_jobs`: queued, dispatched, cancelled, retrying, and locked notification work.
- `audit_events`: append-only operational trail.
- `idempotency_keys`: duplicate command protection for item creation.

## Request Or Event Flow

1. Snapshot requests seed demo inventory and recall feed if needed.
2. Item creation writes inventory state, then reruns matching against existing recalls.
3. Recall ingestion dedupes by `source_event_id`.
4. The matcher scores owned items by category, brand, model pattern, and serial pattern.
5. New matches create one alert per user, item, and recall.
6. New alerts schedule notification jobs, with critical alerts due immediately.
7. Alert status updates can cancel queued notifications when resolved or dismissed.
8. Notification draining locks due jobs, dispatches them, or reschedules failed attempts.
9. Every meaningful transition writes an audit event and invalidates the snapshot cache.

## Key Tradeoffs

- SQLite makes the POC easy to run while still demonstrating durable workflow state and indexes.
- Matching is deterministic so reviewers can understand why alerts were created.
- Notifications are simulated through an endpoint so retry and failure paths are easy to trigger.
- Snapshot caching is optional and never the source of truth.
- Recall feed ingestion is local simulation rather than an external dependency.

## Failure Handling

- Source event IDs dedupe repeated recall feed ingestion.
- Unique alert constraints prevent duplicate user-item-recall alerts.
- Notification jobs use `locked_until` so stuck jobs can be retried.
- Simulated provider failure increments attempts, records the error, and reschedules the job.
- Resolved and dismissed alerts cancel queued notification jobs.

## Scaling Path

- Replace SQLite with Postgres for concurrent writes and row-level locks.
- Move notification draining into a dedicated worker.
- Use Redis sorted sets or a queue for due notification discovery.
- Add Kafka-style recall feed ingestion with offsets and replay.
- Add fuzzy matching for model and serial ranges.
- Integrate real recall feeds and provider notification channels.

## What Is Intentionally Simplified

- No real recall feed integration.
- No authentication or authorization.
- No email, SMS, or push provider.
- No fuzzy product identity resolution.
- No household sharing or delegated access.
