const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const path = require('path');

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

function mapTrip(row) {
  if (!row) return null;
  return {
    yantrikiInvoiceNumber: row.yantriki_invoice_number,
    customerName: row.customer_name,
    customerLocation: row.customer_location,
    poOrder: row.po_order,
    poDate: row.po_date,
    travellerName: row.traveller_name,
    travelRoute: row.travel_route,
    woNumber: row.wo_number,
    woDate: row.wo_date,
    travelStartDate: row.travel_start_date,
    travelEndDate: row.travel_end_date
  };
}

async function initDb() {
  const createSql = `
    CREATE TABLE trips (
      yantriki_invoice_number TEXT PRIMARY KEY,
      customer_name TEXT NOT NULL,
      customer_location TEXT NOT NULL,
      po_order TEXT NOT NULL,
      po_date TEXT NOT NULL,
      traveller_name TEXT NOT NULL,
      travel_route TEXT NOT NULL,
      wo_number TEXT NOT NULL,
      wo_date TEXT NOT NULL,
      travel_start_date TEXT NOT NULL,
      travel_end_date TEXT NOT NULL
    )
  `;
  try {
    const { rows: existsRows } = await pool.query(`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'trips'
      ) AS exists
    `);
    const tableExists = Boolean(existsRows[0] && existsRows[0].exists);

    if (!tableExists) {
      await pool.query(createSql);
      console.log('PostgreSQL: trips table did not exist; created with new schema.');
      return;
    }

    const { rows: cols } = await pool.query(`
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'trips'
        AND column_name = 'yantriki_invoice_number'
    `);
    if (cols.length > 0) {
      console.log('PostgreSQL: trips table already on new schema.');
      return;
    }

    await pool.query('DROP TABLE IF EXISTS trips CASCADE');
    await pool.query(createSql);
    console.log('PostgreSQL: dropped legacy trips table and created new schema.');
  } catch (err) {
    console.error('Error initializing database', err.stack);
  }
}
initDb();

app.get('/api/trips', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM trips ORDER BY yantriki_invoice_number ASC'
    );
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
      WHERE yantriki_invoice_number ILIKE $1
         OR customer_name ILIKE $1
         OR customer_location ILIKE $1
         OR po_order ILIKE $1
         OR traveller_name ILIKE $1
         OR travel_route ILIKE $1
         OR wo_number ILIKE $1
    `;
    const param = `%${keyword}%`;
    const result = await pool.query(query, [param]);
    res.json(result.rows.map(mapTrip));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/trips', async (req, res) => {
  const b = req.body;
  const insertQuery = `
    INSERT INTO trips (
      yantriki_invoice_number, customer_name, customer_location,
      po_order, po_date, traveller_name, travel_route,
      wo_number, wo_date, travel_start_date, travel_end_date
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    RETURNING *
  `;
  const values = [
    b.yantrikiInvoiceNumber,
    b.customerName,
    b.customerLocation,
    b.poOrder,
    b.poDate,
    b.travellerName,
    b.travelRoute,
    b.woNumber,
    b.woDate,
    b.travelStartDate,
    b.travelEndDate
  ];
  try {
    const result = await pool.query(insertQuery, values);
    res.json(mapTrip(result.rows[0]));
  } catch (err) {
    if (err.code === '23505') {
      res.status(409).json({
        error: 'A record with this Yantriki Invoice Number already exists.'
      });
      return;
    }
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/trips/:invoice', async (req, res) => {
  const originalInvoice = decodeURIComponent(req.params.invoice);
  const b = req.body;
  if (b.yantrikiInvoiceNumber !== originalInvoice) {
    res.status(400).json({
      error: 'Yantriki Invoice Number cannot be changed. Delete and create a new record if needed.'
    });
    return;
  }
  const query = `
    UPDATE trips SET
      customer_name = $1,
      customer_location = $2,
      po_order = $3,
      po_date = $4,
      traveller_name = $5,
      travel_route = $6,
      wo_number = $7,
      wo_date = $8,
      travel_start_date = $9,
      travel_end_date = $10
    WHERE yantriki_invoice_number = $11
    RETURNING *
  `;
  const values = [
    b.customerName,
    b.customerLocation,
    b.poOrder,
    b.poDate,
    b.travellerName,
    b.travelRoute,
    b.woNumber,
    b.woDate,
    b.travelStartDate,
    b.travelEndDate,
    originalInvoice
  ];
  try {
    const result = await pool.query(query, values);
    if (result.rowCount === 0) {
      res.status(404).json({ error: 'Trip not found' });
      return;
    }
    res.json(mapTrip(result.rows[0]));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/trips/:invoice', async (req, res) => {
  const invoice = decodeURIComponent(req.params.invoice);
  try {
    const result = await pool.query(
      'DELETE FROM trips WHERE yantriki_invoice_number = $1',
      [invoice]
    );
    if (result.rowCount === 0) {
      res.status(404).json({ error: 'Trip not found' });
      return;
    }
    res.status(204).send();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(port, () => {
  console.log(`Node.js server running on port ${port}`);
});
