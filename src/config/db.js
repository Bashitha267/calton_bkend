const mysql = require('mysql2/promise');
require('dotenv').config();

// ─── Connection Pool ───────────────────────────────────────────────────────
// Keep connectionLimit low (5) — Hostinger shared hosting has tight DB limits
const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  connectionLimit: parseInt(process.env.DB_CONNECTION_LIMIT) || 5,
  waitForConnections: true,
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelay: 10000,
  // Reduce ping latency with named placeholders + prepared statements
  namedPlaceholders: false,
  // Auto-reconnect config
  connectTimeout: 10000,
  timezone: '+00:00',
});

// Warm-up: verify connection on startup
pool.getConnection()
  .then(conn => {
    console.log('✅ MySQL connected (pool ready)');
    conn.release();
  })
  .catch(err => {
    console.error('❌ MySQL connection failed:', err.message);
    // Don't crash — pool will retry on next request
  });

// Helper: run a query and return rows
async function query(sql, params = []) {
  const [rows] = await pool.execute(sql, params);
  return rows;
}

// Helper: run a query and return first row
async function queryOne(sql, params = []) {
  const rows = await query(sql, params);
  return rows[0] || null;
}

// Helper: run insert/update/delete and return result metadata
async function execute(sql, params = []) {
  const [result] = await pool.execute(sql, params);
  return result;
}

// Helper: begin transaction with auto-rollback
async function withTransaction(callback) {
  const conn = await pool.getConnection();
  await conn.beginTransaction();
  try {
    const result = await callback(conn);
    await conn.commit();
    return result;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

module.exports = { pool, query, queryOne, execute, withTransaction };
