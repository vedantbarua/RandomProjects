# Improvements and Next Steps: Rate Limiter POC

## Core Behavior
- Add token-bucket or sliding-window algorithms for smoother rate control.
- Support per-route or per-method policies instead of a single per-key bucket.
- Attach a TTL and cleanup task for idle buckets.
- Expose configurable burst capacity and refill rates.

## API & UX
- Return standard rate-limit headers (`X-RateLimit-*`, `Retry-After`).
- Allow listing and editing policies through the UI.
- Provide a traffic simulator to fire N requests at a given rate.
- Add CSV export of bucket usage for quick inspection.

## Reliability & Ops
- Persist counters in Redis for multi-instance deployments.
- Add metrics (allowed/blocked counts per key) and health checks.
- Add a Dockerfile and CI workflow.

## Security
- Authenticate API access and restrict who can reset buckets.
- Add key hashing to avoid storing raw identifiers.

## Testing
- Unit tests for window reset logic and policy overrides.
- MVC tests for API 429 responses and validation failures.
