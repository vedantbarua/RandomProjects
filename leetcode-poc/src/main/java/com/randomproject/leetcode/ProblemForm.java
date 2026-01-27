package com.randomproject.leetcode;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public class ProblemForm {
    @NotBlank(message = "Title is required")
    @Size(max = 120, message = "Title must be at most 120 characters")
    private String title;

    @NotNull(message = "Difficulty is required")
    private Difficulty difficulty = Difficulty.MEDIUM;

    @NotNull(message = "Status is required")
    private ProblemStatus status = ProblemStatus.TODO;

    @Size(max = 200, message = "Tags must be at most 200 characters")
    private String tags;

    @Size(max = 200, message = "URL must be at most 200 characters")
    private String url;

    @Size(max = 500, message = "Notes must be at most 500 characters")
    private String notes;

    public String getTitle() {
        return title;
    }

    public void setTitle(String title) {
        this.title = title;
    }

    public Difficulty getDifficulty() {
        return difficulty;
    }

    public void setDifficulty(Difficulty difficulty) {
        this.difficulty = difficulty;
    }

    public ProblemStatus getStatus() {
        return status;
    }

    public void setStatus(ProblemStatus status) {
        this.status = status;
    }

    public String getTags() {
        return tags;
    }

    public void setTags(String tags) {
        this.tags = tags;
    }

    public String getUrl() {
        return url;
    }

    public void setUrl(String url) {
        this.url = url;
    }

    public String getNotes() {
        return notes;
    }

    public void setNotes(String notes) {
        this.notes = notes;
    }
}
