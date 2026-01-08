package com.randomproject.ratelimiter;

import java.time.Instant;

public record RateLimitDecision(
        String key,
        boolean allowed,
        int limit,
        int remaining,
        int windowSeconds,
        Instant windowStart,
        Instant windowEnd,
        int count,
        Instant updatedAt
) {
}
