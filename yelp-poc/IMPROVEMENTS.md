# Improvements and Next Steps: Yelp POC

## Core Features
- Persist businesses and reviews in Postgres or H2 with repositories.
- Add photo uploads, menus, and opening hours.
- Support search, category filters, and location-based sorting.
- Add owner responses and review helpful votes.

## UX & Insights
- Add map view with pins and distance estimates.
- Add rating breakdowns and review highlights.
- Provide business claim flow with verification.
- Add richer form validation hints and autocomplete for addresses.

## API & Integrations
- Add REST endpoints for businesses, reviews, and search.
- Add webhook simulation for new reviews or status changes.
- Integrate with geocoding and place details APIs.

## Reliability & Ops
- Add Dockerfile and CI for tests.
- Add health checks and metrics for review submissions.
- Add caching for popular business pages.

## Security
- Add authentication with user profiles.
- Add moderation tools and abuse reporting.

## Testing
- Unit tests for rating aggregation and ordering.
- MVC tests for create flows and validation errors.
- Contract tests for future API responses.
