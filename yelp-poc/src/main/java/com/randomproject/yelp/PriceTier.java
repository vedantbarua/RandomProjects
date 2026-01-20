package com.randomproject.yelp;

public enum PriceTier {
    ONE("$"),
    TWO("$$"),
    THREE("$$$"),
    FOUR("$$$$");

    private final String label;

    PriceTier(String label) {
        this.label = label;
    }

    public String getLabel() {
        return label;
    }
}
