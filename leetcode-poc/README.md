# LeetCode POC

A lightweight LeetCode-style tracker for problems, attempts, and progress built with Spring Boot and Thymeleaf.

## Features
- Track problems with difficulty, status, tags, and notes
- Log attempts with outcomes, runtime, memory, and time spent
- Filter the board by status, difficulty, or tag
- In-memory storage with seed data

## Quick Start
1. Ensure you have Java 17+ and Maven installed.
2. Navigate to the project directory: `cd leetcode-poc`
3. Run: `mvn org.springframework.boot:spring-boot-maven-plugin:run`
4. Open `http://localhost:8101` in your browser

## Endpoints
- `/` — Problem board and filters
- `/new` — New problem form
- `/problems` `POST` — Create problem
- `/problem/{id}` — Problem details
- `/problem/{id}/attempt` — New attempt form
- `/problem/{id}/attempts` `POST` — Save attempt

## Technologies
- Spring Boot 3.2.0
- Java 17
- Thymeleaf
- Bootstrap

## Hosting
Local: Run as above. For cloud: Build JAR with `mvn clean package`, deploy to Railway/Render/Fly.io.

See TECHNICAL_README.md for detailed explanations.
