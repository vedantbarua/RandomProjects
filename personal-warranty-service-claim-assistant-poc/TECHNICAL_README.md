# Personal Warranty Service Claim Assistant Technical README

## Problem Statement

Household warranty records often become useful only when something breaks. A good service-claim system needs to connect owned items, proof documents, warranty deadlines, claim state, provider follow-ups, retries, and audit history.

## Architecture Overview

```text
React dashboard
  -> Express API
    -> SQLite source-of-truth tables
    -> Redis or memory snapshot cache
    -> Follow-up drain endpoint simulating a worker
```

The API owns state transitions. The UI loads one snapshot and sends commands to add items, start claims, update claim status, add documents, and drain follow-up jobs.

## Core Data Model

- `owned_items`: product identity, serial number, purchase date, warranty length, calculated warranty end, provider, and receipt reference.
- `claim_cases`: issue text, claim status, required documents, submit time, and update time.
- `claim_documents`: document metadata linked to claims.
- `follow_up_jobs`: queued, dispatched, cancelled, locked, failed, and retrying workflow jobs.
- `contact_attempts`: provider contact history produced by dispatched follow-up jobs.
- `audit_events`: append-only workflow trail.
- `idempotency_keys`: duplicate command protection for item and claim creation.

## Request Or Event Flow

1. Snapshot requests seed demo data if needed.
2. Item creation calculates `warrantyEndsAt` from purchase date and warranty months.
3. The API schedules a warranty-expiry reminder job 30 days before expiry.
4. Starting a claim derives a category-specific document checklist.
5. Claim status updates replace the claim follow-up job or cancel it for terminal states.
6. Adding documents reduces the missing-document projection.
7. Job draining locks due jobs, dispatches provider contact attempts, or reschedules failed attempts.
8. Every workflow transition writes an audit event and invalidates the snapshot cache.

## Key Tradeoffs

- SQLite keeps the POC easy to run while still showing durable workflow state and indexes.
- Follow-up workers are simulated through an endpoint so reviewers can trigger success and retry flows.
- Document handling stores metadata only to keep the POC focused on workflow and state transitions.
- Warranty and checklist rules are deterministic for clarity.
- Snapshot caching is optional because source-of-truth state remains in SQLite.

## Failure Handling

- Idempotency keys prevent duplicate item and claim creation during client retries.
- Follow-up jobs use `locked_until` so stuck jobs can be reclaimed.
- Simulated provider failure increments attempts, stores the error, and reschedules the job.
- Terminal claim statuses cancel queued claim follow-ups.
- Cache invalidation happens after write commands.

## Scaling Path

- Replace SQLite with Postgres and transactional row locking.
- Move follow-up draining into a worker process.
- Use Redis sorted sets or a queue for high-volume due job discovery.
- Add real object storage for receipt and photo uploads.
- Add provider integrations for email, portals, manufacturer APIs, and SMS.
- Add OCR/classification for receipt ingestion and warranty extraction.

## What Is Intentionally Simplified

- No authentication or authorization.
- No binary file upload.
- No real provider integration.
- No OCR or purchase-email ingestion.
- No manufacturer-specific claim rules.
