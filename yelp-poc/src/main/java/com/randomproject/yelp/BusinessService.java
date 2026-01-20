package com.randomproject.yelp;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicLong;
import org.springframework.stereotype.Service;

@Service
public class BusinessService {
    private final Map<Long, Business> businesses = new ConcurrentHashMap<>();
    private final AtomicLong businessIdSequence = new AtomicLong(2000);
    private final AtomicLong reviewIdSequence = new AtomicLong(9000);

    public BusinessService() {
        seedBusinesses();
    }

    public List<Business> listBusinesses() {
        List<Business> result = new ArrayList<>(businesses.values());
        result.sort(Comparator.comparingDouble(Business::getAverageRating).reversed()
                .thenComparing(Business::getReviewCount, Comparator.reverseOrder())
                .thenComparing(Business::getName));
        return result;
    }

    public Business getBusiness(long id) {
        return businesses.get(id);
    }

    public Business createBusiness(BusinessForm form) {
        long id = businessIdSequence.incrementAndGet();
        Business business = new Business(
                id,
                form.getName().trim(),
                form.getCategory(),
                form.getPriceTier(),
                form.getNeighborhood().trim(),
                form.getAddress().trim(),
                nullIfBlank(form.getPhone()),
                nullIfBlank(form.getDescription()),
                form.isOpenNow()
        );
        businesses.put(id, business);
        return business;
    }

    public Review addReview(long businessId, ReviewForm form) {
        Business business = getBusiness(businessId);
        if (business == null) {
            return null;
        }
        long reviewId = reviewIdSequence.incrementAndGet();
        Review review = new Review(
                reviewId,
                form.getReviewerName().trim(),
                form.getRating(),
                form.getComment().trim(),
                form.getVisitedOn()
        );
        business.addReview(review);
        return review;
    }

    public BusinessSummary getSummary() {
        int totalBusinesses = businesses.size();
        int totalReviews = businesses.values().stream()
                .mapToInt(Business::getReviewCount)
                .sum();
        double averageRating = 0;
        if (totalReviews > 0) {
            int ratingTotal = businesses.values().stream()
                    .flatMap(business -> business.getReviews().stream())
                    .mapToInt(Review::getRating)
                    .sum();
            averageRating = (double) ratingTotal / totalReviews;
        }
        return new BusinessSummary(totalBusinesses, totalReviews, averageRating);
    }

    private void seedBusinesses() {
        Business business = createSeedBusiness(
                "Pine Street Cafe",
                BusinessCategory.CAFE,
                PriceTier.TWO,
                "Downtown",
                "215 Pine Street",
                "555-0142",
                "Latte flights, quiet booths, and a warm pastry case.",
                true
        );
        createSeedReview(business, "Lena M.", 5, "Perfect cappuccino and fast Wi-Fi.",
                LocalDate.now().minusDays(3));
        createSeedReview(business, "Grant D.", 4, "Cozy vibe and the cinnamon roll was legit.",
                LocalDate.now().minusDays(10));

        business = createSeedBusiness(
                "Aster Pizza",
                BusinessCategory.PIZZA,
                PriceTier.TWO,
                "Market District",
                "88 Union Ave",
                "555-0188",
                "Wood-fired pies with seasonal toppings and a solid lunch combo.",
                true
        );
        createSeedReview(business, "Kai R.", 5, "Great crust, loved the chili honey drizzle.",
                LocalDate.now().minusDays(6));
        createSeedReview(business, "Priya S.", 4, "Quick service and a nice patio.",
                LocalDate.now().minusDays(14));

        business = createSeedBusiness(
                "Mesa Verde",
                BusinessCategory.MEXICAN,
                PriceTier.THREE,
                "Old Town",
                "12 Alameda Plaza",
                "555-0119",
                "Modern Mexican with mezcal flights and weekend brunch.",
                false
        );
        createSeedReview(business, "Ava L.", 5, "The birria tacos were unreal.",
                LocalDate.now().minusDays(2));
        createSeedReview(business, "Rohan K.", 4, "Fun atmosphere, a bit loud but worth it.",
                LocalDate.now().minusDays(5));

        business = createSeedBusiness(
                "Harbor Sushi",
                BusinessCategory.SUSHI,
                PriceTier.THREE,
                "Waterfront",
                "401 Bay Street",
                "555-0176",
                "Hand rolls, omakase nights, and a sleek bar.",
                true
        );
        createSeedReview(business, "Maya P.", 5, "Fresh fish and the nigiri flight was excellent.",
                LocalDate.now().minusDays(1));
    }

    private Business createSeedBusiness(String name,
                                        BusinessCategory category,
                                        PriceTier priceTier,
                                        String neighborhood,
                                        String address,
                                        String phone,
                                        String description,
                                        boolean openNow) {
        long id = businessIdSequence.incrementAndGet();
        Business business = new Business(
                id,
                name,
                category,
                priceTier,
                neighborhood,
                address,
                phone,
                description,
                openNow
        );
        businesses.put(id, business);
        return business;
    }

    private void createSeedReview(Business business,
                                  String reviewer,
                                  int rating,
                                  String comment,
                                  LocalDate visitedOn) {
        long id = reviewIdSequence.incrementAndGet();
        business.addReview(new Review(id, reviewer, rating, comment, visitedOn));
    }

    private String nullIfBlank(String value) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }
}
