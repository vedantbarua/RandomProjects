package com.randomproject.leetcode;

import java.time.LocalDate;

public class Attempt {
    private final long id;
    private final LocalDate attemptedOn;
    private final AttemptOutcome outcome;
    private final Integer runtimeMs;
    private final Integer memoryMb;
    private final Integer durationMinutes;
    private final String language;
    private final String notes;

    public Attempt(long id,
                   LocalDate attemptedOn,
                   AttemptOutcome outcome,
                   Integer runtimeMs,
                   Integer memoryMb,
                   Integer durationMinutes,
                   String language,
                   String notes) {
        this.id = id;
        this.attemptedOn = attemptedOn;
        this.outcome = outcome;
        this.runtimeMs = runtimeMs;
        this.memoryMb = memoryMb;
        this.durationMinutes = durationMinutes;
        this.language = language;
        this.notes = notes;
    }

    public long getId() {
        return id;
    }

    public LocalDate getAttemptedOn() {
        return attemptedOn;
    }

    public AttemptOutcome getOutcome() {
        return outcome;
    }

    public Integer getRuntimeMs() {
        return runtimeMs;
    }

    public Integer getMemoryMb() {
        return memoryMb;
    }

    public Integer getDurationMinutes() {
        return durationMinutes;
    }

    public String getLanguage() {
        return language;
    }

    public String getNotes() {
        return notes;
    }
}
