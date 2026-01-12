# Search Autocomplete System POC

Spring Boot proof-of-concept for a prefix-based autocomplete service with ranking by popularity and recency. Includes a lightweight UI and JSON endpoints.

## Features
- Prefix suggestions with default limits and ranking
- Add or update terms with scores
- Record selections to boost popularity
- In-memory prefix index resets on restart

## Quick Start
1. Ensure Java 17+ and Maven are installed.
2. Run the app:
   ```bash
   cd search-autocomplete-system-poc
   mvn org.springframework.boot:spring-boot-maven-plugin:run
   ```
3. Open `http://localhost:8089` for the UI.

## Endpoints
- `/` — UI for suggestions and term management
- `/suggest` `POST` — Fetch suggestions (`prefix`, optional `limit`)
- `/terms` `POST` — Add or update term (`term`, optional `score`)
- `/select` `POST` — Record a selection (`term`)
- `/api/suggest` `GET` — JSON suggestions (`prefix`, optional `limit`)
- `/api/terms` `GET` — JSON list of terms
- `/api/terms` `POST` — JSON add/update (`term`, optional `score`)
- `/api/select` `POST` — JSON selection (`term`)

## Notes
- Empty prefixes return top-ranked terms.
- Terms may use letters, numbers, spaces, and `. _ : / & ' -` characters.

## Technologies
- Spring Boot 3.2 (web + Thymeleaf + validation)
- Java 17
- In-memory prefix index
