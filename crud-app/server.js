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
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
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
    rolling: true,
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 30 * 60 * 1000 
    }
  })
);

const dbUrl = process.env.DATABASE_URL || '';
const needsSSL = dbUrl.includes('render.com') && !dbUrl.includes('.internal');

const pool = new Pool({
  connectionString: dbUrl,
  ssl: needsSSL ? { rejectUnauthorized: false } : false
});

// ... [Keep your helper functions mapTrip, mapDoc, requireAuth, etc., as they are] ...

async function sendTripEmail(trip) {
  const transporter = getEmailTransporter();
  const emailTo = process.env.EMAIL_TO || 'somanathan_c@yahoo.com';

  let actionText = 'Submitted for Approval';
  if (trip.status === 'approved') {
    actionText = 'Approved';
  } else if (trip.status === 'rejected') {
    actionText = 'Rejected';
  }

  const subject = `Trip ${trip.yantrikiInvoiceNumber} - ${actionText}`;

  // UPDATED: Now uses Yantriki domain fallback
  const html = `
    <h2>Trip Record ${actionText}</h2>
    <p>A trip record has been ${actionText.toLowerCase()} and requires review.</p>
    <p style="margin-top: 20px;">
      <a href="${process.env.APP_URL || 'https://yantriki.onrender.com'}/approver.html" style="background-color: #4CAF50; color: white; padding: 10px 20px; text-decoration: none; border-radius: 4px;">Approve/Reject Trip</a>
    </p>
    <p style="color: #666; font-size: 12px;">This is an automated email from Yantriki Trip Manager System.</p>
  `;

  if (transporter) {
    try {
      await transporter.sendMail({
        from: process.env.EMAIL_FROM || 'Yantriki Trip Manager <noreply@yantriki.com>',
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

// ... [Rest of your endpoints and init functions remain exactly as they were] ...

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
