/**
 * Database connection pool configuration
 * Uses pg Pool for efficient connection management under high load
 */
const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'wallet_service',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  
  // Connection pool tuning for high-traffic
  max: 20,                          // Maximum connections in pool
  idleTimeoutMillis: 30000,         // Close idle connections after 30s
  connectionTimeoutMillis: 5000,    // Fail fast if can't connect in 5s
  statement_timeout: 10000,         // Kill queries running > 10s
});

// Log pool errors
pool.on('error', (err) => {
  console.error('Unexpected database pool error:', err);
});

/**
 * Execute a query with automatic client acquisition and release
 */
async function query(text, params) {
  const start = Date.now();
  const result = await pool.query(text, params);
  const duration = Date.now() - start;
  
  if (duration > 1000) {
    console.warn(`Slow query (${duration}ms):`, text.substring(0, 100));
  }
  
  return result;
}

/**
 * Get a client from the pool for transaction use
 * IMPORTANT: Always release the client in a finally block
 */
async function getClient() {
  const client = await pool.connect();
  return client;
}

/**
 * Execute a function within a database transaction
 * Handles BEGIN, COMMIT, ROLLBACK automatically
 */
async function withTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Health check - verify database connectivity
 */
async function healthCheck() {
  try {
    const result = await pool.query('SELECT NOW() as now');
    return { healthy: true, timestamp: result.rows[0].now };
  } catch (error) {
    return { healthy: false, error: error.message };
  }
}

module.exports = {
  pool,
  query,
  getClient,
  withTransaction,
  healthCheck,
};
