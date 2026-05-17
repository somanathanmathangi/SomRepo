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
    status: row.status || 'pending',
    approvedBy: row.approved_by,
    approvedDate: tsToIso(row.approved_date),
    rejectionReason: row.rejection_reason,
    woStartDate: row.wo_start_date,
    woEndDate: row.wo_end_date,
    docCount: parseInt(row.doc_count) || 0
  };
}

function mapDoc(row) {
  if (!row) return null;
  return {
    id: row.id,
    tripInvoiceNumber: row.trip_invoice_number,
    docDate: row.doc_date,
    description: row.description,
    billId: row.bill_id,
    category: row.category,
    billAmount: parseFloat(row.bill_amount) || 0,
    pageNo: row.page_no,
    fileName: row.file_name,
    fileType: row.file_type,
    createdBy: row.created_by,
    createdDate: tsToIso(row.created_date)
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

async function ensureSupportingDocsTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS supporting_docs (
      id SERIAL PRIMARY KEY,
      trip_invoice_number TEXT NOT NULL REFERENCES trips(yantriki_invoice_number),
      doc_date TEXT NOT NULL,
      description TEXT NOT NULL,
      bill_id TEXT NOT NULL,
      category TEXT NOT NULL,
      bill_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
      page_no INTEGER NOT NULL,
      file_name TEXT,
      file_type TEXT,
      file_content BYTEA,
      created_by TEXT,
      created_date TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  console.log('PostgreSQL: supporting_docs table ensured.');
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
      `SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'trips' AND column_name = $1`,
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
  await addIfMissing('status', 'TEXT', "'pending'");
  await addIfMissing('approved_by', 'TEXT');
  await addIfMissing('approved_date', 'TIMESTAMPTZ');
  await addIfMissing('rejection_reason', 'TEXT');
  await addIfMissing('wo_start_date', 'TEXT');
  await addIfMissing('wo_end_date', 'TEXT');
}

async function ensureAdminUsers() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS admin_users (
      username TEXT PRIMARY KEY,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'admin'
    )
  `);



  const adminSeeds = [
    ['admin', 'admin', 'admin'],
    ['admin1', 'admin1', 'admin']
  ];
  for (const [username, plain, role] of adminSeeds) {
    const { rows } = await pool.query('SELECT 1 FROM admin_users WHERE username = $1', [username]);
    if (rows.length > 0) continue;
    const passwordHash = await bcrypt.hash(plain, 10);
    await pool.query('INSERT INTO admin_users (username, password_hash, role) VALUES ($1, $2, $3)', [username, passwordHash, role]);
    console.log(`PostgreSQL: seeded admin user "${username}".`);
  }

  const approverUsername = process.env.APPROVER_USERNAME || 'approver';
  const approverPassword = process.env.APPROVER_PASSWORD || 'approver';
  const { rows: approverExists } = await pool.query('SELECT 1 FROM admin_users WHERE username = $1', [approverUsername]);
  if (approverExists.length === 0) {
    const passwordHash = await bcrypt.hash(approverPassword, 10);
    await pool.query('INSERT INTO admin_users (username, password_hash, role) VALUES ($1, $2, $3)', [approverUsername, passwordHash, 'approver']);
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
      status TEXT DEFAULT 'pending',
      approved_by TEXT,
      approved_date TIMESTAMPTZ,
      rejection_reason TEXT,
      wo_start_date TEXT,
      wo_end_date TEXT
    )
  `;
  try {
    const { rows: existsRows } = await pool.query(`
      SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'trips') AS exists
    `);
    const tableExists = Boolean(existsRows[0] && existsRows[0].exists);

    if (!tableExists) {
      await pool.query(createSql);
      console.log('PostgreSQL: trips table did not exist; created with new schema.');
      return;
    }

    const { rows: cols } = await pool.query(`
      SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'trips' AND column_name = 'yantriki_invoice_number'
    `);
    if (cols.length > 0) {
      console.log('PostgreSQL: trips table already on new schema.');
      return;
    }

    await pool.query('DROP TABLE IF EXISTS supporting_docs CASCADE');
    await pool.query('DROP TABLE IF EXISTS trips CASCADE');
    await pool.query(createSql);
    console.log('PostgreSQL: dropped legacy tables and created new schema.');
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
  const emailTo = process.env.EMAIL_TO || 'somanathan_c@yahoo.com';
  const subject = `Trip ${trip.yantrikiInvoiceNumber} - ${trip.status === 'pending' ? 'Created' : 'Updated'} & Pending Approval`;

  const html = `
    <h2>Trip Record ${trip.status === 'pending' ? 'Created' : 'Updated'}</h2>
    <p>A trip record has been ${trip.status === 'pending' ? 'created' : 'updated'} and is pending approval.</p>
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

  if (transporter) {
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
  } else {
    console.log('=== EMAIL NOTIFICATION (SMTP not configured) ===');
    console.log(`To: ${emailTo}`);
    console.log(`Subject: ${subject}`);
    console.log('===============================================');
  }
}

// ==================== AUTH ENDPOINTS ====================

app.post('/api/auth/login', async (req, res) => {
  const username = (req.body.username || '').trim();
  const password = req.body.password || '';
  if (!username || !password) {
    res.status(400).json({ error: 'Username and password are required.' });
    return;
  }
  try {
    // Query username case-insensitively to prevent any casing discrepancies
    const result = await pool.query('SELECT username, password_hash, role FROM admin_users WHERE LOWER(username) = LOWER($1)', [username]);
    if (result.rows.length === 0) {
      res.status(401).json({ error: 'Invalid username or password.' });
      return;
    }
    
    const dbUser = result.rows[0];
    const storedPass = dbUser.password_hash || '';
    
    // Check if the stored password in the database is a valid bcrypt hash
    const isHashed = (storedPass.startsWith('$2a$') || storedPass.startsWith('$2b$') || storedPass.startsWith('$2y$')) && storedPass.length === 60;
    
    let ok = false;
    if (isHashed) {
      ok = await bcrypt.compare(password, storedPass);
    } else {
      // Fallback for plain text password checks
      ok = (password === storedPass);
      if (ok) {
        // Automatically hash and secure the plain text password in the database on-the-fly!
        try {
          const hashed = await bcrypt.hash(password, 10);
          await pool.query('UPDATE admin_users SET password_hash = $1 WHERE username = $2', [hashed, dbUser.username]);
          console.log(`PostgreSQL: Automatically hashed and secured plain text password for user "${dbUser.username}" on successful login.`);
        } catch (hashErr) {
          console.error('PostgreSQL: Failed to auto-hash plain text password:', hashErr.message);
        }
      }
    }

    if (!ok) {
      res.status(401).json({ error: 'Invalid username or password.' });
      return;
    }

    req.session.username = dbUser.username; // Use proper cased username from the DB
    req.session.userRole = dbUser.role;
    res.json({ username: dbUser.username, role: dbUser.role });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/auth/logout', (req, res) => {
  req.session.destroy((err) => { if (err) { res.status(500).json({ error: err.message }); return; } res.json({ ok: true }); });
});

app.get('/api/auth/me', (req, res) => {
  if (!req.session || !req.session.username) { res.status(401).json({ error: 'Unauthorized' }); return; }
  res.json({ username: req.session.username, role: req.session.userRole });
});

// ==================== TRIP ENDPOINTS ====================

app.get('/api/trips', requireAuth, async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const offset = (page - 1) * limit;
  const sortBy = req.query.sortBy || 'yantriki_invoice_number';
  const sortOrder = req.query.sortOrder || 'ASC';

  const allowedSortCols = [
    'yantriki_invoice_number', 'customer_name', 'customer_location', 'po_order', 'po_date',
    'traveller_name', 'travel_route', 'wo_number', 'wo_date', 'travel_start_date', 'travel_end_date',
    'created_by', 'created_date', 'updated_by', 'updated_date', 'status', 'wo_start_date', 'wo_end_date'
  ];
  const finalSortCol = allowedSortCols.includes(sortBy) ? sortBy : 'yantriki_invoice_number';
  const finalSortOrder = sortOrder.toUpperCase() === 'DESC' ? 'DESC' : 'ASC';

  try {
    const countRes = await pool.query('SELECT COUNT(*) FROM trips WHERE deleted_date IS NULL');
    const totalCount = parseInt(countRes.rows[0].count);

    const query = `
      SELECT t.*, (SELECT COUNT(*) FROM supporting_docs sd WHERE sd.trip_invoice_number = t.yantriki_invoice_number) as doc_count
      FROM trips t
      WHERE t.deleted_date IS NULL
      ORDER BY ${finalSortCol} ${finalSortOrder}
      LIMIT $1 OFFSET $2
    `;
    const result = await pool.query(query, [limit, offset]);
    
    res.json({
      trips: result.rows.map(mapTrip),
      pagination: {
        total: totalCount,
        page,
        limit,
        pages: Math.ceil(totalCount / limit)
      }
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/trips/pending', requireApprover, async (req, res) => {
  try {
    const query = `
      SELECT t.*, (SELECT COUNT(*) FROM supporting_docs sd WHERE sd.trip_invoice_number = t.yantriki_invoice_number) as doc_count
      FROM trips t
      WHERE t.deleted_date IS NULL AND t.status = $1
      ORDER BY t.created_date DESC
    `;
    const result = await pool.query(query, ['pending']);
    res.json(result.rows.map(mapTrip));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/trips/:invoice', requireAuth, async (req, res) => {
  try {
    const invoice = decodeURIComponent(req.params.invoice);
    const result = await pool.query('SELECT * FROM trips WHERE yantriki_invoice_number = $1 AND deleted_date IS NULL', [invoice]);
    if (result.rows.length === 0) { res.status(404).json({ error: 'Trip not found' }); return; }
    res.json(mapTrip(result.rows[0]));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/trips/search', requireAuth, async (req, res) => {
  const keyword = req.query.keyword;
  if (!keyword) { res.json([]); return; }
  try {
    const query = `
      SELECT t.*, (SELECT COUNT(*) FROM supporting_docs sd WHERE sd.trip_invoice_number = t.yantriki_invoice_number) as doc_count
      FROM trips t
      WHERE t.deleted_date IS NULL AND (
        t.yantriki_invoice_number ILIKE $1 OR t.customer_name ILIKE $1 OR t.customer_location ILIKE $1 OR 
        t.po_order ILIKE $1 OR t.traveller_name ILIKE $1 OR t.travel_route ILIKE $1 OR t.wo_number ILIKE $1
      )
    `;
    const param = `%${keyword}%`;
    const result = await pool.query(query, [param]);
    res.json(result.rows.map(mapTrip));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/trips', requireAuth, async (req, res) => {
  const b = req.body;
  const user = req.session.username;
  const insertQuery = `INSERT INTO trips (yantriki_invoice_number, customer_name, customer_location, po_order, po_date, traveller_name, travel_route, wo_number, wo_date, travel_start_date, travel_end_date, created_by, created_date, status, wo_start_date, wo_end_date) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW(), 'pending', $13, $14) RETURNING *`;
  const values = [b.yantrikiInvoiceNumber, b.customerName, b.customerLocation, b.poOrder, b.poDate, b.travellerName, b.travelRoute, b.woNumber, b.woDate, b.travelStartDate, b.travelEndDate, user, b.woStartDate, b.woEndDate];
  try {
    const result = await pool.query(insertQuery, values);
    const trip = mapTrip(result.rows[0]);
    await sendTripEmail(trip);
    res.json(trip);
  } catch (err) {
    if (err.code === '23505') { res.status(409).json({ error: 'A record with this Yantriki Invoice Number already exists.' }); return; }
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/trips/:invoice', requireAuth, async (req, res) => {
  const originalInvoice = decodeURIComponent(req.params.invoice);
  const b = req.body; const user = req.session.username;
  if (b.yantrikiInvoiceNumber !== originalInvoice) { res.status(400).json({ error: 'Yantriki Invoice Number cannot be changed.' }); return; }
  const query = `UPDATE trips SET customer_name=$1, customer_location=$2, po_order=$3, po_date=$4, traveller_name=$5, travel_route=$6, wo_number=$7, wo_date=$8, travel_start_date=$9, travel_end_date=$10, updated_by=$11, updated_date=NOW(), status='pending', wo_start_date=$12, wo_end_date=$13 WHERE yantriki_invoice_number=$14 AND deleted_date IS NULL RETURNING *`;
  const values = [b.customerName, b.customerLocation, b.poOrder, b.poDate, b.travellerName, b.travelRoute, b.woNumber, b.woDate, b.travelStartDate, b.travelEndDate, user, b.woStartDate, b.woEndDate, originalInvoice];
  try {
    const result = await pool.query(query, values);
    if (result.rowCount === 0) { res.status(404).json({ error: 'Trip not found' }); return; }
    const trip = mapTrip(result.rows[0]);
    await sendTripEmail(trip);
    res.json(trip);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/trips/:invoice', requireAuth, async (req, res) => {
  const invoice = decodeURIComponent(req.params.invoice);
  const user = req.session.username;
  try {
    const result = await pool.query(`UPDATE trips SET deleted_by=$1, deleted_date=NOW() WHERE yantriki_invoice_number=$2 AND deleted_date IS NULL RETURNING *`, [user, invoice]);
    if (result.rowCount === 0) { res.status(404).json({ error: 'Trip not found or already deleted.' }); return; }
    res.status(200).json(mapTrip(result.rows[0]));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Approve a trip
app.post('/api/trips/:invoice/approve', requireApprover, async (req, res) => {
  const invoice = decodeURIComponent(req.params.invoice);
  const user = req.session.username;
  try {
    const result = await pool.query(`UPDATE trips SET status='approved', approved_by=$1, approved_date=NOW() WHERE yantriki_invoice_number=$2 AND deleted_date IS NULL AND status='pending' RETURNING *`, [user, invoice]);
    if (result.rowCount === 0) { return res.status(404).json({ error: 'Trip not found or not in pending status' }); }
    res.json({ message: 'Trip approved successfully', trip: mapTrip(result.rows[0]) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Reject a trip
app.post('/api/trips/:invoice/reject', requireApprover, async (req, res) => {
  const invoice = decodeURIComponent(req.params.invoice);
  const user = req.session.username; const { reason } = req.body;
  try {
    const result = await pool.query(`UPDATE trips SET status='rejected', approved_by=$1, approved_date=NOW(), rejection_reason=$2 WHERE yantriki_invoice_number=$3 AND deleted_date IS NULL AND status='pending' RETURNING *`, [user, reason || 'No reason provided', invoice]);
    if (result.rowCount === 0) { return res.status(404).json({ error: 'Trip not found or not in pending status' }); }
    res.json({ message: 'Trip rejected', trip: mapTrip(result.rows[0]) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ==================== SUPPORTING DOCS ENDPOINTS ====================

// Get all supporting docs for a trip
app.get('/api/trips/:invoice/documents', requireAuth, async (req, res) => {
  const invoice = decodeURIComponent(req.params.invoice);
  try {
    const result = await pool.query('SELECT * FROM supporting_docs WHERE trip_invoice_number = $1 ORDER BY page_no ASC', [invoice]);
    res.json(result.rows.map(mapDoc));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Get total claim amount for a trip
app.get('/api/trips/:invoice/documents/total', requireAuth, async (req, res) => {
  const invoice = decodeURIComponent(req.params.invoice);
  try {
    const result = await pool.query('SELECT COALESCE(SUM(bill_amount), 0) AS total FROM supporting_docs WHERE trip_invoice_number = $1', [invoice]);
    res.json({ total: parseFloat(result.rows[0].total) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Get max page number for a trip (for auto-generation)
app.get('/api/trips/:invoice/documents/maxpage', requireAuth, async (req, res) => {
  const invoice = decodeURIComponent(req.params.invoice);
  try {
    const result = await pool.query('SELECT COALESCE(MAX(page_no), 0) AS maxpage FROM supporting_docs WHERE trip_invoice_number = $1', [invoice]);
    res.json({ maxPage: parseInt(result.rows[0].maxpage) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Create a new supporting doc (with optional file)
app.post('/api/trips/:invoice/documents', requireAuth, upload.single('file'), async (req, res) => {
  const invoice = decodeURIComponent(req.params.invoice);
  const user = req.session.username;
  const b = req.body;

  let fileName = null, fileType = null, fileContent = null;
  if (req.file) { fileName = req.file.originalname; fileType = req.file.mimetype; fileContent = req.file.buffer; }

  try {
    // Check if trip is approved - if so, block modifications
    const tripCheck = await pool.query('SELECT status FROM trips WHERE yantriki_invoice_number = $1 AND deleted_date IS NULL', [invoice]);
    if (tripCheck.rows.length === 0) { return res.status(404).json({ error: 'Trip not found' }); }
    if (tripCheck.rows[0].status === 'approved') { return res.status(403).json({ error: 'Cannot modify documents for an approved trip' }); }

    const result = await pool.query(
      `INSERT INTO supporting_docs (trip_invoice_number, doc_date, description, bill_id, category, bill_amount, page_no, file_name, file_type, file_content, created_by) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *`,
      [invoice, b.docDate, b.description, b.billId, b.category, b.billAmount || 0, b.pageNo, fileName, fileType, fileContent, user]
    );
    res.status(201).json(mapDoc(result.rows[0]));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Update a supporting doc
app.put('/api/trips/:invoice/documents/:id', requireAuth, upload.single('file'), async (req, res) => {
  const invoice = decodeURIComponent(req.params.invoice);
  const docId = parseInt(req.params.id);
  const b = req.body;

  try {
    // Check if trip is approved
    const tripCheck = await pool.query('SELECT status FROM trips WHERE yantriki_invoice_number = $1 AND deleted_date IS NULL', [invoice]);
    if (tripCheck.rows.length === 0) { return res.status(404).json({ error: 'Trip not found' }); }
    if (tripCheck.rows[0].status === 'approved') { return res.status(403).json({ error: 'Cannot modify documents for an approved trip' }); }

    let query, values;
    if (req.file) {
      query = `UPDATE supporting_docs SET doc_date=$1, description=$2, bill_id=$3, category=$4, bill_amount=$5, file_name=$6, file_type=$7, file_content=$8 WHERE id=$9 AND trip_invoice_number=$10 RETURNING *`;
      values = [b.docDate, b.description, b.billId, b.category, b.billAmount || 0, req.file.originalname, req.file.mimetype, req.file.buffer, docId, invoice];
    } else {
      query = `UPDATE supporting_docs SET doc_date=$1, description=$2, bill_id=$3, category=$4, bill_amount=$5 WHERE id=$6 AND trip_invoice_number=$7 RETURNING *`;
      values = [b.docDate, b.description, b.billId, b.category, b.billAmount || 0, docId, invoice];
    }
    const result = await pool.query(query, values);
    if (result.rowCount === 0) { return res.status(404).json({ error: 'Document not found' }); }
    res.json(mapDoc(result.rows[0]));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Delete a supporting doc
app.delete('/api/trips/:invoice/documents/:id', requireAuth, async (req, res) => {
  const invoice = decodeURIComponent(req.params.invoice);
  const docId = parseInt(req.params.id);

  try {
    const tripCheck = await pool.query('SELECT status FROM trips WHERE yantriki_invoice_number = $1 AND deleted_date IS NULL', [invoice]);
    if (tripCheck.rows.length === 0) { return res.status(404).json({ error: 'Trip not found' }); }
    if (tripCheck.rows[0].status === 'approved') { return res.status(403).json({ error: 'Cannot modify documents for an approved trip' }); }

    const result = await pool.query('DELETE FROM supporting_docs WHERE id = $1 AND trip_invoice_number = $2 RETURNING *', [docId, invoice]);
    if (result.rowCount === 0) { return res.status(404).json({ error: 'Document not found' }); }
    res.json({ message: 'Document deleted', doc: mapDoc(result.rows[0]) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Download file for a supporting doc
app.get('/api/trips/:invoice/documents/:id/file', requireAuth, async (req, res) => {
  const docId = parseInt(req.params.id);
  try {
    const result = await pool.query('SELECT file_name, file_type, file_content FROM supporting_docs WHERE id = $1', [docId]);
    if (result.rows.length === 0 || !result.rows[0].file_content) { return res.status(404).json({ error: 'File not found' }); }
    const row = result.rows[0];
    res.set('Content-Type', row.file_type);
    res.set('Content-Disposition', `attachment; filename="${row.file_name}"`);
    res.send(row.file_content);
  } catch (err) { res.status(500).json({ error: 'Failed to download file: ' + err.message }); }
});

// ==================== STATIC FILES ====================
app.use(express.static(path.join(__dirname, 'public')));

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ==================== START ====================
async function start() {
  await initDb();
  await ensureTripAuditColumns();
  await ensureAdminUsers();
  await ensureSupportingDocsTable();
  app.listen(port, () => {
    console.log(`Node.js server running on port ${port}`);
  });
}

start().catch((err) => {
  console.error('Server failed to start', err);
  process.exit(1);
});