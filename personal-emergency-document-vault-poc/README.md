# Personal Emergency Document Vault POC

A practical household vault for emergency document metadata, expiry reminders, trusted-contact access, export kits, and audit history.

## What It Demonstrates

- Critical document intake with idempotency keys
- Expiry-aware reminder queue with retry simulation
- Trusted-contact grants with explicit scopes and revocation
- Emergency access kit generation with manifest checksums
- Snapshot caching with Redis when `REDIS_URL` is available and an in-memory fallback otherwise
- Audit trail for document, grant, kit, expiry, and reminder events

## Run Locally

```bash
npm install
npm run dev:api
npm run dev
```

- Frontend: `http://127.0.0.1:5410`
- API: `http://127.0.0.1:4410`

## Demo Flow

1. Open the dashboard and review expiring documents, queued reminders, trusted contacts, and audit history.
2. Add a new document with an expiry date and storage reference.
3. Grant 72-hour trusted access to the first verified contact.
4. Generate an access kit and inspect the document count and checksum.
5. Revoke the grant and confirm the audit trail captures the action.
6. Drain reminders normally or simulate provider retry behavior.

## API Surface

- `GET /api/health`
- `GET /api/snapshot/:userId`
- `POST /api/documents/:userId`
- `PATCH /api/documents/:userId/:documentId/status`
- `POST /api/grants/:userId`
- `POST /api/grants/:userId/:grantId/revoke`
- `POST /api/kits/:userId/:grantId`
- `POST /api/reminders/drain`
- `POST /api/reset/:userId`

## System Design Notes

This POC models a sensitive consumer workflow without storing real document binaries. The backend persists document metadata, contact grants, generated kit manifests, reminder jobs, and audit events in a local JSON data file. Redis is optional and used for short-lived snapshot caching when available.

In production, the metadata store would move to Postgres, binaries would live in encrypted object storage, and grants would be enforced by signed short-lived URLs or envelope-encrypted access packages.
