# Yelp POC

A simple proof of concept for a Yelp-like local discovery app built with Spring Boot and Thymeleaf.

## Features

- Browse curated businesses with ratings and review counts
- View business details and review highlights
- Add new businesses
- Leave reviews with ratings and visit dates
- In-memory storage with seed data

## Quick Start

1. Ensure you have Java 17+ and Maven installed.
2. Navigate to the project directory: `cd yelp-poc`
3. Run: `mvn org.springframework.boot:spring-boot-maven-plugin:run`
4. Open `http://localhost:8095` in your browser

## Endpoints

- `/` - Business list
- `/business/{id}` - Business details
- `/new` - New business form
- `/businesses` `POST` - Create business
- `/business/{id}/review` - New review form
- `/business/{id}/reviews` `POST` - Submit review

## Technologies

- Spring Boot 3.2.0
- Java 17
- Thymeleaf
- Bootstrap

## Hosting

Local: Run as above. For cloud: Build JAR with `mvn clean package`, deploy to Railway/Render/Fly.io.

See TECHNICAL_README.md for detailed explanations.
