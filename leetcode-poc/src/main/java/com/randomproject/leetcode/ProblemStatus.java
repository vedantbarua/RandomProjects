package com.randomproject.leetcode;

public enum ProblemStatus {
    TODO("To do"),
    IN_PROGRESS("In progress"),
    SOLVED("Solved");

    private final String label;

    ProblemStatus(String label) {
        this.label = label;
    }

    public String getLabel() {
        return label;
    }
}
