# Technical README: Rate Limiter POC

This document explains the architecture, flow, and file-by-file purpose of the rate limiter proof-of-concept.

## Architecture Overview
- **Framework**: Spring Boot 3.2 with MVC and Thymeleaf for server-rendered UI.
- **Limiter**: Fixed-window counters per key; buckets track count, window start, and policy (limit/window seconds).
- **Service**: `RateLimiterService` validates keys, applies defaults, and performs the allow/deny decision.
- **Controller**: `RateLimiterController` renders the UI and exposes JSON endpoints with 200/429 responses.
- **Views**: `index.html` provides a form to check a request and a table of active buckets.

## File Structure
```
rate-limiter-poc/
├── pom.xml                                      # Maven configuration (Spring Boot, Thymeleaf, validation)
├── src/main/java/com/randomproject/ratelimiter/
│   ├── RateLimiterPocApplication.java           # Boots the Spring application
│   ├── RateLimiterController.java               # MVC + REST endpoints
│   ├── RateLimiterService.java                  # In-memory buckets + validation + defaults
│   ├── RateLimitBucket.java                     # Mutable bucket state (count/window/policy)
│   ├── RateLimitDecision.java                   # Decision payload for checks
│   ├── RateLimitSnapshot.java                   # Snapshot payload for listing buckets
│   └── RateLimitRequest.java                    # Validation-backed request payload
└── src/main/resources/
    ├── application.properties                   # Port + default policy + Thymeleaf dev config
    └── templates/
        └── index.html                            # UI for checking requests and listing buckets
```

## Flow
1. **Home**: GET `/` renders `index.html` with defaults and current buckets.
2. **Check request (UI)**: POST `/check` validates inputs and calls `RateLimiterService.check`, then redirects with a decision.
3. **Check request (API)**: POST `/api/limits/check` returns 200 for allowed, 429 for limited, and includes the decision payload.
4. **Reset bucket**: POST `/buckets/{key}/reset` or `/api/limits/{key}/reset` deletes a bucket.
5. **List buckets**: GET `/api/limits` returns snapshots for all active keys.

## Notable Implementation Details
- **Policy overrides**: Each request may override the default `limit` or `windowSeconds`; if a policy changes, the bucket resets.
- **Fixed windows**: Buckets reset when `now` passes `windowStart + windowSeconds`.
- **Validation**: Request keys are normalized and validated against a strict pattern.
- **Status codes**: API returns `429 Too Many Requests` when a request is limited.

## Configuration
- `server.port=8085` — avoid clashing with other POCs.
- `rate.default-limit=10` — default requests per window.
- `rate.default-window-seconds=60` — default window length in seconds.
- `spring.thymeleaf.cache=false` — reload templates during development.

## Build/Run
- `mvn org.springframework.boot:spring-boot-maven-plugin:run`
