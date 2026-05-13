const express = require('express');
const cors = require('cors');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const { Pool } = require('pg');
const path = require('path');
const graphService = require('./src/graphService');
const multer = require('multer');
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

const app = express();
const port = process.env.PORT || 3000;

app.set('trust proxy', 1);

app.use(
  cors({
    origin: true,
    credentials: true
  })
);
app.use(express.json());

app.use(
  session({
    secret: process.env.SESSION_SECRET || 'trips-manager-dev-session-secret',
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000
    }
  })
);

const dbUrl = process.env.DATABASE_URL || '';
const needsSSL = dbUrl.includes('render.com') && !dbUrl.includes('.internal');

const pool = new Pool({
  connectionString: dbUrl,
  ssl: needsSSL ? { rejectUnauthorized: false } : false
});

function tsToIso(v) {
  if (v == null) return null;
  const d = v instanceof Date ? v : new Date(v);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

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
    travelEndDate: row.travel_end_date,
    createdBy: row.created_by,
    createdDate: tsToIso(row.created_date),
    updatedBy: row.updated_by,
    updatedDate: tsToIso(row.updated_date),
    deletedBy: row.deleted_by,
    deletedDate: tsToIso(row.deleted_date),
    filePath: row.file_path
  };
}

function requireAuth(req, res, next) {
  if (!req.session || !req.session.username) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  next();
}

async function ensureTripAuditColumns() {
  const { rows } = await pool.query(`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'trips'
    ) AS exists
  `);
  if (!rows[0] || !rows[0].exists) return;

  const addIfMissing = async (colName, sqlType) => {
    const c = await pool.query(
      `
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'trips' AND column_name = $1
    `,
      [colName]
    );
    if (c.rows.length === 0) {
      await pool.query(`ALTER TABLE trips ADD COLUMN ${colName} ${sqlType}`);
    }
  };

  await addIfMissing('created_by', 'TEXT');
  await addIfMissing('created_date', 'TIMESTAMPTZ');
  await addIfMissing('updated_by', 'TEXT');
  await addIfMissing('updated_date', 'TIMESTAMPTZ');
  await addIfMissing('deleted_by', 'TEXT');
  await addIfMissing('deleted_date', 'TIMESTAMPTZ');
}

async function ensureAdminUsers() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS admin_users (
      username TEXT PRIMARY KEY,
      password_hash TEXT NOT NULL
    )
  `);

  const seeds = [
    ['admin', 'admin'],
    ['admin1', 'admin1']
  ];
  for (const [username, plain] of seeds) {
    const { rows } = await pool.query(
      'SELECT 1 FROM admin_users WHERE username = $1',
      [username]
    );
    if (rows.length > 0) continue;
    const passwordHash = await bcrypt.hash(plain, 10);
    await pool.query(
      'INSERT INTO admin_users (username, password_hash) VALUES ($1, $2)',
      [username, passwordHash]
    );
    console.log(`PostgreSQL: seeded admin user "${username}".`);
  }
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
        travel_end_date TEXT NOT NULL,
        created_by TEXT,
        created_date TIMESTAMPTZ,
        updated_by TEXT,
        updated_date TIMESTAMPTZ,
        deleted_by TEXT,
        deleted_date TIMESTAMPTZ,
        file_path TEXT
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

app.post('/api/auth/login', async (req, res) => {
  const username = (req.body.username || '').trim();
  const password = req.body.password || '';
  if (!username || !password) {
    res.status(400).json({ error: 'Username and password are required.' });
    return;
  }
  try {
    const result = await pool.query(
      'SELECT password_hash FROM admin_users WHERE username = $1',
      [username]
    );
    if (result.rows.length === 0) {
      res.status(401).json({ error: 'Invalid username or password.' });
      return;
    }
    const ok = await bcrypt.compare(password, result.rows[0].password_hash);
    if (!ok) {
      res.status(401).json({ error: 'Invalid username or password.' });
      return;
    }
    req.session.username = username;
    res.json({ username });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/auth/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    res.json({ ok: true });
  });
});

app.get('/api/auth/me', (req, res) => {
  if (!req.session || !req.session.username) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  res.json({ username: req.session.username });
});

app.get('/api/trips', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM trips WHERE deleted_date IS NULL ORDER BY yantriki_invoice_number ASC'
    );
    res.json(result.rows.map(mapTrip));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/trips/search', requireAuth, async (req, res) => {
  const keyword = req.query.keyword;
  if (!keyword) {
    res.json([]);
    return;
  }
  try {
    const query = `
      SELECT * FROM trips
      WHERE deleted_date IS NULL
        AND (
          yantriki_invoice_number ILIKE $1
          OR customer_name ILIKE $1
          OR customer_location ILIKE $1
          OR po_order ILIKE $1
          OR traveller_name ILIKE $1
          OR travel_route ILIKE $1
          OR wo_number ILIKE $1
        )
    `;
    const param = `%${keyword}%`;
    const result = await pool.query(query, [param]);
    res.json(result.rows.map(mapTrip));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/trips', requireAuth, async (req, res) => {
  const b = req.body;
  const user = req.session.username;
  const insertQuery = `
    INSERT INTO trips (
      yantriki_invoice_number, customer_name, customer_location,
      po_order, po_date, traveller_name, travel_route,
      wo_number, wo_date, travel_start_date, travel_end_date,
      created_by, created_date
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW())
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
    b.travelEndDate,
    user
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

