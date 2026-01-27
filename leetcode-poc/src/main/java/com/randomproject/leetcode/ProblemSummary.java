package com.randomproject.leetcode;

public class ProblemSummary {
    private final int totalProblems;
    private final int solvedProblems;
    private final int inProgressProblems;
    private final int todoProblems;
    private final int totalAttempts;
    private final double averageMinutes;

    public ProblemSummary(int totalProblems,
                          int solvedProblems,
                          int inProgressProblems,
                          int todoProblems,
                          int totalAttempts,
                          double averageMinutes) {
        this.totalProblems = totalProblems;
        this.solvedProblems = solvedProblems;
        this.inProgressProblems = inProgressProblems;
        this.todoProblems = todoProblems;
        this.totalAttempts = totalAttempts;
        this.averageMinutes = averageMinutes;
    }

    public int getTotalProblems() {
        return totalProblems;
    }

    public int getSolvedProblems() {
        return solvedProblems;
    }

    public int getInProgressProblems() {
        return inProgressProblems;
    }

    public int getTodoProblems() {
        return todoProblems;
    }

    public int getTotalAttempts() {
        return totalAttempts;
    }

    public double getAverageMinutes() {
        return averageMinutes;
    }
}
