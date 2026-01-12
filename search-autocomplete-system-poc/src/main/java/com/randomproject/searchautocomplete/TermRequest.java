package com.randomproject.searchautocomplete;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;

public record TermRequest(
        @NotBlank String term,
        @Min(0) Long score
) {
}
