package com.randomproject.leetcode;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.time.LocalDate;

public class AttemptForm {
    @NotNull(message = "Attempt date is required")
    private LocalDate attemptedOn = LocalDate.now();

    @NotNull(message = "Outcome is required")
    private AttemptOutcome outcome = AttemptOutcome.FAILED;

    @Min(value = 1, message = "Runtime must be at least 1 ms")
    @Max(value = 20000, message = "Runtime must be under 20,000 ms")
    private Integer runtimeMs;

    @Min(value = 1, message = "Memory must be at least 1 MB")
    @Max(value = 2048, message = "Memory must be under 2048 MB")
    private Integer memoryMb;

    @Min(value = 1, message = "Time spent must be at least 1 minute")
    @Max(value = 600, message = "Time spent must be under 600 minutes")
    private Integer durationMinutes;

    @Size(max = 40, message = "Language must be at most 40 characters")
    private String language;

    @Size(max = 500, message = "Notes must be at most 500 characters")
    private String notes;

    public LocalDate getAttemptedOn() {
        return attemptedOn;
    }

    public void setAttemptedOn(LocalDate attemptedOn) {
        this.attemptedOn = attemptedOn;
    }

    public AttemptOutcome getOutcome() {
        return outcome;
    }

    public void setOutcome(AttemptOutcome outcome) {
        this.outcome = outcome;
    }

    public Integer getRuntimeMs() {
        return runtimeMs;
    }

    public void setRuntimeMs(Integer runtimeMs) {
        this.runtimeMs = runtimeMs;
    }

    public Integer getMemoryMb() {
        return memoryMb;
    }

    public void setMemoryMb(Integer memoryMb) {
        this.memoryMb = memoryMb;
    }

    public Integer getDurationMinutes() {
        return durationMinutes;
    }

    public void setDurationMinutes(Integer durationMinutes) {
        this.durationMinutes = durationMinutes;
    }

    public String getLanguage() {
        return language;
    }

    public void setLanguage(String language) {
        this.language = language;
    }

    public String getNotes() {
        return notes;
    }

    public void setNotes(String notes) {
        this.notes = notes;
    }
}
