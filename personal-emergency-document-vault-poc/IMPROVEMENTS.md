# Improvements

- Add authentication with household members, guardians, and trusted contacts.
- Use Postgres for metadata, object storage for encrypted binaries, and KMS for envelope keys.
- Add real document upload, preview, OCR metadata extraction, and virus scanning.
- Support emergency mode with one-click contact notifications.
- Add QR-based offline emergency card generation.
- Add multi-party approval before revealing critical documents.
- Add WebAuthn or step-up verification before creating or using grants.
- Add scheduled workers for reminder dispatch instead of manual drain endpoints.
- Add mobile-friendly offline cache for emergency readiness checklists.
- Add integration tests for grants, expiry transitions, idempotency, and retry behavior.
