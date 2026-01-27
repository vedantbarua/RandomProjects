package com.randomproject.leetcode;

public enum Difficulty {
    EASY("Easy", "badge-easy"),
    MEDIUM("Medium", "badge-medium"),
    HARD("Hard", "badge-hard");

    private final String label;
    private final String badgeClass;

    Difficulty(String label, String badgeClass) {
        this.label = label;
        this.badgeClass = badgeClass;
    }

    public String getLabel() {
        return label;
    }

    public String getBadgeClass() {
        return badgeClass;
    }
}
