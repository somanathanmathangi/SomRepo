package com.example.crudapp.service;

import com.example.crudapp.model.TripRecord;
import com.example.crudapp.repository.TripRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Optional;

@Service
public class TripService {

    @Autowired
    private TripRepository repository;

    public List<TripRecord> getAllTrips() {
        return repository.findAll();
    }

    public Optional<TripRecord> getTripById(Long id) {
        return repository.findById(id);
    }

    public TripRecord saveTrip(TripRecord trip) {
        return repository.save(trip);
    }

    public TripRecord updateTrip(Long id, TripRecord tripDetails) {
        TripRecord trip = repository.findById(id)
                .orElseThrow(() -> new RuntimeException("Trip not found with id: " + id));
        
        trip.setInvoiceDate(tripDetails.getInvoiceDate());
        trip.setInvoiceNo(tripDetails.getInvoiceNo());
        trip.setTravellingPerson(tripDetails.getTravellingPerson());
        trip.setTravelDate(tripDetails.getTravelDate());
        // TripCode is typically not updated as it's auto-generated, but we keep it stable
        
        return repository.save(trip);
    }

    public void deleteTrip(Long id) {
        repository.deleteById(id);
    }

    public List<TripRecord> searchTrips(String keyword) {
        return repository.findByInvoiceNoContainingIgnoreCaseOrTravellingPersonContainingIgnoreCaseOrTripCodeContainingIgnoreCase(
                keyword, keyword, keyword);
    }
}
