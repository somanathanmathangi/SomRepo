const express = require('express');
const cors = require('cors');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const { Pool } = require('pg');
const path = require('path');
const multer = require('multer');
const nodemailer = require('nodemailer');

const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req, file, cb) => {
    // Only allow PDF files
    if (file.mimetype !== 'application/pdf') {
      return cb(new Error('Only PDF files are allowed'));
    }
    cb(null, true);
  }
});

const app = express();
const port = process.env.PORT || 3000;

app.set('trust proxy', 1);

app.use(
  cors({
    origin: true,
    credentials: true
  })
);
app.use(express.json({ limit: '10mb' }));
app.use(express.raw({ limit: '10mb', type: 'application/octet-stream' }));

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
    fileName: row.file_name,
    fileType: row.file_type,
    status: row.status || 'pending',
    approvedBy: row.approved_by,
    approvedDate: tsToIso(row.approved_date),
    rejectionReason: row.rejection_reason
  };
}

function requireAuth(req, res, next) {
  if (!req.session || !req.session.username) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  next();
}

function requireApprover(req, res, next) {
  if (!req.session || !req.session.username) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  if (req.session.userRole !== 'approver' && req.session.userRole !== 'admin') {
    res.status(403).json({ error: 'Approver access required' });
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

  const addIfMissing = async (colName, sqlType, defaultValue) => {
    const c = await pool.query(
      `
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'trips' AND column_name = $1
    `,
      [colName]
    );
    if (c.rows.length === 0) {
      const defaultClause = defaultValue ? ` DEFAULT ${defaultValue}` : '';
      await pool.query(`ALTER TABLE trips ADD COLUMN ${colName} ${sqlType}${defaultClause}`);
    }
  };

  await addIfMissing('created_by', 'TEXT');
  await addIfMissing('created_date', 'TIMESTAMPTZ');
  await addIfMissing('updated_by', 'TEXT');
  await addIfMissing('updated_date', 'TIMESTAMPTZ');
  await addIfMissing('deleted_by', 'TEXT');
  await addIfMissing('deleted_date', 'TIMESTAMPTZ');
  await addIfMissing('file_name', 'TEXT');
  await addIfMissing('file_type', 'TEXT');
  await addIfMissing('file_content', 'BYTEA');
  await addIfMissing('status', 'TEXT', "'pending'");
  await addIfMissing('approved_by', 'TEXT');
  await addIfMissing('approved_date', 'TIMESTAMPTZ');
  await addIfMissing('rejection_reason', 'TEXT');
}

async function ensureAdminUsers() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS admin_users (
      username TEXT PRIMARY KEY,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'admin'
    )
  `);

  // Add role column if it doesn't exist (for existing tables)
  const { rows: colCheck } = await pool.query(`
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'admin_users' AND column_name = 'role'
  `);
  if (colCheck.length === 0) {
    await pool.query('ALTER TABLE admin_users ADD COLUMN role TEXT NOT NULL DEFAULT \'admin\'');
    console.log('PostgreSQL: added role column to admin_users table.');
  }

  // Seed admin users
  const adminSeeds = [
    ['admin', 'admin', 'admin'],
    ['admin1', 'admin1', 'admin']
  ];
  for (const [username, plain, role] of adminSeeds) {
    const { rows } = await pool.query(
      'SELECT 1 FROM admin_users WHERE username = $1',
      [username]
    );
    if (rows.length > 0) continue;
    const passwordHash = await bcrypt.hash(plain, 10);
    await pool.query(
      'INSERT INTO admin_users (username, password_hash, role) VALUES ($1, $2, $3)',
      [username, passwordHash, role]
    );
    console.log(`PostgreSQL: seeded admin user "${username}".`);
  }

  // Seed approver user (configurable)
  const approverUsername = process.env.APPROVER_USERNAME || 'approver';
  const approverPassword = process.env.APPROVER_PASSWORD || 'approver';
  const { rows: approverExists } = await pool.query(
    'SELECT 1 FROM admin_users WHERE username = $1',
    [approverUsername]
  );
  if (approverExists.length === 0) {
    const passwordHash = await bcrypt.hash(approverPassword, 10);
    await pool.query(
      'INSERT INTO admin_users (username, password_hash, role) VALUES ($1, $2, $3)',
      [approverUsername, passwordHash, 'approver']
    );
    console.log(`PostgreSQL: seeded approver user "${approverUsername}".`);
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
        file_name TEXT,
        file_type TEXT,
        file_content BYTEA,
        status TEXT DEFAULT 'pending',
        approved_by TEXT,
        approved_date TIMESTAMPTZ,
        rejection_reason TEXT
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

// Email transporter setup
let emailTransporter = null;

function getEmailConfig() {
  return {
    host: process.env.EMAIL_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.EMAIL_PORT || '587'),
    secure: process.env.EMAIL_SECURE === 'true',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS
    }
  };
}

function getEmailTransporter() {
  if (!emailTransporter) {
    const config = getEmailConfig();
    if (config.auth && config.auth.user && config.auth.pass) {
      emailTransporter = nodemailer.createTransport(config);
    }
  }
  return emailTransporter;
}

async function sendTripEmail(trip) {
  const transporter = getEmailTransporter();
  if (!transporter) {
    console.log('Email not configured, skipping notification');
    return;
  }

  const emailTo = process.env.EMAIL_TO || 'somanathan_c@yahoo.com';
  const subject = `New Trip Created - ${trip.yantrikiInvoiceNumber}`;

  const html = `
    <h2>New Trip Record Created</h2>
    <p>A new trip record has been created and is pending approval.</p>
    <h3>Trip Details:</h3>
    <table style="border-collapse: collapse; width: 100%;">
      <tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>Yantriki Invoice Number</strong></td><td style="padding: 8px; border: 1px solid #ddd;">${trip.yantrikiInvoiceNumber}</td></tr>
      <tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>Customer Name</strong></td><td style="padding: 8px; border: 1px solid #ddd;">${trip.customerName}</td></tr>
      <tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>Customer Location</strong></td><td style="padding: 8px; border: 1px solid #ddd;">${trip.customerLocation}</td></tr>
      <tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>PO Order</strong></td><td style="padding: 8px; border: 1px solid #ddd;">${trip.poOrder}</td></tr>
      <tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>PO Date</strong></td><td style="padding: 8px; border: 1px solid #ddd;">${trip.poDate}</td></tr>
      <tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>Traveller Name</strong></td><td style="padding: 8px; border: 1px solid #ddd;">${trip.travellerName}</td></tr>
      <tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>Travel Route</strong></td><td style="padding: 8px; border: 1px solid #ddd;">${trip.travelRoute}</td></tr>
      <tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>WO Number</strong></td><td style="padding: 8px; border: 1px solid #ddd;">${trip.woNumber}</td></tr>
      <tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>WO Date</strong></td><td style="padding: 8px; border: 1px solid #ddd;">${trip.woDate}</td></tr>
      <tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>Travel Start Date</strong></td><td style="padding: 8px; border: 1px solid #ddd;">${trip.travelStartDate}</td></tr>
      <tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>Travel End Date</strong></td><td style="padding: 8px; border: 1px solid #ddd;">${trip.travelEndDate}</td></tr>
      <tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>Created By</strong></td><td style="padding: 8px; border: 1px solid #ddd;">${trip.createdBy}</td></tr>
    </table>
    <p style="margin-top: 20px;">
      <a href="${process.env.APP_URL || 'http://localhost:3000'}/approver.html" style="background-color: #4CAF50; color: white; padding: 10px 20px; text-decoration: none; border-radius: 4px;">Approve/Reject Trip</a>
    </p>
    <p style="color: #666; font-size: 12px;">This is an automated email from Trip Manager System.</p>
  `;

  try {
    await transporter.sendMail({
      from: process.env.EMAIL_FROM || 'Trip Manager <noreply@tripmanager.com>',
      to: emailTo,
      subject: subject,
      html: html
    });
    console.log(`Email sent to ${emailTo} for trip ${trip.yantrikiInvoiceNumber}`);
  } catch (err) {
    console.error('Error sending email:', err.message);
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
      'SELECT password_hash, role FROM admin_users WHERE username = $1',
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
    req.session.userRole = result.rows[0].role;
    res.json({ username, role: result.rows[0].role });
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
  res.json({ username: req.session.username, role: req.session.userRole });
});

app.get('/api/trips', requireAuth, async (req, res) => {
  try {
    let query;
    let values;

    // Approvers can see all trips, regular users see all non-deleted trips
    if (req.session.userRole === 'approver') {
      query = 'SELECT * FROM trips WHERE deleted_date IS NULL ORDER BY yantriki_invoice_number ASC';
      values = [];
    } else {
      query = 'SELECT * FROM trips WHERE deleted_date IS NULL ORDER BY yantriki_invoice_number ASC';
      values = [];
    }

    const result = await pool.query(query, values);
    res.json(result.rows.map(mapTrip));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get pending trips for approvers
app.get('/api/trips/pending', requireApprover, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM trips WHERE deleted_date IS NULL AND status = $1 ORDER BY created_date DESC',
      ['pending']
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

app.post('/api/trips', requireAuth, upload.single('file'), async (req, res) => {
  const b = req.body;
  const user = req.session.username;

  let fileName = null;
  let fileType = null;
  let fileContent = null;

  if (req.file) {
    fileName = req.file.originalname;
    fileType = req.file.mimetype;
    fileContent = req.file.buffer;
  }

  const insertQuery = `
    INSERT INTO trips (
      yantriki_invoice_number, customer_name, customer_location,
      po_order, po_date, traveller_name, travel_route,
      wo_number, wo_date, travel_start_date, travel_end_date,
      created_by, created_date, file_name, file_type, file_content, status
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW(), $13, $14, $15, 'pending')
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
    user,
    fileName,
    fileType,
    fileContent
  ];
  try {
    const result = await pool.query(insertQuery, values);
    const trip = mapTrip(result.rows[0]);

    // Send email notification
    await sendTripEmail(trip);

    res.json(trip);
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
      updated_date = NOW(),
      status = 'pending'
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
    const trip = mapTrip(result.rows[0]);

    // Send email notification for updates
    await sendTripEmail(trip);

    res.json(trip);
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

// Upload/Update file for a trip (stores in database)
app.post('/api/trips/:invoice/upload', requireAuth, upload.single('file'), async (req, res) => {
  const invoice = decodeURIComponent(req.params.invoice);
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  try {
    const result = await pool.query(
      `UPDATE trips SET file_name = $1, file_type = $2, file_content = $3 WHERE yantriki_invoice_number = $4 AND deleted_date IS NULL RETURNING *`,
      [req.file.originalname, req.file.mimetype, req.file.buffer, invoice]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Trip not found' });
    }

    res.json({
      message: 'File uploaded successfully',
      fileName: req.file.originalname,
      trip: mapTrip(result.rows[0])
    });
  } catch (err) {
    console.error('Upload error:', err);
    res.status(500).json({ error: 'Failed to upload file: ' + err.message });
  }
});

// Download file from database
app.get('/api/trips/:invoice/file', requireAuth, async (req, res) => {
  const invoice = decodeURIComponent(req.params.invoice);

  try {
    const result = await pool.query(
      'SELECT file_name, file_type, file_content FROM trips WHERE yantriki_invoice_number = $1 AND deleted_date IS NULL',
      [invoice]
    );

    if (result.rows.length === 0 || !result.rows[0].file_content) {
      return res.status(404).json({ error: 'File not found' });
    }

    const row = result.rows[0];
    res.set('Content-Type', row.file_type);
    res.set('Content-Disposition', `attachment; filename="${row.file_name}"`);
    res.send(row.file_content);
  } catch (err) {
    console.error('Download error:', err);
    res.status(500).json({ error: 'Failed to download file: ' + err.message });
  }
});

// Approve a trip
app.post('/api/trips/:invoice/approve', requireApprover, async (req, res) => {
  const invoice = decodeURIComponent(req.params.invoice);
  const user = req.session.username;

  try {
    const result = await pool.query(
      `UPDATE trips SET status = 'approved', approved_by = $1, approved_date = NOW() 
       WHERE yantriki_invoice_number = $2 AND deleted_date IS NULL AND status = 'pending'
       RETURNING *`,
      [user, invoice]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Trip not found or not in pending status' });
    }

    res.json({ message: 'Trip approved successfully', trip: mapTrip(result.rows[0]) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Reject a trip
app.post('/api/trips/:invoice/reject', requireApprover, async (req, res) => {
  const invoice = decodeURIComponent(req.params.invoice);
  const user = req.session.username;
  const { reason } = req.body;

  try {
    const result = await pool.query(
      `UPDATE trips SET status = 'rejected', approved_by = $1, approved_date = NOW(), rejection_reason = $2
       WHERE yantriki_invoice_number = $3 AND deleted_date IS NULL AND status = 'pending'
       RETURNING *`,
      [user, reason || 'No reason provided', invoice]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Trip not found or not in pending status' });
    }

    res.json({ message: 'Trip rejected', trip: mapTrip(result.rows[0]) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Serve static files from 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

// Catch-all route: serve index.html for non-API requests
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
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