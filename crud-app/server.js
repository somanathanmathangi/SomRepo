const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const path = require('path');
const crypto = require('crypto');

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

app.use(express.static(path.join(__dirname, 'public')));

const dbUrl = process.env.DATABASE_URL || '';
const needsSSL = dbUrl.includes('render.com') && !dbUrl.includes('.internal');

const pool = new Pool({
  connectionString: dbUrl,
  ssl: needsSSL ? { rejectUnauthorized: false } : false
});

// Helper to map Postgres lowercase columns to frontend camelCase expectations
function mapTrip(row) {
  if (!row) return null;
  return {
    id: row.id,
    invoiceDate: row.invoicedate || row.invoiceDate,
    invoiceNo: row.invoiceno || row.invoiceNo,
    travellingPerson: row.travellingperson || row.travellingPerson,
    travelDate: row.traveldate || row.travelDate,
    tripCode: row.tripcode || row.tripCode
  };
}

async function initDb() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS trips (
        id SERIAL PRIMARY KEY,
        invoicedate TEXT,
        invoiceno TEXT,
        travellingperson TEXT,
        traveldate TEXT,
        tripcode TEXT
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

app.get('/api/trips', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM trips ORDER BY id ASC');
    res.json(result.rows.map(mapTrip));
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
      WHERE invoiceno ILIKE $1 OR travellingperson ILIKE $1 OR tripcode ILIKE $1
    `;
    const param = `%${keyword}%`;
    const result = await pool.query(query, [param]);
    res.json(result.rows.map(mapTrip));
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
    res.json(mapTrip(result.rows[0]));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/trips', async (req, res) => {
  const { invoiceDate, invoiceNo, travellingPerson, travelDate } = req.body;
  const tripCode = generateTripCode();
  
  try {
    const insertQuery = `
      INSERT INTO trips (invoicedate, invoiceno, travellingperson, traveldate, tripcode)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `;
    const result = await pool.query(insertQuery, [invoiceDate, invoiceNo, travellingPerson, travelDate, tripCode]);
    res.json(mapTrip(result.rows[0]));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/trips/:id', async (req, res) => {
  const id = req.params.id;
  const { invoiceDate, invoiceNo, travellingPerson, travelDate } = req.body;
  
  const query = `
    UPDATE trips 
    SET invoicedate = $1, invoiceno = $2, travellingperson = $3, traveldate = $4
    WHERE id = $5
    RETURNING *
  `;
  
  try {
    const result = await pool.query(query, [invoiceDate, invoiceNo, travellingPerson, travelDate, id]);
    if (result.rowCount === 0) {
      res.status(404).send('Trip not found');
      return;
    }
    res.json(mapTrip(result.rows[0]));
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
