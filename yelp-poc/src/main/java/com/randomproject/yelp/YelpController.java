package com.randomproject.yelp;

import jakarta.validation.Valid;
import java.time.LocalDate;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.validation.BindingResult;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.server.ResponseStatusException;

@Controller
public class YelpController {
    private final BusinessService businessService;

    public YelpController(BusinessService businessService) {
        this.businessService = businessService;
    }

    @GetMapping("/")
    public String home(Model model) {
        model.addAttribute("businesses", businessService.listBusinesses());
        model.addAttribute("summary", businessService.getSummary());
        return "home";
    }

    @GetMapping("/business/{id}")
    public String business(@PathVariable long id, Model model) {
        Business business = businessService.getBusiness(id);
        if (business == null) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Business not found");
        }
        model.addAttribute("business", business);
        return "business";
    }

    @GetMapping("/new")
    public String newBusiness(Model model) {
        model.addAttribute("businessForm", new BusinessForm());
        model.addAttribute("categories", BusinessCategory.values());
        model.addAttribute("priceTiers", PriceTier.values());
        return "new-business";
    }

    @PostMapping("/businesses")
    public String createBusiness(@Valid @ModelAttribute("businessForm") BusinessForm form,
                                 BindingResult bindingResult,
                                 Model model) {
        if (bindingResult.hasErrors()) {
            model.addAttribute("categories", BusinessCategory.values());
            model.addAttribute("priceTiers", PriceTier.values());
            return "new-business";
        }
        Business business = businessService.createBusiness(form);
        return "redirect:/business/" + business.getId();
    }

    @GetMapping("/business/{id}/review")
    public String newReview(@PathVariable long id, Model model) {
        Business business = businessService.getBusiness(id);
        if (business == null) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Business not found");
        }
        ReviewForm form = new ReviewForm();
        form.setRating(5);
        form.setVisitedOn(LocalDate.now());
        model.addAttribute("business", business);
        model.addAttribute("reviewForm", form);
        return "new-review";
    }

    @PostMapping("/business/{id}/reviews")
    public String createReview(@PathVariable long id,
                               @Valid @ModelAttribute("reviewForm") ReviewForm form,
                               BindingResult bindingResult,
                               Model model) {
        Business business = businessService.getBusiness(id);
        if (business == null) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Business not found");
        }
        if (bindingResult.hasErrors()) {
            model.addAttribute("business", business);
            return "new-review";
        }
        businessService.addReview(id, form);
        return "redirect:/business/" + id;
    }
}
