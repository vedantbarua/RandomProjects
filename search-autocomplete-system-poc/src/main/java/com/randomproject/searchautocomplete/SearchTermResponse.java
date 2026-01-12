package com.randomproject.searchautocomplete;

import java.time.Instant;

public record SearchTermResponse(
        String term,
        long score,
        Instant createdAt,
        Instant updatedAt,
        Instant lastSelectedAt
) {
}
