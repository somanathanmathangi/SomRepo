package com.example.productmanagementapp;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/excel")
@CrossOrigin(origins = "*")
public class ExcelController {

    private final ExcelService excelService;

    public ExcelController(ExcelService excelService) {
        this.excelService = excelService;
    }

    @PostMapping("/search")
    public ResponseEntity<Map<String, Object>> searchExcelFile(
            @RequestParam("file") MultipartFile file,
            @RequestParam("query") String query) {

        Map<String, Object> response = new HashMap<>();
        try {
            if (file.isEmpty()) {
                response.put("error", "Please upload an Excel file.");
                return ResponseEntity.badRequest().body(response);
            }
            if (query == null || query.trim().isEmpty()) {
                response.put("error", "Search query cannot be empty.");
                return ResponseEntity.badRequest().body(response);
            }

            List<List<String>> results = excelService.searchExcel(file, query.trim());
            response.put("matches", results);
            return ResponseEntity.ok(response);

        } catch (Exception e) {
            response.put("error", "Error processing file: " + e.getMessage());
            return ResponseEntity.internalServerError().body(response);
        }
    }
}
