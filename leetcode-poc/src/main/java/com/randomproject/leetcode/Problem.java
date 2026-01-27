package com.randomproject.leetcode;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

public class Problem {
    private final long id;
    private final String title;
    private final String slug;
    private final Difficulty difficulty;
    private final String url;
    private final String notes;
    private final LocalDate createdOn;
    private final List<String> tags;
    private final List<Attempt> attempts;
    private ProblemStatus status;
    private LocalDate lastAttemptedOn;
    private LocalDate solvedOn;

    public Problem(long id,
                   String title,
                   String slug,
                   Difficulty difficulty,
                   ProblemStatus status,
                   String url,
                   String notes,
                   LocalDate createdOn,
                   List<String> tags) {
        this.id = id;
        this.title = title;
        this.slug = slug;
        this.difficulty = difficulty;
        this.status = status;
        this.url = url;
        this.notes = notes;
        this.createdOn = createdOn;
        this.tags = new ArrayList<>(tags);
        this.attempts = new ArrayList<>();
    }

    public long getId() {
        return id;
    }

    public String getTitle() {
        return title;
    }

    public String getSlug() {
        return slug;
    }

    public Difficulty getDifficulty() {
        return difficulty;
    }

    public ProblemStatus getStatus() {
        return status;
    }

    public String getUrl() {
        return url;
    }

    public String getNotes() {
        return notes;
    }

    public LocalDate getCreatedOn() {
        return createdOn;
    }

    public LocalDate getLastAttemptedOn() {
        return lastAttemptedOn;
    }

    public LocalDate getSolvedOn() {
        return solvedOn;
    }

    public List<String> getTags() {
        return Collections.unmodifiableList(tags);
    }

    public List<Attempt> getAttempts() {
        return Collections.unmodifiableList(attempts);
    }

    public int getAttemptCount() {
        return attempts.size();
    }

    public int getAcceptedCount() {
        return (int) attempts.stream().filter(attempt -> attempt.getOutcome() == AttemptOutcome.ACCEPTED).count();
    }

    public void addAttempt(Attempt attempt) {
        attempts.add(0, attempt);
        lastAttemptedOn = attempt.getAttemptedOn();
    }

    public void setStatus(ProblemStatus status) {
        this.status = status;
    }

    public void markSolved(LocalDate solvedOn) {
        this.status = ProblemStatus.SOLVED;
        this.solvedOn = solvedOn;
    }

    public void markInProgress() {
        if (status == ProblemStatus.TODO) {
            status = ProblemStatus.IN_PROGRESS;
        }
    }
}
