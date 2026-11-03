const express = require('express');
const cors = require('cors');
const db = require('./db');

const app = express();
const PORT = 4000;
const ACCOUNT_TYPES = ['bank', 'upi', 'cash'];
const MONTH_PATTERN = /^\d{4}-\d{2}$/;

app.use(cors());
app.use(express.json());

function getMonthKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function getCurrentMonthKey() {
  return getMonthKey(new Date());
}

function shiftMonthKey(monthKey, delta) {
  const [year, month] = monthKey.split('-').map(Number);
  return getMonthKey(new Date(year, month - 1 + delta, 1));
}

function resolveMonth(value) {
  if (!value) {
    return getCurrentMonthKey();
  }
  return MONTH_PATTERN.test(value) ? value : null;
}

function resolveAccountId(value) {
  return value ? Number(value) : null;
}

function buildPaymentFilter(monthKey, accountId) {
  const conditions = ["strftime('%Y-%m', payment_date) = ?"];
  const params = [monthKey];

  if (accountId) {
    conditions.push('account_id = ?');
    params.push(accountId);
  }

  return { where: conditions.join(' AND '), params };
}

app.get('/api/payments', (req, res) => {
  const accountId = resolveAccountId(req.query.account_id);
  const rows = accountId
    ? db.prepare('SELECT * FROM payments WHERE account_id = ? ORDER BY payment_date DESC, id DESC').all(accountId)
    : db.prepare('SELECT * FROM payments ORDER BY payment_date DESC, id DESC').all();
  res.json(rows);
});

app.post('/api/payments', (req, res) => {
  const { amount, category, payment_date, account_id, note } = req.body;

  if (!amount || amount <= 0 || !category || !payment_date) {
    return res.status(400).json({ error: 'amount, category and payment_date are required' });
  }

  const savedNote = note?.trim() || null;

  const result = db
    .prepare('INSERT INTO payments (amount, category, payment_date, account_id, note) VALUES (?, ?, ?, ?, ?)')
    .run(amount, category, payment_date, account_id ?? null, savedNote);

  res.status(201).json({
    id: result.lastInsertRowid,
    amount,
    category,
    payment_date,
    account_id: account_id ?? null,
    note: savedNote,
  });
});

app.delete('/api/payments/:id', (req, res) => {
  const result = db.prepare('DELETE FROM payments WHERE id = ?').run(req.params.id);

  if (result.changes === 0) {
    return res.status(404).json({ error: 'Payment not found' });
  }

  res.json({ deleted: true });
});

app.get('/api/summary', (req, res) => {
  const accountId = resolveAccountId(req.query.account_id);
  const rows = accountId
    ? db
      .prepare('SELECT category, SUM(amount) AS total FROM payments WHERE account_id = ? GROUP BY category ORDER BY total DESC')
      .all(accountId)
    : db.prepare('SELECT category, SUM(amount) AS total FROM payments GROUP BY category ORDER BY total DESC').all();
  res.json(rows);
});

app.get('/api/analytics', (req, res) => {
  const monthKey = resolveMonth(req.query.month);

  if (!monthKey) {
    return res.status(400).json({ error: 'month must be in YYYY-MM format' });
  }

  const accountId = resolveAccountId(req.query.account_id);
  const previousMonthKey = shiftMonthKey(monthKey, -1);
  const currentFilter = buildPaymentFilter(monthKey, accountId);
  const previousFilter = buildPaymentFilter(previousMonthKey, accountId);

  const totals = db
    .prepare(`SELECT COALESCE(SUM(amount), 0) AS total, COUNT(*) AS count FROM payments WHERE ${currentFilter.where}`)
    .get(...currentFilter.params);

  const previousTotals = db
    .prepare(`SELECT COALESCE(SUM(amount), 0) AS total FROM payments WHERE ${previousFilter.where}`)
    .get(...previousFilter.params);

  const categories = db
    .prepare(
      `SELECT category, SUM(amount) AS total, COUNT(*) AS count FROM payments WHERE ${currentFilter.where} GROUP BY category ORDER BY total DESC`
    )
    .all(...currentFilter.params);

  const largestPayments = db
    .prepare(
      `SELECT id, amount, category, payment_date, note FROM payments WHERE ${currentFilter.where} ORDER BY amount DESC, id DESC LIMIT 3`
    )
    .all(...currentFilter.params);

  res.json({
    month: monthKey,
    previous_month: previousMonthKey,
    previous_month_total: previousTotals.total,
    total_spent: totals.total,
    payment_count: totals.count,
    average_payment: totals.count > 0 ? totals.total / totals.count : 0,
    categories: categories.map((item) => ({
      ...item,
      share: totals.total > 0 ? (item.total / totals.total) * 100 : 0,
    })),
    largest_payments: largestPayments,
  });
});

app.get('/api/analytics/trend', (req, res) => {
  const endMonth = resolveMonth(req.query.month);

  if (!endMonth) {
    return res.status(400).json({ error: 'month must be in YYYY-MM format' });
  }

  const monthCount = Math.min(Math.max(Number(req.query.months) || 6, 1), 24);
  const accountId = resolveAccountId(req.query.account_id);
  const monthKeys = Array.from({ length: monthCount }, (_, index) =>
    shiftMonthKey(endMonth, index - (monthCount - 1))
  );

  const conditions = [`strftime('%Y-%m', payment_date) IN (${monthKeys.map(() => '?').join(', ')})`];
  const params = [...monthKeys];

  if (accountId) {
    conditions.push('account_id = ?');
    params.push(accountId);
  }

  const rows = db
    .prepare(
      `SELECT strftime('%Y-%m', payment_date) AS month, SUM(amount) AS total FROM payments WHERE ${conditions.join(' AND ')} GROUP BY month`
    )
    .all(...params);

  const totalsByMonth = new Map(rows.map((row) => [row.month, row.total]));

  res.json(monthKeys.map((monthKey) => ({ month: monthKey, total: totalsByMonth.get(monthKey) ?? 0 })));
});

app.get('/api/accounts', (req, res) => {
  const rows = db.prepare('SELECT * FROM accounts ORDER BY id').all();
  res.json(rows);
});

app.post('/api/accounts', (req, res) => {
  const { name, type } = req.body;

  if (!name || !ACCOUNT_TYPES.includes(type)) {
    return res.status(400).json({ error: 'name and a valid type (bank, upi, cash) are required' });
  }

  const result = db.prepare('INSERT INTO accounts (name, type) VALUES (?, ?)').run(name, type);

  res.status(201).json({ id: result.lastInsertRowid, name, type });
});

app.delete('/api/accounts/:id', (req, res) => {
  const result = db.prepare('DELETE FROM accounts WHERE id = ?').run(req.params.id);

  if (result.changes === 0) {
    return res.status(404).json({ error: 'Account not found' });
  }

  res.json({ deleted: true });
});

app.listen(PORT, () => {
  console.log(`Payments API running on http://localhost:${PORT}`);
});