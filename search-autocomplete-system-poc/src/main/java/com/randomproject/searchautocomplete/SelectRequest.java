package com.randomproject.searchautocomplete;

import jakarta.validation.constraints.NotBlank;

public record SelectRequest(
        @NotBlank String term
) {
}
