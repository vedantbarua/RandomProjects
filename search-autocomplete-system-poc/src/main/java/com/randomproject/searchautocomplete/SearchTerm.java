package com.randomproject.searchautocomplete;

import java.time.Instant;

public class SearchTerm {
    private final String key;
    private String term;
    private long score;
    private Instant createdAt;
    private Instant updatedAt;
    private Instant lastSelectedAt;

    public SearchTerm(String key, String term, long score, Instant createdAt, Instant updatedAt, Instant lastSelectedAt) {
        this.key = key;
        this.term = term;
        this.score = score;
        this.createdAt = createdAt;
        this.updatedAt = updatedAt;
        this.lastSelectedAt = lastSelectedAt;
    }

    public String getKey() {
        return key;
    }

    public String getTerm() {
        return term;
    }

    public long getScore() {
        return score;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }

    public Instant getLastSelectedAt() {
        return lastSelectedAt;
    }

    public void updateTerm(String term, Instant updatedAt) {
        this.term = term;
        this.updatedAt = updatedAt;
    }

    public void updateScore(long score, Instant updatedAt) {
        this.score = score;
        this.updatedAt = updatedAt;
    }

    public void recordSelection(Instant selectedAt) {
        this.score += 1;
        this.lastSelectedAt = selectedAt;
        this.updatedAt = selectedAt;
    }
}
