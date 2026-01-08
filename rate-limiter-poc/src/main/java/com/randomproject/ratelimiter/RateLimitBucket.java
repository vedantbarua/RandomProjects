package com.randomproject.ratelimiter;

import java.time.Instant;

class RateLimitBucket {
    private final String key;
    private int limit;
    private int windowSeconds;
    private Instant windowStart;
    private int count;
    private Instant updatedAt;

    RateLimitBucket(String key, int limit, int windowSeconds, Instant now) {
        this.key = key;
        this.limit = limit;
        this.windowSeconds = windowSeconds;
        this.windowStart = now;
        this.count = 0;
        this.updatedAt = now;
    }

    void updatePolicy(int newLimit, int newWindowSeconds, Instant now) {
        if (limit != newLimit || windowSeconds != newWindowSeconds) {
            this.limit = newLimit;
            this.windowSeconds = newWindowSeconds;
            resetWindow(now);
        }
    }

    RateLimitDecision attempt(int cost, Instant now) {
        refreshWindowIfExpired(now);
        boolean allowed = count + cost <= limit;
        if (allowed) {
            count += cost;
        }
        updatedAt = now;
        int remaining = Math.max(limit - count, 0);
        Instant windowEnd = windowStart.plusSeconds(windowSeconds);
        return new RateLimitDecision(key, allowed, limit, remaining, windowSeconds, windowStart, windowEnd, count, updatedAt);
    }

    RateLimitSnapshot snapshot(Instant now) {
        refreshWindowIfExpired(now);
        int remaining = Math.max(limit - count, 0);
        Instant windowEnd = windowStart.plusSeconds(windowSeconds);
        return new RateLimitSnapshot(key, limit, remaining, count, windowSeconds, windowStart, windowEnd, updatedAt);
    }

    private void refreshWindowIfExpired(Instant now) {
        if (!now.isBefore(windowStart.plusSeconds(windowSeconds))) {
            resetWindow(now);
        }
    }

    private void resetWindow(Instant now) {
        windowStart = now;
        count = 0;
    }
}
