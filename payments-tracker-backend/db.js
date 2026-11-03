const Database = require('better-sqlite3');

const db = new Database('payments.db');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS accounts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('bank', 'upi', 'cash')),
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    amount REAL NOT NULL CHECK (amount > 0),
    category TEXT NOT NULL,
    payment_date TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );
`);

const paymentColumns = db.prepare('PRAGMA table_info(payments)').all().map((column) => column.name);

if (!paymentColumns.includes('account_id')) {
  db.exec('ALTER TABLE payments ADD COLUMN account_id INTEGER REFERENCES accounts(id) ON DELETE SET NULL');
}

if (!paymentColumns.includes('note')) {
  db.exec('ALTER TABLE payments ADD COLUMN note TEXT');
}

module.exports = db;