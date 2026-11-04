const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

function toPositionalParameters(sql) {
  let index = 0;
  return sql.replace(/\?/g, () => `$${++index}`);
}

async function query(sql, params = []) {
  const result = await pool.query(toPositionalParameters(sql), params);
  return result.rows;
}

async function queryOne(sql, params = []) {
  const rows = await query(sql, params);
  return rows[0] ?? null;
}

async function runInTransaction(work) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    const runQuery = async (sql, params = []) => (await client.query(toPositionalParameters(sql), params)).rows;
    const result = await work(runQuery);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function initDatabase() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS accounts (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT NOT NULL CHECK (type IN ('bank', 'upi', 'cash')),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS payments (
      id SERIAL PRIMARY KEY,
      amount DOUBLE PRECISION NOT NULL CHECK (amount > 0),
      category TEXT NOT NULL,
      payment_date TEXT NOT NULL,
      account_id INTEGER REFERENCES accounts(id) ON DELETE CASCADE,
      note TEXT,
      transaction_type TEXT NOT NULL DEFAULT 'debit' CHECK (transaction_type IN ('debit', 'credit')),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);
}

module.exports = { query, queryOne, runInTransaction, initDatabase };