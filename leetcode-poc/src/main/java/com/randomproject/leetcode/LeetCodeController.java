package com.randomproject.leetcode;

import jakarta.validation.Valid;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.validation.BindingResult;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.server.ResponseStatusException;

@Controller
public class LeetCodeController {
    private final ProblemService problemService;

    public LeetCodeController(ProblemService problemService) {
        this.problemService = problemService;
    }

    @GetMapping("/")
    public String home(@RequestParam(required = false) ProblemStatus status,
                       @RequestParam(required = false) Difficulty difficulty,
                       @RequestParam(required = false) String tag,
                       Model model) {
        List<Problem> problems = problemService.listProblems(status, difficulty, tag);
        model.addAttribute("problems", problems);
        model.addAttribute("summary", problemService.getSummary());
        model.addAttribute("statusFilter", status);
        model.addAttribute("difficultyFilter", difficulty);
        model.addAttribute("tagFilter", tag);
        model.addAttribute("statuses", ProblemStatus.values());
        model.addAttribute("difficulties", Difficulty.values());
        return "home";
    }

    @GetMapping("/problem/{id}")
    public String problem(@PathVariable long id, Model model) {
        Problem problem = problemService.getProblem(id);
        if (problem == null) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Problem not found");
        }
        model.addAttribute("problem", problem);
        return "problem";
    }

    @GetMapping("/new")
    public String newProblem(Model model) {
        model.addAttribute("problemForm", new ProblemForm());
        model.addAttribute("statuses", ProblemStatus.values());
        model.addAttribute("difficulties", Difficulty.values());
        return "new-problem";
    }

    @PostMapping("/problems")
    public String createProblem(@Valid @ModelAttribute("problemForm") ProblemForm form,
                                BindingResult bindingResult,
                                Model model) {
        if (bindingResult.hasErrors()) {
            model.addAttribute("statuses", ProblemStatus.values());
            model.addAttribute("difficulties", Difficulty.values());
            return "new-problem";
        }
        Problem problem = problemService.createProblem(form);
        return "redirect:/problem/" + problem.getId();
    }

    @GetMapping("/problem/{id}/attempt")
    public String newAttempt(@PathVariable long id, Model model) {
        Problem problem = problemService.getProblem(id);
        if (problem == null) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Problem not found");
        }
        model.addAttribute("problem", problem);
        model.addAttribute("attemptForm", new AttemptForm());
        model.addAttribute("outcomes", AttemptOutcome.values());
        return "new-attempt";
    }

    @PostMapping("/problem/{id}/attempts")
    public String createAttempt(@PathVariable long id,
                                @Valid @ModelAttribute("attemptForm") AttemptForm form,
                                BindingResult bindingResult,
                                Model model) {
        Problem problem = problemService.getProblem(id);
        if (problem == null) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Problem not found");
        }
        if (bindingResult.hasErrors()) {
            model.addAttribute("problem", problem);
            model.addAttribute("outcomes", AttemptOutcome.values());
            return "new-attempt";
        }
        problemService.addAttempt(id, form);
        return "redirect:/problem/" + id;
    }
}
