# Technical README: Yelp POC

This document explains the architecture, flow, and file-by-file purpose of the Yelp local discovery proof-of-concept.

## Architecture Overview
- **Framework**: Spring Boot 3.2 with MVC and Thymeleaf for server-rendered UI.
- **Service**: `BusinessService` stores businesses in memory, seeds sample data, and computes summary stats.
- **Controller**: `YelpController` handles list, detail, and create-review flows.
- **Views**: Thymeleaf templates render the list, detail, and form pages.

## File Structure
```
yelp-poc/
├── pom.xml                                      # Maven configuration (Spring Boot, Thymeleaf, validation)
├── src/main/java/com/randomproject/yelp/
│   ├── YelpPocApplication.java                  # Boots the Spring application
│   ├── YelpController.java                      # MVC endpoints for list, detail, and forms
│   ├── BusinessService.java                     # In-memory store + seed data + summary stats
│   ├── Business.java                            # Business domain model
│   ├── Review.java                              # Review domain model
│   ├── BusinessForm.java                        # Validation-backed business form payload
│   ├── ReviewForm.java                          # Validation-backed review form payload
│   ├── BusinessSummary.java                     # Aggregate summary DTO
│   ├── BusinessCategory.java                    # Enum of business categories
│   └── PriceTier.java                           # Enum of price tiers
└── src/main/resources/
    ├── application.properties                   # Port + Thymeleaf dev config
    └── templates/
        ├── home.html                            # Business list UI
        ├── business.html                        # Business detail + reviews
        ├── new-business.html                    # New business form
        └── new-review.html                      # Review form
```

## Flow
1. **List**: GET `/` renders `home.html` with businesses and summary stats.
2. **Detail**: GET `/business/{id}` renders `business.html` with reviews.
3. **Create business**: GET `/new` shows the form; POST `/businesses` validates and stores a new business.
4. **Create review**: GET `/business/{id}/review` shows the form; POST `/business/{id}/reviews` validates and stores a review.

## Notable Implementation Details
- **Ordering**: Businesses are sorted by average rating, then review count, then name.
- **Summary**: Overall average rating is computed across all reviews in the store.
- **Validation**: Forms enforce required fields, rating bounds, and text limits.

## Configuration
- `server.port=8095` — avoid clashing with other POCs.
- `spring.thymeleaf.cache=false` — reload templates during development.

## Build/Run
- `mvn org.springframework.boot:spring-boot-maven-plugin:run`
