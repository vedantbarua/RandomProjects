package com.randomproject.yelp;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

public class Business {
    private final long id;
    private final String name;
    private final BusinessCategory category;
    private final PriceTier priceTier;
    private final String neighborhood;
    private final String address;
    private final String phone;
    private final String description;
    private final boolean openNow;
    private final List<Review> reviews = new ArrayList<>();

    public Business(long id,
                    String name,
                    BusinessCategory category,
                    PriceTier priceTier,
                    String neighborhood,
                    String address,
                    String phone,
                    String description,
                    boolean openNow) {
        this.id = id;
        this.name = name;
        this.category = category;
        this.priceTier = priceTier;
        this.neighborhood = neighborhood;
        this.address = address;
        this.phone = phone;
        this.description = description;
        this.openNow = openNow;
    }

    public long getId() {
        return id;
    }

    public String getName() {
        return name;
    }

    public BusinessCategory getCategory() {
        return category;
    }

    public PriceTier getPriceTier() {
        return priceTier;
    }

    public String getNeighborhood() {
        return neighborhood;
    }

    public String getAddress() {
        return address;
    }

    public String getPhone() {
        return phone;
    }

    public String getDescription() {
        return description;
    }

    public boolean isOpenNow() {
        return openNow;
    }

    public List<Review> getReviews() {
        return Collections.unmodifiableList(reviews);
    }

    public void addReview(Review review) {
        reviews.add(review);
    }

    public int getReviewCount() {
        return reviews.size();
    }

    public double getAverageRating() {
        if (reviews.isEmpty()) {
            return 0;
        }
        int total = reviews.stream().mapToInt(Review::getRating).sum();
        return (double) total / reviews.size();
    }
}
