# Improvements and Next Steps: LeetCode POC

## Core Features
- Persist problems and attempts in Postgres or H2 with repositories.
- Add problem lists, playlists, and company-specific sets.
- Support custom checklists for each problem (edge cases, complexity, tests).
- Track multiple languages and accepted solutions per problem.

## UX & Insights
- Add charts for solved streaks, difficulty distribution, and runtime trends.
- Add calendar views and reminders for spaced repetition.
- Add search with fuzzy matching across titles and tags.
- Add inline attempt notes with syntax-highlighted code snippets.

## API & Integrations
- Add REST endpoints for problems and attempts.
- Support import/export with CSV or JSON.
- Add webhook simulations for streak updates or daily goals.

## Reliability & Ops
- Add Dockerfile and CI for tests and builds.
- Add pagination for large problem lists.
- Add caching for frequently viewed problems.

## Security
- Add authentication and user profiles.
- Add private workspaces and sharing.

## Testing
- Unit tests for tag parsing, status updates, and summaries.
- MVC tests for forms and validation flows.
- Contract tests for future API responses.
