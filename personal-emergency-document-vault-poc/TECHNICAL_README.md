# Technical README

## Architecture

- React TypeScript dashboard on Vite
- Node and Express API
- Local durable JSON store for runnable persistence
- Optional Redis snapshot cache via `REDIS_URL`
- Reminder queue modeled as persisted jobs with dispatch and retry states

## Data Model

- `documents`: document metadata, category, holder, issuer, expiry, sensitivity, storage reference, status
- `contacts`: verified trusted contacts and delivery channels
- `accessGrants`: short-lived scoped grants for trusted contacts
- `exportKits`: generated emergency manifests with checksums
- `reminderJobs`: queued expiry and grant reminders with attempts and errors
- `auditEvents`: append-only activity history
- `idempotencyKeys`: replay protection for document intake

## Important Flows

### Document Intake

The API accepts document metadata with an idempotency key. A matching key returns the existing document instead of creating a duplicate. New documents schedule an expiry reminder and write an audit event.

### Trusted Access

A verified contact receives a grant with a limited scope such as `medical`, `insurance`, or `all`. The grant has a deadline and can be revoked. Expired grants are marked when snapshots are loaded or kits are generated.

### Access Kit Generation

The kit generator filters active documents by grant scope, builds a manifest, and creates a SHA-256 checksum prefix so the UI can show that the generated package is stable and verifiable.

### Reminder Queue

Reminder jobs are persisted with a dedupe key, run time, attempt count, and last error. The drain endpoint can simulate provider failures to exercise retry behavior.

## Production Considerations

- Encrypt document metadata fields that reveal identity, policy numbers, or medical details.
- Store binaries in object storage with envelope encryption and short-lived signed URLs.
- Add row-level access controls and contact identity verification.
- Replace local JSON persistence with Postgres transactions.
- Move reminders to Redis Streams, BullMQ, SQS, or Kafka-backed workflows.
- Add immutable audit storage and tamper-evident log checksums.
- Add rate limits, CSRF protection, authentication, and full authorization policy checks.
