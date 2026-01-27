# Technical README: LeetCode POC

This document explains the LeetCode-style tracker POC, including architecture, file layout, and the logic behind each component.

## Architecture Overview

The app follows the **Model-View-Controller (MVC)** pattern using Spring Boot:

- **Model**: `Problem`, `Attempt`, and enums capture the core domain state.
- **View**: Thymeleaf templates render the board, problem detail, and form pages.
- **Controller**: `LeetCodeController` coordinates HTTP requests and responses.

**Technology Stack**:
- **Spring Boot**: Web framework and embedded server
- **Thymeleaf**: Server-side HTML rendering
- **Jakarta Validation**: Input validation for forms
- **Bootstrap**: UI styling

**Application Flow**:
1. User opens `/` → Controller fetches problems + summary → Renders `home.html`.
2. User clicks a problem → Controller loads problem details → Renders `problem.html`.
3. User adds a problem → Form posts to `/problems` → Service creates in-memory problem → Redirects to detail page.
4. User logs an attempt → Form posts to `/problem/{id}/attempts` → Service adds attempt, updates status → Redirects to detail page.

## File Structure

```
leetcode-poc/
├── pom.xml
├── src/main/resources/
│   ├── application.properties
│   └── templates/
│       ├── home.html
│       ├── problem.html
│       ├── new-problem.html
│       └── new-attempt.html
└── src/main/java/com/randomproject/leetcode/
    ├── LeetCodePocApplication.java
    ├── LeetCodeController.java
    ├── ProblemService.java
    ├── Problem.java
    ├── Attempt.java
    ├── ProblemForm.java
    ├── AttemptForm.java
    ├── ProblemSummary.java
    ├── Difficulty.java
    ├── ProblemStatus.java
    └── AttemptOutcome.java
```

## Detailed File Explanations

### pom.xml

**Purpose**: Defines Spring Boot dependencies (web, Thymeleaf, validation) and build plugin. Uses Java 17.

### src/main/resources/application.properties

**Purpose**: App configuration.

- `server.port=8101` to avoid clashes with other POCs.
- `spring.thymeleaf.cache=false` to refresh templates during development.

### LeetCodePocApplication.java

Bootstraps the Spring Boot application.

### LeetCodeController.java

**Purpose**: Handles routing and view rendering.

Key routes:
- `GET /` — Renders problem board with filters and summary.
- `GET /problem/{id}` — Renders detail page for a problem.
- `GET /new` + `POST /problems` — Creates a new problem.
- `GET /problem/{id}/attempt` + `POST /problem/{id}/attempts` — Logs a new attempt.

### ProblemService.java

**Purpose**: In-memory data layer and domain logic.

- Stores problems in a `LinkedHashMap`.
- Seeds initial problems and attempts.
- Filters by status, difficulty, and tag.
- Updates status to **IN_PROGRESS** or **SOLVED** based on attempt outcome.
- Builds a `ProblemSummary` used on the board.

### Problem.java

Represents a problem and its attempts.

- Holds metadata like title, slug, difficulty, status, tags, and notes.
- Tracks created date, last attempt date, and solved date.
- Adds attempts via `addAttempt`, which also updates `lastAttemptedOn`.

### Attempt.java

Represents a problem attempt.

- Captures date, outcome, runtime, memory, duration, language, and notes.

### ProblemForm.java & AttemptForm.java

Form DTOs with validation rules for creating problems and attempts.

### Difficulty.java, ProblemStatus.java, AttemptOutcome.java

Enums used for consistent labels and UI badges.

### ProblemSummary.java

Aggregated stats for total problems, solved counts, attempts, and average time.

## Design Notes

- All data is in memory. Restarting the app resets problems and attempts.
- Slugs are generated from titles for quick scanning on the board.
- Tag filtering is case-insensitive and uses exact tag matches.