app.put('/api/trips/:invoice', requireAuth, async (req, res) => {
  const originalInvoice = decodeURIComponent(req.params.invoice);
  const b = req.body;
  const user = req.session.username;
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
      travel_end_date = $10,
      updated_by = $11,
      updated_date = NOW()
    WHERE yantriki_invoice_number = $12 AND deleted_date IS NULL
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
    user,
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

app.delete('/api/trips/:invoice', requireAuth, async (req, res) => {
  const invoice = decodeURIComponent(req.params.invoice);
  const user = req.session.username;
  try {
    const result = await pool.query(
      `
      UPDATE trips
      SET deleted_by = $1, deleted_date = NOW()
      WHERE yantriki_invoice_number = $2 AND deleted_date IS NULL
      RETURNING *
    `,
      [user, invoice]
    );
    if (result.rowCount === 0) {
      res.status(404).json({ error: 'Trip not found or already deleted.' });
      return;
    }
    res.status(200).json(mapTrip(result.rows[0]));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Upload endpoint for attaching a file to a trip (uploads to SharePoint)
app.post('/api/trips/:invoice/upload', requireAuth, upload.single('file'), async (req, res) => {
  const invoice = decodeURIComponent(req.params.invoice);
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  const siteId = process.env.SHAREPOINT_SITE_ID;
  const driveId = process.env.SHAREPOINT_DRIVE_ID;

  if (!siteId || !driveId) {
    return res.status(500).json({ error: 'SharePoint Site ID or Drive ID is not configured.' });
  }

  try {
    // Upload to SharePoint
    const uploadResponse = await graphService.uploadToSharePoint(
      `${invoice}_${req.file.originalname}`,
      req.file.buffer,
      siteId,
      driveId
    );

    const sharePointUrl = uploadResponse.webUrl;

    // Update database with SharePoint link
    const result = await pool.query(
      `UPDATE trips SET file_path = $1 WHERE yantriki_invoice_number = $2 AND deleted_date IS NULL RETURNING *`,
      [sharePointUrl, invoice]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Trip not found' });
    }

    res.json({ 
      message: 'File uploaded to SharePoint', 
      sharePointUrl: sharePointUrl, 
      trip: mapTrip(result.rows[0]) 
    });
  } catch (err) {
    console.error('Upload error:', err);
    res.status(500).json({ error: 'Failed to upload to SharePoint: ' + err.message });
  }
});

async function start() {
  await initDb();
  await ensureTripAuditColumns();
  await ensureAdminUsers();
  app.listen(port, () => {
    console.log(`Node.js server running on port ${port}`);
  });
}

start().catch((err) => {
  console.error('Server failed to start', err);
  process.exit(1);
});
