const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

// Read database URL from command line argument or environment variable
const dbUrl = process.argv[2] || process.env.DATABASE_URL;

if (!dbUrl) {
  console.error('Error: Please provide your database URL.');
  console.error('Usage: node hash-passwords.js "your_postgres_connection_string"');
  process.exit(1);
}

const needsSSL = dbUrl.includes('render.com') && !dbUrl.includes('.internal');
const pool = new Pool({
  connectionString: dbUrl,
  ssl: needsSSL ? { rejectUnauthorized: false } : false
});

async function main() {
  try {
    console.log('Connecting to your database...');
    const res = await pool.query('SELECT username, password_hash FROM admin_users');
    console.log(`Connected! Found ${res.rows.length} users in 'admin_users' table.`);

    let updatedCount = 0;
    for (const row of res.rows) {
      const currentVal = row.password_hash || '';
      // Check if it's already a bcrypt hash
      const isHashed = (currentVal.startsWith('$2a$') || currentVal.startsWith('$2b$') || currentVal.startsWith('$2y$')) && currentVal.length === 60;
      
      if (!isHashed && currentVal.length > 0) {
        console.log(`Hashing plain text password for user: "${row.username}"...`);
        const hashed = await bcrypt.hash(currentVal, 10);
        await pool.query('UPDATE admin_users SET password_hash = $1 WHERE username = $2', [hashed, row.username]);
        console.log(`-> Successfully hashed password for "${row.username}".`);
        updatedCount++;
      } else {
        console.log(`-> Skipping "${row.username}" (password is already hashed).`);
      }
    }
    console.log(`\nDone! Successfully hashed ${updatedCount} plain text password(s).`);
  } catch (err) {
    console.error('Error processing passwords:', err.message);
  } finally {
    await pool.end();
  }
}

main();
