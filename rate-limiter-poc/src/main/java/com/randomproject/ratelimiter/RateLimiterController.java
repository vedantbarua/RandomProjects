package com.randomproject.ratelimiter;

import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseBody;
import org.springframework.web.servlet.mvc.support.RedirectAttributes;

import java.util.List;

@Controller
public class RateLimiterController {
    private final RateLimiterService service;

    public RateLimiterController(RateLimiterService service) {
        this.service = service;
    }

    @GetMapping("/")
    public String home(Model model) {
        model.addAttribute("defaultLimit", service.getDefaultLimit());
        model.addAttribute("defaultWindowSeconds", service.getDefaultWindowSeconds());
        model.addAttribute("buckets", service.snapshots());
        return "index";
    }

    @PostMapping("/check")
    public String checkRequest(@RequestParam("key") String key,
                               @RequestParam(value = "limit", required = false) Integer limit,
                               @RequestParam(value = "windowSeconds", required = false) Integer windowSeconds,
                               @RequestParam(value = "cost", required = false) Integer cost,
                               RedirectAttributes redirectAttributes) {
        try {
            RateLimitDecision decision = service.check(key, limit, windowSeconds, cost);
            redirectAttributes.addFlashAttribute("decision", decision);
            redirectAttributes.addFlashAttribute(
                    "message",
                    decision.allowed() ? "Allowed request for " + decision.key() : "Rate limited: " + decision.key());
        } catch (IllegalArgumentException ex) {
            redirectAttributes.addFlashAttribute("message", ex.getMessage());
        }
        return "redirect:/";
    }

    @PostMapping("/buckets/{key}/reset")
    public String resetBucket(@PathVariable String key, RedirectAttributes redirectAttributes) {
        boolean removed = service.reset(key);
        redirectAttributes.addFlashAttribute(
                "message",
                removed ? "Reset limiter for " + key : "No limiter found for " + key);
        return "redirect:/";
    }

    @PostMapping("/api/limits/check")
    @ResponseBody
    public ResponseEntity<RateLimitDecision> apiCheck(@Valid @RequestBody RateLimitRequest request) {
        try {
            RateLimitDecision decision = service.check(request.key(), request.limit(), request.windowSeconds(), request.cost());
            HttpStatus status = decision.allowed() ? HttpStatus.OK : HttpStatus.TOO_MANY_REQUESTS;
            return ResponseEntity.status(status).body(decision);
        } catch (IllegalArgumentException ex) {
            return ResponseEntity.badRequest().build();
        }
    }

    @GetMapping("/api/limits")
    @ResponseBody
    public List<RateLimitSnapshot> apiLimits() {
        return service.snapshots();
    }

    @PostMapping("/api/limits/{key}/reset")
    @ResponseBody
    public ResponseEntity<Void> apiReset(@PathVariable String key) {
        boolean removed = service.reset(key);
        return removed ? ResponseEntity.noContent().build() : ResponseEntity.notFound().build();
    }

    @DeleteMapping("/api/limits/{key}")
    @ResponseBody
    public ResponseEntity<Void> apiDelete(@PathVariable String key) {
        boolean removed = service.reset(key);
        return removed ? ResponseEntity.noContent().build() : ResponseEntity.notFound().build();
    }
}
