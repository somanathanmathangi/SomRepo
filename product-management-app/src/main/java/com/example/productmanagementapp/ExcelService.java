package com.example.productmanagementapp;

import org.apache.poi.ss.usermodel.*;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.io.InputStream;
import java.util.ArrayList;
import java.util.List;

@Service
public class ExcelService {

    public List<List<String>> searchExcel(MultipartFile file, String searchQuery) throws Exception {
        List<List<String>> matchingRows = new ArrayList<>();
        String lowerQuery = searchQuery.toLowerCase();

        try (InputStream is = file.getInputStream();
             Workbook workbook = WorkbookFactory.create(is)) {

            for (Sheet sheet : workbook) {
                for (Row row : sheet) {
                    boolean rowMatches = false;
                    List<String> rowData = new ArrayList<>();
                    
                    for (Cell cell : row) {
                        String cellValue = getCellValueAsString(cell);
                        rowData.add(cellValue);
                        if (cellValue.toLowerCase().contains(lowerQuery)) {
                            rowMatches = true;
                        }
                    }

                    if (rowMatches) {
                        matchingRows.add(rowData);
                    }
                }
            }
        }
        return matchingRows;
    }

    private String getCellValueAsString(Cell cell) {
        if (cell == null) return "";
        DataFormatter formatter = new DataFormatter();
        return formatter.formatCellValue(cell);
    }
}
