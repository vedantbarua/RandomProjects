package com.randomproject.ratelimiter;

import java.time.Instant;

public record RateLimitSnapshot(
        String key,
        int limit,
        int remaining,
        int count,
        int windowSeconds,
        Instant windowStart,
        Instant windowEnd,
        Instant updatedAt
) {
}
