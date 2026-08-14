# Personal Home Inventory Recall Alert POC

React, Node, Express, SQLite, and optional Redis proof-of-concept for matching household inventory against simulated recall feeds, generating deduped alerts, retrying notifications, and tracking audit history.

## Goal

Help a household know when owned appliances, electronics, tools, furniture, or home products are affected by product recalls.

## What It Covers

- Household inventory records with brand, model, serial number, category, purchase date, location, and notes
- Simulated recall feed ingestion with source-event dedupe
- Recall matching by category, brand, model pattern, and serial pattern
- Deduped recall alert generation per user, item, and recall
- Alert lifecycle: open, acknowledged, resolved, dismissed
- Notification jobs with due scans, locks, retries, and failure simulation
- Optional Redis snapshot cache with in-memory fallback
- Operational dashboard for affected items, recent recalls, notification queue, and audits

## Quick Start

```bash
cd personal-home-inventory-recall-alert-poc
npm install
npm run dev:api
```

In another terminal:

```bash
cd personal-home-inventory-recall-alert-poc
npm run dev
```

Open:

```text
http://127.0.0.1:5400
```

API:

```text
http://127.0.0.1:4400/api/health
```

## UI Flows

- Add a household item with product identity and location.
- Ingest a simulated recall event.
- Match recall feed entries against owned inventory.
- Acknowledge, resolve, or dismiss recall alerts.
- Drain queued notification jobs.
- Simulate notification provider failure and retry scheduling.
- Reset demo state.

## API Endpoints

- `GET /api/health`
- `GET /api/snapshot/:userId`
- `POST /api/items/:userId`
- `POST /api/recalls/:userId/ingest`
- `POST /api/recalls/:userId/match`
- `PATCH /api/alerts/:userId/:alertId/status`
- `POST /api/notifications/drain`
- `POST /api/reset/:userId`

Example recall ingestion:

```bash
curl -X POST http://127.0.0.1:4400/api/recalls/recall-demo/ingest \
  -H "Content-Type: application/json" \
  -d '{"recalls":[{"sourceEventId":"recall-dryhome-dh70","category":"appliance","brand":"DryHome","modelPattern":"DH-70","serialPattern":"DH70-*","severity":"high","title":"DryHome DH-70 compressor recall","hazard":"Compressor relay may overheat.","remedy":"Unplug unit and request free relay replacement.","publishedAt":"2026-08-14T12:00:00.000Z"}]}'
```

## Configuration

- `PORT`: API port. Defaults to `4400`.
- `REDIS_URL`: optional Redis connection string for snapshot caching.

Without Redis, the API uses an in-memory cache:

```bash
REDIS_URL=redis://127.0.0.1:6379 npm run dev:api
```

## Notes And Limitations

- Recall data is simulated and not pulled from government or manufacturer feeds.
- Matching is deterministic and intentionally transparent for the POC.
- Notifications are simulated through an API drain endpoint.
- Authentication and authorization are simplified to URL-level `userId`.

## Technologies Used

- React
- TypeScript
- Vite
- Node.js
- Express
- SQLite via `node:sqlite`
- Redis client with memory fallback
