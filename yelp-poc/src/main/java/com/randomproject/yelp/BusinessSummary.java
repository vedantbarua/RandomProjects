package com.randomproject.yelp;

public class BusinessSummary {
    private final int totalBusinesses;
    private final int totalReviews;
    private final double averageRating;

    public BusinessSummary(int totalBusinesses, int totalReviews, double averageRating) {
        this.totalBusinesses = totalBusinesses;
        this.totalReviews = totalReviews;
        this.averageRating = averageRating;
    }

    public int getTotalBusinesses() {
        return totalBusinesses;
    }

    public int getTotalReviews() {
        return totalReviews;
    }

    public double getAverageRating() {
        return averageRating;
    }
}
