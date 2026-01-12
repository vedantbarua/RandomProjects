package com.randomproject.searchautocomplete;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.regex.Pattern;

@Service
public class AutocompleteService {
    private static final Pattern TERM_PATTERN = Pattern.compile("^[A-Za-z0-9 ._:/&'\\-]+$");

    private final Map<String, SearchTerm> terms = new HashMap<>();
    private final Map<String, List<SearchTerm>> prefixIndex = new HashMap<>();
    private final int defaultLimit;
    private final int maxPrefixLength;
    private final int maxTermLength;

    public AutocompleteService(
            @Value("${autocomplete.default-limit:8}") int defaultLimit,
            @Value("${autocomplete.max-prefix-length:20}") int maxPrefixLength,
            @Value("${autocomplete.max-term-length:80}") int maxTermLength) {
        this.defaultLimit = defaultLimit;
        this.maxPrefixLength = maxPrefixLength;
        this.maxTermLength = maxTermLength;
        seedDefaults();
    }

    public int getDefaultLimit() {
        return defaultLimit;
    }

    public int getMaxPrefixLength() {
        return maxPrefixLength;
    }

    public synchronized List<SearchSuggestion> suggest(String prefix, Integer limit) {
        String normalizedPrefix = normalizePrefix(prefix);
        int resolvedLimit = normalizeLimit(limit);
        List<SearchTerm> source = prefixIndex.get(normalizedPrefix);
        if (source == null) {
            source = terms.values().stream()
                    .filter(term -> term.getKey().startsWith(normalizedPrefix))
                    .sorted(rankComparator())
                    .toList();
        }
        return source.stream()
                .limit(resolvedLimit)
                .map(this::toSuggestion)
                .toList();
    }

    public synchronized SearchTerm upsertTerm(String term, Long score) {
        NormalizedTerm normalized = normalizeTerm(term);
        SearchTerm existing = terms.get(normalized.key());
        Instant now = Instant.now();
        long resolvedScore = score == null ? 0 : score;
        if (existing == null) {
            SearchTerm created = new SearchTerm(normalized.key(), normalized.display(), resolvedScore, now, now, null);
            terms.put(normalized.key(), created);
        } else {
            existing.updateTerm(normalized.display(), now);
            if (score != null) {
                existing.updateScore(resolvedScore, now);
            }
        }
        rebuildIndex();
        return terms.get(normalized.key());
    }

    public synchronized SearchTerm recordSelection(String term) {
        NormalizedTerm normalized = normalizeTerm(term);
        Instant now = Instant.now();
        SearchTerm existing = terms.get(normalized.key());
        if (existing == null) {
            existing = new SearchTerm(normalized.key(), normalized.display(), 0, now, now, null);
            terms.put(normalized.key(), existing);
        }
        existing.recordSelection(now);
        rebuildIndex();
        return existing;
    }

    public synchronized List<SearchTerm> allTerms() {
        return terms.values().stream()
                .sorted(rankComparator())
                .toList();
    }

    private void seedDefaults() {
        Instant now = Instant.now();
        seed("apple watch", 42, now);
        seed("apple store", 31, now);
        seed("app store", 28, now);
        seed("app development", 20, now);
        seed("banana bread", 22, now);
        seed("best pizza", 25, now);
        seed("best coffee near me", 24, now);
        seed("blue ocean strategy", 18, now);
        seed("book flight to paris", 16, now);
        seed("budget travel tips", 14, now);
        seed("camera comparison", 12, now);
        seed("car insurance quote", 27, now);
        seed("chat gpt prompts", 35, now);
        seed("cheap flights", 30, now);
        seed("chocolate cake", 26, now);
        seed("coffee brewing guide", 15, now);
        seed("concert tickets", 19, now);
        seed("crypto portfolio tracker", 13, now);
        seed("data structures", 29, now);
        seed("dog grooming", 11, now);
        rebuildIndex();
    }

    private void seed(String term, long score, Instant now) {
        NormalizedTerm normalized = normalizeTerm(term);
        SearchTerm entry = new SearchTerm(normalized.key(), normalized.display(), score, now, now, null);
        terms.put(normalized.key(), entry);
    }

    private void rebuildIndex() {
        prefixIndex.clear();
        List<SearchTerm> ordered = terms.values().stream().sorted(rankComparator()).toList();
        prefixIndex.put("", ordered);
        for (SearchTerm term : ordered) {
            String key = term.getKey();
            int limit = Math.min(key.length(), maxPrefixLength);
            for (int i = 1; i <= limit; i++) {
                String prefix = key.substring(0, i);
                prefixIndex.computeIfAbsent(prefix, ignored -> new ArrayList<>()).add(term);
            }
        }
        prefixIndex.replaceAll((prefix, entries) -> entries.stream()
                .sorted(rankComparator())
                .toList());
    }

    private Comparator<SearchTerm> rankComparator() {
        return Comparator.comparingLong(SearchTerm::getScore).reversed()
                .thenComparing(SearchTerm::getLastSelectedAt, Comparator.nullsLast(Comparator.reverseOrder()))
                .thenComparing(SearchTerm::getTerm);
    }

    private int normalizeLimit(Integer limit) {
        int resolved = limit == null ? defaultLimit : limit;
        if (resolved <= 0) {
            throw new IllegalArgumentException("Limit must be at least 1.");
        }
        return resolved;
    }

    private NormalizedTerm normalizeTerm(String term) {
        if (!StringUtils.hasText(term)) {
            throw new IllegalArgumentException("Term cannot be empty.");
        }
        String trimmed = term.trim().replaceAll("\\s+", " ");
        if (trimmed.length() > maxTermLength) {
            throw new IllegalArgumentException("Term is too long (max " + maxTermLength + ").");
        }
        if (!TERM_PATTERN.matcher(trimmed).matches()) {
            throw new IllegalArgumentException("Term may use letters, numbers, spaces, and . _ : / & ' - characters.");
        }
        return new NormalizedTerm(trimmed, trimmed.toLowerCase(Locale.ROOT));
    }

    private String normalizePrefix(String prefix) {
        if (!StringUtils.hasText(prefix)) {
            return "";
        }
        String trimmed = prefix.trim().replaceAll("\\s+", " ");
        if (trimmed.length() > maxTermLength) {
            throw new IllegalArgumentException("Prefix is too long (max " + maxTermLength + ").");
        }
        if (!TERM_PATTERN.matcher(trimmed).matches()) {
            throw new IllegalArgumentException("Prefix may use letters, numbers, spaces, and . _ : / & ' - characters.");
        }
        return trimmed.toLowerCase(Locale.ROOT);
    }

    private SearchSuggestion toSuggestion(SearchTerm term) {
        return new SearchSuggestion(term.getTerm(), term.getScore(), term.getLastSelectedAt());
    }

    private record NormalizedTerm(String display, String key) {
    }
}
