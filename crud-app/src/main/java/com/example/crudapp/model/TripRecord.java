package com.example.crudapp.model;

import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import java.util.UUID;

@Entity
public class TripRecord {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    private String invoiceDate;
    private String invoiceNo;
    private String travellingPerson;
    private String travelDate;
    private String tripCode;

    public TripRecord() {
        this.tripCode = generateTripCode();
    }

    public TripRecord(String invoiceDate, String invoiceNo, String travellingPerson, String travelDate) {
        this.invoiceDate = invoiceDate;
        this.invoiceNo = invoiceNo;
        this.travellingPerson = travellingPerson;
        this.travelDate = travelDate;
        this.tripCode = generateTripCode();
    }

    private String generateTripCode() {
        return "TRIP-" + UUID.randomUUID().toString().substring(0, 8).toUpperCase();
    }

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public String getInvoiceDate() {
        return invoiceDate;
    }

    public void setInvoiceDate(String invoiceDate) {
        this.invoiceDate = invoiceDate;
    }

    public String getInvoiceNo() {
        return invoiceNo;
    }

    public void setInvoiceNo(String invoiceNo) {
        this.invoiceNo = invoiceNo;
    }

    public String getTravellingPerson() {
        return travellingPerson;
    }

    public void setTravellingPerson(String travellingPerson) {
        this.travellingPerson = travellingPerson;
    }

    public String getTravelDate() {
        return travelDate;
    }

    public void setTravelDate(String travelDate) {
        this.travelDate = travelDate;
    }

    public String getTripCode() {
        return tripCode;
    }

    public void setTripCode(String tripCode) {
        this.tripCode = tripCode;
    }
}
