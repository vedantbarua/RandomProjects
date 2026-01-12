package com.randomproject.searchautocomplete;

import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseBody;
import org.springframework.web.servlet.mvc.support.RedirectAttributes;

import java.util.List;

@Controller
public class AutocompleteController {
    private final AutocompleteService service;

    public AutocompleteController(AutocompleteService service) {
        this.service = service;
    }

    @GetMapping("/")
    public String home(Model model) {
        model.addAttribute("defaultLimit", service.getDefaultLimit());
        model.addAttribute("maxPrefixLength", service.getMaxPrefixLength());
        model.addAttribute("terms", service.allTerms());
        if (!model.containsAttribute("prefix")) {
            model.addAttribute("prefix", "");
        }
        if (!model.containsAttribute("limit")) {
            model.addAttribute("limit", service.getDefaultLimit());
        }
        return "index";
    }

    @PostMapping("/suggest")
    public String suggest(@RequestParam(value = "prefix", required = false) String prefix,
                          @RequestParam(value = "limit", required = false) Integer limit,
                          RedirectAttributes redirectAttributes) {
        try {
            List<SearchSuggestion> suggestions = service.suggest(prefix, limit);
            redirectAttributes.addFlashAttribute("suggestions", suggestions);
            redirectAttributes.addFlashAttribute("prefix", prefix == null ? "" : prefix.trim());
            redirectAttributes.addFlashAttribute("limit", limit == null ? service.getDefaultLimit() : limit);
            redirectAttributes.addFlashAttribute(
                    "message",
                    suggestions.isEmpty()
                            ? "No suggestions found."
                            : "Found " + suggestions.size() + " suggestion(s)."
            );
        } catch (IllegalArgumentException ex) {
            redirectAttributes.addFlashAttribute("message", ex.getMessage());
        }
        return "redirect:/";
    }

    @PostMapping("/terms")
    public String addTerm(@RequestParam("term") String term,
                          @RequestParam(value = "score", required = false) Long score,
                          RedirectAttributes redirectAttributes) {
        try {
            SearchTerm entry = service.upsertTerm(term, score);
            redirectAttributes.addFlashAttribute(
                    "message",
                    "Saved term: " + entry.getTerm() + " (score " + entry.getScore() + ")"
            );
        } catch (IllegalArgumentException ex) {
            redirectAttributes.addFlashAttribute("message", ex.getMessage());
        }
        return "redirect:/";
    }

    @PostMapping("/select")
    public String recordSelection(@RequestParam("term") String term, RedirectAttributes redirectAttributes) {
        try {
            SearchTerm entry = service.recordSelection(term);
            redirectAttributes.addFlashAttribute(
                    "message",
                    "Recorded selection for " + entry.getTerm() + " (score " + entry.getScore() + ")"
            );
        } catch (IllegalArgumentException ex) {
            redirectAttributes.addFlashAttribute("message", ex.getMessage());
        }
        return "redirect:/";
    }

    @GetMapping("/api/suggest")
    @ResponseBody
    public List<SearchSuggestion> apiSuggest(@RequestParam(value = "prefix", required = false) String prefix,
                                             @RequestParam(value = "limit", required = false) Integer limit) {
        return service.suggest(prefix, limit);
    }

    @GetMapping("/api/terms")
    @ResponseBody
    public List<SearchTermResponse> apiTerms() {
        return service.allTerms().stream().map(this::toResponse).toList();
    }

    @PostMapping("/api/terms")
    @ResponseBody
    public ResponseEntity<SearchTermResponse> apiUpsert(@Valid @RequestBody TermRequest request) {
        try {
            SearchTerm entry = service.upsertTerm(request.term(), request.score());
            return ResponseEntity.status(201).body(toResponse(entry));
        } catch (IllegalArgumentException ex) {
            return ResponseEntity.badRequest().build();
        }
    }

    @PostMapping("/api/select")
    @ResponseBody
    public ResponseEntity<SearchTermResponse> apiSelect(@Valid @RequestBody SelectRequest request) {
        try {
            SearchTerm entry = service.recordSelection(request.term());
            return ResponseEntity.ok(toResponse(entry));
        } catch (IllegalArgumentException ex) {
            return ResponseEntity.badRequest().build();
        }
    }

    private SearchTermResponse toResponse(SearchTerm entry) {
        return new SearchTermResponse(
                entry.getTerm(),
                entry.getScore(),
                entry.getCreatedAt(),
                entry.getUpdatedAt(),
                entry.getLastSelectedAt()
        );
    }
}
