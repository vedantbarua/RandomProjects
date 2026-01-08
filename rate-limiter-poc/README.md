# Rate Limiter POC

Spring Boot proof-of-concept for a fixed-window rate limiter with per-key buckets, a small UI, and JSON endpoints for automation.

## Features
- Fixed-window counters for each key with default policy overrides
- UI to simulate requests and reset buckets
- JSON API that returns 200/429 with limiter details
- In-memory buckets reset on restart

## Quick Start
1. Ensure Java 17+ and Maven are installed.
2. Run the app:
   ```bash
   cd rate-limiter-poc
   mvn org.springframework.boot:spring-boot-maven-plugin:run
   ```
3. Open `http://localhost:8085` for the UI.

## Endpoints
- `/` — UI to check requests and view buckets
- `/check` `POST` — Check a request (`key`, optional `limit`, `windowSeconds`, `cost`)
- `/buckets/{key}/reset` `POST` — Reset a bucket
- `/api/limits/check` `POST` — JSON check (`key`, optional `limit`, `windowSeconds`, `cost`)
- `/api/limits` `GET` — List active buckets
- `/api/limits/{key}/reset` `POST` — Reset a bucket
- `/api/limits/{key}` `DELETE` — Reset a bucket

## Notes
- Keys must use letters, numbers, `.`, `_`, `-`, or `:`.
- Cost defaults to 1 when omitted.
- Limit/window defaults come from `application.properties`.

## Technologies
- Spring Boot 3.2 (web + Thymeleaf + validation)
- Java 17
- In-memory map (ConcurrentHashMap)
