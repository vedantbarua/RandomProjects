package com.randomproject.yelp;

public enum BusinessCategory {
    CAFE("Cafe"),
    PIZZA("Pizza"),
    SUSHI("Sushi"),
    MEXICAN("Mexican"),
    INDIAN("Indian"),
    BAKERY("Bakery"),
    NEW_AMERICAN("New American");

    private final String label;

    BusinessCategory(String label) {
        this.label = label;
    }

    public String getLabel() {
        return label;
    }
}
