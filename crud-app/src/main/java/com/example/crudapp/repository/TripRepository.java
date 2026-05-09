package com.example.crudapp.repository;

import com.example.crudapp.model.TripRecord;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface TripRepository extends JpaRepository<TripRecord, Long> {
    List<TripRecord> findByInvoiceNoContainingIgnoreCaseOrTravellingPersonContainingIgnoreCaseOrTripCodeContainingIgnoreCase(
            String invoiceNo, String travellingPerson, String tripCode);
}
