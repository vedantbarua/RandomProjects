package com.randomproject.yelp;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public class BusinessForm {
    @NotBlank(message = "Name is required")
    @Size(max = 80, message = "Name must be 80 characters or less")
    private String name;

    @NotNull(message = "Category is required")
    private BusinessCategory category;

    @NotNull(message = "Price tier is required")
    private PriceTier priceTier;

    @NotBlank(message = "Neighborhood is required")
    @Size(max = 60, message = "Neighborhood must be 60 characters or less")
    private String neighborhood;

    @NotBlank(message = "Address is required")
    @Size(max = 120, message = "Address must be 120 characters or less")
    private String address;

    @Size(max = 30, message = "Phone must be 30 characters or less")
    private String phone;

    @Size(max = 240, message = "Description must be 240 characters or less")
    private String description;

    private boolean openNow;

    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }

    public BusinessCategory getCategory() {
        return category;
    }

    public void setCategory(BusinessCategory category) {
        this.category = category;
    }

    public PriceTier getPriceTier() {
        return priceTier;
    }

    public void setPriceTier(PriceTier priceTier) {
        this.priceTier = priceTier;
    }

    public String getNeighborhood() {
        return neighborhood;
    }

    public void setNeighborhood(String neighborhood) {
        this.neighborhood = neighborhood;
    }

    public String getAddress() {
        return address;
    }

    public void setAddress(String address) {
        this.address = address;
    }

    public String getPhone() {
        return phone;
    }

    public void setPhone(String phone) {
        this.phone = phone;
    }

    public String getDescription() {
        return description;
    }

    public void setDescription(String description) {
        this.description = description;
    }

    public boolean isOpenNow() {
        return openNow;
    }

    public void setOpenNow(boolean openNow) {
        this.openNow = openNow;
    }
}
