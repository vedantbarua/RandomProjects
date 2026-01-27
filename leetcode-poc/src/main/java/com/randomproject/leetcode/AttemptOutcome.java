package com.randomproject.leetcode;

public enum AttemptOutcome {
    ACCEPTED("Accepted"),
    PARTIAL("Partial"),
    TLE("Time limit"),
    MLE("Memory limit"),
    FAILED("Failed");

    private final String label;

    AttemptOutcome(String label) {
        this.label = label;
    }

    public String getLabel() {
        return label;
    }
}
