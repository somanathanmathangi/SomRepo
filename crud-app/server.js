const express = require('express');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const crypto = require('crypto');

const app = express();
const port = 3000;

app.use(cors());
app.use(express.json());

// Serve static files from the public directory
app.use(express.static(path.join(__dirname, 'public')));

// Initialize SQLite database
const db = new sqlite3.Database('./trips.db', (err) => {
  if (err) {
    console.error('Error opening database', err.message);
  } else {
    console.log('Connected to the SQLite database.');
    db.run(`CREATE TABLE IF NOT EXISTS trips (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      invoiceDate TEXT,
      invoiceNo TEXT,
      travellingPerson TEXT,
      travelDate TEXT,
      tripCode TEXT
    )`);
  }
});

function generateTripCode() {
  return "TRIP-" + crypto.randomUUID().substring(0, 8).toUpperCase();
}

// API Endpoints
app.get('/api/trips', (req, res) => {
  db.all('SELECT * FROM trips', [], (err, rows) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    res.json(rows);
  });
});

app.get('/api/trips/search', (req, res) => {
  const keyword = req.query.keyword;
  if (!keyword) {
    res.json([]);
    return;
  }
  const query = `
    SELECT * FROM trips 
    WHERE invoiceNo LIKE ? OR travellingPerson LIKE ? OR tripCode LIKE ?
  `;
  const param = `%${keyword}%`;
  db.all(query, [param, param, param], (err, rows) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    res.json(rows);
  });
});

app.get('/api/trips/:id', (req, res) => {
  const id = req.params.id;
  db.get('SELECT * FROM trips WHERE id = ?', [id], (err, row) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    if (!row) {
      res.status(404).send('Trip not found');
      return;
    }
    res.json(row);
  });
});

app.post('/api/trips', (req, res) => {
  const { invoiceDate, invoiceNo, travellingPerson, travelDate } = req.body;
  const tripCode = generateTripCode();
  
  const query = `
    INSERT INTO trips (invoiceDate, invoiceNo, travellingPerson, travelDate, tripCode)
    VALUES (?, ?, ?, ?, ?)
  `;
  
  db.run(query, [invoiceDate, invoiceNo, travellingPerson, travelDate, tripCode], function(err) {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    res.json({
      id: this.lastID,
      invoiceDate,
      invoiceNo,
      travellingPerson,
      travelDate,
      tripCode
    });
  });
});

app.put('/api/trips/:id', (req, res) => {
  const id = req.params.id;
  const { invoiceDate, invoiceNo, travellingPerson, travelDate } = req.body;
  
  // TripCode is typically not updated
  const query = `
    UPDATE trips 
    SET invoiceDate = ?, invoiceNo = ?, travellingPerson = ?, travelDate = ?
    WHERE id = ?
  `;
  
  db.run(query, [invoiceDate, invoiceNo, travellingPerson, travelDate, id], function(err) {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    if (this.changes === 0) {
      res.status(404).send('Trip not found');
      return;
    }
    
    // Fetch and return the updated row to match Spring behavior
    db.get('SELECT * FROM trips WHERE id = ?', [id], (err, row) => {
      res.json(row);
    });
  });
});

app.delete('/api/trips/:id', (req, res) => {
  const id = req.params.id;
  db.run('DELETE FROM trips WHERE id = ?', [id], function(err) {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    res.status(200).send();
  });
});

app.listen(port, () => {
  console.log(`Node.js server running on port ${port}`);
});
