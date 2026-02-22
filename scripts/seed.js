/**
 * Database setup and seeding script
 * Reads and executes the SQL schema and seed files
 */

require('dotenv').config();

const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

async function seed() {
  // Connect to the default 'postgres' database to create our database
  const adminPool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    database: 'postgres',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
  });

  const dbName = process.env.DB_NAME || 'wallet_service';

  console.log('🔧 Setting up wallet service database...\n');

  try {
    // Check if database exists
    const dbCheck = await adminPool.query(
      `SELECT 1 FROM pg_database WHERE datname = $1`,
      [dbName]
    );

    if (dbCheck.rows.length === 0) {
      console.log(`📦 Creating database "${dbName}"...`);
      await adminPool.query(`CREATE DATABASE ${dbName}`);
      console.log(`   ✅ Database created.\n`);
    } else {
      console.log(`📦 Database "${dbName}" already exists.`);
      
      // Drop and recreate for clean seed
      // First disconnect all clients
      await adminPool.query(`
        SELECT pg_terminate_backend(pg_stat_activity.pid)
        FROM pg_stat_activity
        WHERE pg_stat_activity.datname = '${dbName}'
        AND pid <> pg_backend_pid()
      `);
      
      await adminPool.query(`DROP DATABASE ${dbName}`);
      await adminPool.query(`CREATE DATABASE ${dbName}`);
      console.log(`   ✅ Database recreated for clean seed.\n`);
    }
  } finally {
    await adminPool.end();
  }

  // Now connect to our database and run schema + seed
  const appPool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    database: dbName,
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
  });

  try {
    // Run schema
    const schemaPath = path.join(__dirname, '..', 'sql', '001_schema.sql');
    const schemaSql = fs.readFileSync(schemaPath, 'utf-8');
    console.log('📋 Running schema migration...');
    await appPool.query(schemaSql);
    console.log('   ✅ Schema created.\n');

    // Run seed data
    const seedPath = path.join(__dirname, '..', 'sql', '002_seed.sql');
    const seedSql = fs.readFileSync(seedPath, 'utf-8');
    console.log('🌱 Inserting seed data...');
    await appPool.query(seedSql);
    console.log('   ✅ Seed data inserted.\n');

    // Verify
    console.log('🔍 Verifying seed data:\n');

    const assets = await appPool.query('SELECT code, name FROM asset_types');
    console.log('   Asset Types:');
    assets.rows.forEach(a => console.log(`     - ${a.code}: ${a.name}`));

    const users = await appPool.query('SELECT username, user_type FROM users ORDER BY user_type, username');
    console.log('\n   Users:');
    users.rows.forEach(u => console.log(`     - ${u.username} (${u.user_type})`));

    const wallets = await appPool.query(`
      SELECT u.username, at.code, w.balance 
      FROM wallets w
      JOIN users u ON w.user_id = u.id
      JOIN asset_types at ON w.asset_type_id = at.id
      WHERE u.user_type = 'user'
      ORDER BY u.username, at.code
    `);
    console.log('\n   User Balances:');
    wallets.rows.forEach(w => console.log(`     - ${w.username}: ${w.balance} ${w.code}`));

    const txCount = await appPool.query('SELECT COUNT(*) FROM transactions');
    const ledgerCount = await appPool.query('SELECT COUNT(*) FROM ledger_entries');
    console.log(`\n   Transactions: ${txCount.rows[0].count}`);
    console.log(`   Ledger Entries: ${ledgerCount.rows[0].count}`);

    console.log('\n✨ Database setup complete! Ready to start the server.');
  } finally {
    await appPool.end();
  }
}

seed().catch(err => {
  console.error('❌ Seed failed:', err.message);
  process.exit(1);
});
