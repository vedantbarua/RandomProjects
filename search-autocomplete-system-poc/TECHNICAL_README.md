# Technical README: Search Autocomplete System POC

This document explains the architecture, flow, and file-by-file purpose of the search autocomplete proof-of-concept.

## Architecture Overview
- **Framework**: Spring Boot 3.2 with MVC and Thymeleaf for the UI.
- **Indexing**: In-memory prefix index that maps prefixes to ranked term lists.
- **Domain**: `SearchTerm` stores the term, score, and timestamps.
- **Service**: `AutocompleteService` validates input, ranks terms, and rebuilds the prefix index.
- **Controller**: `AutocompleteController` renders the UI and exposes JSON endpoints.
- **Views**: `index.html` provides forms for suggestions, term creation, and selection.

## File Structure
```
search-autocomplete-system-poc/
├── pom.xml                                      # Maven configuration (Spring Boot, Thymeleaf, validation)
├── src/main/java/com/randomproject/searchautocomplete/
│   ├── SearchAutocompleteSystemPocApplication.java  # Boots the Spring application
│   ├── AutocompleteController.java                  # MVC + REST endpoints
│   ├── AutocompleteService.java                     # Indexing + ranking logic
│   ├── SearchTerm.java                              # Domain model for autocomplete terms
│   ├── SearchSuggestion.java                        # Suggestion payload model
│   ├── SearchTermResponse.java                      # API response model
│   ├── TermRequest.java                             # Validation-backed term payload
│   └── SelectRequest.java                           # Validation-backed selection payload
└── src/main/resources/
    ├── application.properties                   # Port + autocomplete defaults
    └── templates/
        └── index.html                            # UI for suggestions and term management
```

## Flow
1. **Home**: GET `/` renders the UI with current terms and defaults.
2. **Suggest (UI)**: POST `/suggest` validates inputs, fetches ranked results, and redirects with flash attributes.
3. **Manage terms (UI)**: POST `/terms` adds or updates a term and rebuilds the prefix index.
4. **Select (UI)**: POST `/select` records a selection and boosts the score.
5. **API**: `/api/suggest`, `/api/terms`, and `/api/select` expose JSON endpoints.

## Notable Implementation Details
- **Ranking**: Suggestions are sorted by score (descending), then last-selected time (most recent first), then alphabetically.
- **Prefix index**: Rebuilt whenever terms or scores change for simplicity.
- **Normalization**: Terms are trimmed, whitespace is collapsed, and matching is case-insensitive.
- **Input rules**: Terms use a conservative ASCII character set to keep URLs and UI clean.

## Configuration
- `server.port=8089` — avoid clashing with other POCs.
- `autocomplete.default-limit=8` — default suggestion count.
- `autocomplete.max-prefix-length=20` — max prefix length stored in the index.
- `autocomplete.max-term-length=80` — input length guard.

## Build/Run
- `mvn org.springframework.boot:spring-boot-maven-plugin:run`
