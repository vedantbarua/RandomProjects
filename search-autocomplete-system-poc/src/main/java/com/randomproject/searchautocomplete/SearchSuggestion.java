package com.randomproject.searchautocomplete;

import java.time.Instant;

public record SearchSuggestion(
        String term,
        long score,
        Instant lastSelectedAt
) {
}
