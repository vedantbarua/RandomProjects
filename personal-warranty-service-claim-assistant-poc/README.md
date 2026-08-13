# Personal Warranty Service Claim Assistant POC

React, Node, Express, SQLite, and optional Redis proof-of-concept for tracking owned items, detecting warranty expiry, starting service claims, managing document checklists, and running retryable provider follow-ups.

## Goal

Turn receipts and warranty records into actionable service-claim workflows with durable state, reminders, retries, and audit visibility.

## What It Covers

- Owned item records with purchase date, warranty period, serial number, provider, and receipt reference
- Warranty expiry detection for items inside a 45-day window
- Claim workflow statuses: draft, submitted, waiting, approved, denied, completed, and withdrawn
- Category-specific required document checklists
- Missing-document detection per open claim
- Follow-up jobs for warranty expiry and provider claim follow-ups
- Retryable provider contact simulation with job locks and attempts
- Contact attempt history and audit trail
- Optional Redis snapshot cache with in-memory fallback

## Quick Start

```bash
cd personal-warranty-service-claim-assistant-poc
npm install
npm run dev:api
```

In another terminal:

```bash
cd personal-warranty-service-claim-assistant-poc
npm run dev
```

Open:

```text
http://127.0.0.1:5390
```

API:

```text
http://127.0.0.1:4390/api/health
```

## UI Flows

- Add an owned item with warranty and receipt metadata.
- Start a service claim for an item.
- Move claims through draft, submitted, waiting, approved, denied, completed, or withdrawn.
- Add missing documents from the claim checklist.
- Review expiring warranties and open claims.
- Drain follow-up jobs to simulate provider contact.
- Simulate provider failure to see retry scheduling.
- Reset the demo data.

## API Endpoints

- `GET /api/health`
- `GET /api/snapshot/:userId`
- `POST /api/items/:userId`
- `POST /api/claims/:userId`
- `PATCH /api/claims/:userId/:claimId/status`
- `POST /api/documents/:userId`
- `POST /api/jobs/drain`
- `POST /api/reset/:userId`

Example item:

```bash
curl -X POST http://127.0.0.1:4390/api/items/warranty-demo \
  -H "Content-Type: application/json" \
  -d '{"name":"Noise cancelling headphones","category":"electronics","brand":"SoundLab","model":"Quiet 2","serialNumber":"SL-Q2-449","purchaseDate":"2026-08-13","warrantyMonths":12,"provider":"SoundLab Support","receiptRef":"receipt://soundlab-headphones","idempotencyKey":"warranty-demo:item:SL-Q2-449"}'
```

## Configuration

- `PORT`: API port. Defaults to `4390`.
- `REDIS_URL`: optional Redis connection string for snapshot caching.

Without Redis, the API uses an in-memory cache:

```bash
REDIS_URL=redis://127.0.0.1:6379 npm run dev:api
```

## Notes And Limitations

- Document storage is metadata-only; no binary file upload is implemented.
- Provider contact is simulated by a follow-up drain endpoint.
- Warranty rules are deterministic and category-based.
- Authentication and multi-user authorization are intentionally simplified to URL-level `userId`.

## Technologies Used

- React
- TypeScript
- Vite
- Node.js
- Express
- SQLite via `node:sqlite`
- Redis client with memory fallback
