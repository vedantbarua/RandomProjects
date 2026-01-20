package com.randomproject.yelp;

import java.time.LocalDate;

public class Review {
    private final long id;
    private final String reviewerName;
    private final int rating;
    private final String comment;
    private final LocalDate visitedOn;

    public Review(long id, String reviewerName, int rating, String comment, LocalDate visitedOn) {
        this.id = id;
        this.reviewerName = reviewerName;
        this.rating = rating;
        this.comment = comment;
        this.visitedOn = visitedOn;
    }

    public long getId() {
        return id;
    }

    public String getReviewerName() {
        return reviewerName;
    }

    public int getRating() {
        return rating;
    }

    public String getComment() {
        return comment;
    }

    public LocalDate getVisitedOn() {
        return visitedOn;
    }
}
