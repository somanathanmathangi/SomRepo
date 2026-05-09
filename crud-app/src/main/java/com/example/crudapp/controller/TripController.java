package com.example.crudapp.controller;

import com.example.crudapp.model.TripRecord;
import com.example.crudapp.service.TripService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/trips")
@CrossOrigin(origins = "*")
public class TripController {

    @Autowired
    private TripService service;

    @GetMapping
    public List<TripRecord> getAllTrips() {
        return service.getAllTrips();
    }

    @GetMapping("/{id}")
    public ResponseEntity<TripRecord> getTripById(@PathVariable Long id) {
        return service.getTripById(id)
                .map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }

    @PostMapping
    public TripRecord createTrip(@RequestBody TripRecord trip) {
        return service.saveTrip(trip);
    }

    @PutMapping("/{id}")
    public ResponseEntity<TripRecord> updateTrip(@PathVariable Long id, @RequestBody TripRecord tripDetails) {
        try {
            return ResponseEntity.ok(service.updateTrip(id, tripDetails));
        } catch (RuntimeException e) {
            return ResponseEntity.notFound().build();
        }
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> deleteTrip(@PathVariable Long id) {
        service.deleteTrip(id);
        return ResponseEntity.ok().build();
    }

    @GetMapping("/search")
    public List<TripRecord> searchTrips(@RequestParam String keyword) {
        return service.searchTrips(keyword);
    }
}
