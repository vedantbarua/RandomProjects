package com.randomproject.ratelimiter;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.time.Instant;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.regex.Pattern;

@Service
public class RateLimiterService {
    private static final Pattern KEY_PATTERN = Pattern.compile("^[A-Za-z0-9._:-]+$");
    private final Map<String, RateLimitBucket> buckets = new ConcurrentHashMap<>();
    private final int defaultLimit;
    private final int defaultWindowSeconds;

    public RateLimiterService(
            @Value("${rate.default-limit:10}") int defaultLimit,
            @Value("${rate.default-window-seconds:60}") int defaultWindowSeconds) {
        this.defaultLimit = defaultLimit;
        this.defaultWindowSeconds = defaultWindowSeconds;
    }

    public int getDefaultLimit() {
        return defaultLimit;
    }

    public int getDefaultWindowSeconds() {
        return defaultWindowSeconds;
    }

    public synchronized RateLimitDecision check(String key, Integer limit, Integer windowSeconds, Integer cost) {
        String normalizedKey = normalizeKey(key);
        int resolvedLimit = normalizeLimit(limit);
        int resolvedWindowSeconds = normalizeWindowSeconds(windowSeconds);
        int resolvedCost = normalizeCost(cost);
        if (resolvedCost > resolvedLimit) {
            throw new IllegalArgumentException("Cost cannot exceed the limit.");
        }
        Instant now = Instant.now();
        RateLimitBucket bucket = buckets.get(normalizedKey);
        if (bucket == null) {
            bucket = new RateLimitBucket(normalizedKey, resolvedLimit, resolvedWindowSeconds, now);
            buckets.put(normalizedKey, bucket);
        }
        bucket.updatePolicy(resolvedLimit, resolvedWindowSeconds, now);
        return bucket.attempt(resolvedCost, now);
    }

    public synchronized List<RateLimitSnapshot> snapshots() {
        Instant now = Instant.now();
        return buckets.values().stream()
                .map(bucket -> bucket.snapshot(now))
                .sorted(Comparator.comparing(RateLimitSnapshot::updatedAt).reversed())
                .toList();
    }

    public synchronized boolean reset(String key) {
        if (!StringUtils.hasText(key)) {
            return false;
        }
        return buckets.remove(key.trim()) != null;
    }

    public synchronized void resetAll() {
        buckets.clear();
    }

    private String normalizeKey(String key) {
        if (!StringUtils.hasText(key)) {
            throw new IllegalArgumentException("Key cannot be empty.");
        }
        String normalized = key.trim();
        if (!KEY_PATTERN.matcher(normalized).matches()) {
            throw new IllegalArgumentException("Key must use letters, numbers, '.', '-', '_', or ':'.");
        }
        return normalized;
    }

    private int normalizeLimit(Integer limit) {
        int resolved = limit == null ? defaultLimit : limit;
        if (resolved <= 0) {
            throw new IllegalArgumentException("Limit must be at least 1.");
        }
        return resolved;
    }

    private int normalizeWindowSeconds(Integer windowSeconds) {
        int resolved = windowSeconds == null ? defaultWindowSeconds : windowSeconds;
        if (resolved <= 0) {
            throw new IllegalArgumentException("Window seconds must be at least 1.");
        }
        return resolved;
    }

    private int normalizeCost(Integer cost) {
        int resolved = cost == null ? 1 : cost;
        if (resolved <= 0) {
            throw new IllegalArgumentException("Cost must be at least 1.");
        }
        return resolved;
    }
}
