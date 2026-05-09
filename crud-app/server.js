const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const path = require('path');
const crypto = require('crypto');

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Serve static files from the public directory
app.use(express.static(path.join(__dirname, 'public')));

// Initialize PostgreSQL database connection pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false // Required for Render's external connections, but often fine for internal too
});

// Initialize database table
async function initDb() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS trips (
        id SERIAL PRIMARY KEY,
        invoiceDate TEXT,
        invoiceNo TEXT,
        travellingPerson TEXT,
        travelDate TEXT,
        tripCode TEXT
      )
    `);
    console.log('Connected to the PostgreSQL database and initialized table.');
  } catch (err) {
    console.error('Error initializing database', err.stack);
  }
}
initDb();

function generateTripCode() {
  return "TRIP-" + crypto.randomUUID().substring(0, 8).toUpperCase();
}

// API Endpoints
app.get('/api/trips', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM trips ORDER BY id ASC');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/trips/search', async (req, res) => {
  const keyword = req.query.keyword;
  if (!keyword) {
    res.json([]);
    return;
  }
  try {
    const query = `
      SELECT * FROM trips 
      WHERE invoiceNo ILIKE $1 OR travellingPerson ILIKE $1 OR tripCode ILIKE $1
    `;
    const param = `%${keyword}%`;
    const result = await pool.query(query, [param]);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/trips/:id', async (req, res) => {
  const id = req.params.id;
  try {
    const result = await pool.query('SELECT * FROM trips WHERE id = $1', [id]);
    if (result.rows.length === 0) {
      res.status(404).send('Trip not found');
      return;
    }
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/trips', async (req, res) => {
  const { invoiceDate, invoiceNo, travellingPerson, travelDate } = req.body;
  const tripCode = generateTripCode();
  
  const query = `
    INSERT INTO trips ("invoicedate", "invoiceno", "travellingperson", "traveldate", "tripcode")
    VALUES ($1, $2, $3, $4, $5)
    RETURNING *
  `;
  
  try {
    // Postgres converts column names to lowercase if not quoted, so using quoted names just in case, but let's stick to lowercase in the code
    const insertQuery = `
      INSERT INTO trips (invoiceDate, invoiceNo, travellingPerson, travelDate, tripCode)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `;
    const result = await pool.query(insertQuery, [invoiceDate, invoiceNo, travellingPerson, travelDate, tripCode]);
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/trips/:id', async (req, res) => {
  const id = req.params.id;
  const { invoiceDate, invoiceNo, travellingPerson, travelDate } = req.body;
  
  const query = `
    UPDATE trips 
    SET invoiceDate = $1, invoiceNo = $2, travellingPerson = $3, travelDate = $4
    WHERE id = $5
    RETURNING *
  `;
  
  try {
    const result = await pool.query(query, [invoiceDate, invoiceNo, travellingPerson, travelDate, id]);
    if (result.rowCount === 0) {
      res.status(404).send('Trip not found');
      return;
    }
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/trips/:id', async (req, res) => {
  const id = req.params.id;
  try {
    const result = await pool.query('DELETE FROM trips WHERE id = $1', [id]);
    res.status(200).send();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(port, () => {
  console.log(`Node.js server running on port ${port}`);
});
