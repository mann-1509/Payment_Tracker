require('dotenv').config();
const crypto = require('crypto');
const express = require('express');
const cors = require('cors');
const { query, queryOne, runInTransaction, initDatabase } = require('./db');

const app = express();
const PORT = process.env.PORT || 4000;
const ACCOUNT_TYPES = ['bank', 'upi', 'cash'];
const TRANSACTION_TYPES = ['debit', 'credit'];
const MONTH_PATTERN = /^\d{4}-\d{2}$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000;

let databaseReady = null;

function ensureDatabaseReady() {
  if (!databaseReady) {
    databaseReady = initDatabase().catch((error) => {
      databaseReady = null;
      throw error;
    });
  }
  return databaseReady;
}

app.use(cors());
app.use(express.json());

app.use(async (req, res, next) => {
  try {
    await ensureDatabaseReady();
    next();
  } catch (error) {
    next(error);
  }
});

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

function resolveTransactionType(value) {
  if (!value) return null;
  const normalized = String(value).toLowerCase().trim();
  return TRANSACTION_TYPES.includes(normalized) ? normalized : null;
}

function buildConditions({ monthKey, accountId, transactionType }) {
  const conditions = [];
  const params = [];

  if (monthKey) {
    conditions.push('left(payment_date, 7) = ?');
    params.push(monthKey);
  }

  if (accountId) {
    conditions.push('account_id = ?');
    params.push(accountId);
  }

  if (transactionType) {
    conditions.push('transaction_type = ?');
    params.push(transactionType);
  }

  return {
    whereClause: conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '',
    params,
  };
}

function timingSafeEqualStrings(first, second) {
  const firstBuffer = Buffer.from(String(first));
  const secondBuffer = Buffer.from(String(second));

  if (firstBuffer.length !== secondBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(firstBuffer, secondBuffer);
}

function signSessionPayload(payload) {
  return crypto.createHmac('sha256', process.env.APP_PIN).update(payload).digest('hex');
}

function createSessionToken() {
  const expiresAt = String(Date.now() + SESSION_DURATION_MS);
  return `${expiresAt}.${signSessionPayload(expiresAt)}`;
}

function isValidSessionToken(token) {
  if (!token || !process.env.APP_PIN) {
    return false;
  }

  const [expiresAt, signature] = token.split('.');

  if (!expiresAt || !signature) {
    return false;
  }

  if (!timingSafeEqualStrings(signature, signSessionPayload(expiresAt))) {
    return false;
  }

  return Number(expiresAt) > Date.now();
}

app.post('/api/login', (req, res) => {
  const { pin } = req.body;
  const configuredPin = process.env.APP_PIN;

  if (!configuredPin || !pin || !timingSafeEqualStrings(pin, configuredPin)) {
    return res.status(401).json({ error: 'Wrong PIN' });
  }

  res.json({ token: createSessionToken() });
});

app.use('/api', (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return res.status(401).json({ error: 'Session expired' });
  }

  const parts = authHeader.split(' ');
  const token = parts.length === 2 && /^bearer$/i.test(parts[0]) ? parts[1] : parts[0];

  if (!isValidSessionToken(token)) {
    return res.status(401).json({ error: 'Session expired' });
  }

  next();
});

app.get('/api/payments', async (req, res) => {
  const { whereClause, params } = buildConditions({
    accountId: resolveAccountId(req.query.account_id),
    transactionType: resolveTransactionType(req.query.transaction_type),
  });

  const rows = await query(`SELECT * FROM payments ${whereClause} ORDER BY payment_date DESC, id DESC`, params);
  res.json(rows);
});

app.post('/api/payments', async (req, res) => {
  const { amount, category, payment_date, account_id, note } = req.body;
  const requestedType = req.body.type !== undefined ? req.body.type : req.body.transaction_type;

  const numericAmount = Number(amount);
  if (!amount || isNaN(numericAmount) || numericAmount <= 0) {
    return res.status(400).json({ error: 'amount must be a valid number greater than 0' });
  }

  if (!category || typeof category !== 'string' || !category.trim()) {
    return res.status(400).json({ error: 'category is required' });
  }

  if (!payment_date || !DATE_PATTERN.test(payment_date)) {
    return res.status(400).json({ error: 'payment_date must be in YYYY-MM-DD format' });
  }

  const type = requestedType ? String(requestedType).toLowerCase().trim() : 'debit';
  if (!TRANSACTION_TYPES.includes(type)) {
    return res.status(400).json({ error: "type must be either 'debit' or 'credit'" });
  }

  const savedCategory = category.trim();
  const savedNote = note?.trim() || null;
  const savedAccountId = account_id ? Number(account_id) : null;

  const [inserted] = await query(
    'INSERT INTO payments (amount, category, payment_date, account_id, note, transaction_type) VALUES (?, ?, ?, ?, ?, ?) RETURNING id',
    [numericAmount, savedCategory, payment_date, savedAccountId, savedNote, type]
  );

  res.status(201).json({
    id: inserted.id,
    amount: numericAmount,
    category: savedCategory,
    payment_date,
    account_id: savedAccountId,
    note: savedNote,
    type,
    transaction_type: type,
  });
});

app.delete('/api/payments/:id', async (req, res) => {
  const paymentId = Number(req.params.id);

  if (!Number.isInteger(paymentId)) {
    return res.status(404).json({ error: 'Payment not found' });
  }

  const deleted = await query('DELETE FROM payments WHERE id = ? RETURNING id', [paymentId]);

  if (deleted.length === 0) {
    return res.status(404).json({ error: 'Payment not found' });
  }

  res.json({ deleted: true });
});

app.get('/api/summary', async (req, res) => {
  const { whereClause, params } = buildConditions({
    accountId: resolveAccountId(req.query.account_id),
    transactionType: 'debit',
  });

  const rows = await query(
    `SELECT category, SUM(amount)::float8 AS total FROM payments ${whereClause} GROUP BY category ORDER BY total DESC`,
    params
  );
  res.json(rows);
});

app.get('/api/analytics', async (req, res) => {
  const monthKey = resolveMonth(req.query.month);

  if (!monthKey) {
    return res.status(400).json({ error: 'month must be in YYYY-MM format' });
  }

  const accountId = resolveAccountId(req.query.account_id);
  const previousMonthKey = shiftMonthKey(monthKey, -1);

  const currentDebit = buildConditions({ monthKey, accountId, transactionType: 'debit' });
  const currentCredit = buildConditions({ monthKey, accountId, transactionType: 'credit' });
  const previousDebit = buildConditions({ monthKey: previousMonthKey, accountId, transactionType: 'debit' });
  const previousCredit = buildConditions({ monthKey: previousMonthKey, accountId, transactionType: 'credit' });

  const [debitTotals, creditTotals, previousDebitTotals, previousCreditTotals, categories, largestPayments] =
    await Promise.all([
      queryOne(
        `SELECT COALESCE(SUM(amount), 0)::float8 AS total, COUNT(*)::int AS count FROM payments ${currentDebit.whereClause}`,
        currentDebit.params
      ),
      queryOne(
        `SELECT COALESCE(SUM(amount), 0)::float8 AS total, COUNT(*)::int AS count FROM payments ${currentCredit.whereClause}`,
        currentCredit.params
      ),
      queryOne(
        `SELECT COALESCE(SUM(amount), 0)::float8 AS total FROM payments ${previousDebit.whereClause}`,
        previousDebit.params
      ),
      queryOne(
        `SELECT COALESCE(SUM(amount), 0)::float8 AS total FROM payments ${previousCredit.whereClause}`,
        previousCredit.params
      ),
      query(
        `SELECT category, SUM(amount)::float8 AS total, COUNT(*)::int AS count FROM payments ${currentDebit.whereClause} GROUP BY category ORDER BY total DESC`,
        currentDebit.params
      ),
      query(
        `SELECT id, amount, category, payment_date, note, transaction_type FROM payments ${currentDebit.whereClause} ORDER BY amount DESC, id DESC LIMIT 3`,
        currentDebit.params
      ),
    ]);

  const totalDebits = debitTotals.total;
  const totalCredits = creditTotals.total;

  res.json({
    month: monthKey,
    previous_month: previousMonthKey,
    previous_month_total: previousDebitTotals.total,
    previous_month_credit: previousCreditTotals.total,
    total_spent: totalDebits,
    total_expense: totalDebits,
    total_debit: totalDebits,
    total_income: totalCredits,
    total_credit: totalCredits,
    net_balance: totalCredits - totalDebits,
    payment_count: debitTotals.count + creditTotals.count,
    debit_count: debitTotals.count,
    credit_count: creditTotals.count,
    average_payment: debitTotals.count > 0 ? totalDebits / debitTotals.count : 0,
    categories: categories.map((item) => ({
      ...item,
      share: totalDebits > 0 ? (item.total / totalDebits) * 100 : 0,
    })),
    largest_payments: largestPayments,
  });
});

app.get('/api/analytics/trend', async (req, res) => {
  const endMonth = resolveMonth(req.query.month);

  if (!endMonth) {
    return res.status(400).json({ error: 'month must be in YYYY-MM format' });
  }

  const monthCount = Math.min(Math.max(Number(req.query.months) || 6, 1), 24);
  const accountId = resolveAccountId(req.query.account_id);
  const monthKeys = Array.from({ length: monthCount }, (_, index) =>
    shiftMonthKey(endMonth, index - (monthCount - 1))
  );

  const conditions = ['left(payment_date, 7) = ANY(?)'];
  const params = [monthKeys];

  if (accountId) {
    conditions.push('account_id = ?');
    params.push(accountId);
  }

  const rows = await query(
    `SELECT left(payment_date, 7) AS month,
            COALESCE(SUM(CASE WHEN transaction_type = 'debit' THEN amount ELSE 0 END), 0)::float8 AS debit_total,
            COALESCE(SUM(CASE WHEN transaction_type = 'credit' THEN amount ELSE 0 END), 0)::float8 AS credit_total
     FROM payments
     WHERE ${conditions.join(' AND ')}
     GROUP BY 1`,
    params
  );

  const totalsByMonth = new Map(rows.map((row) => [row.month, row]));

  res.json(
    monthKeys.map((monthKey) => {
      const entry = totalsByMonth.get(monthKey);
      const debitValue = entry ? entry.debit_total : 0;
      const creditValue = entry ? entry.credit_total : 0;
      return {
        month: monthKey,
        total: debitValue,
        total_expense: debitValue,
        total_income: creditValue,
        debit: debitValue,
        credit: creditValue,
      };
    })
  );
});

app.get('/api/accounts', async (req, res) => {
  const rows = await query('SELECT * FROM accounts ORDER BY id');
  res.json(rows);
});

app.post('/api/accounts', async (req, res) => {
  const { name, type } = req.body;

  if (!name || !ACCOUNT_TYPES.includes(type)) {
    return res.status(400).json({ error: 'name and a valid type (bank, upi, cash) are required' });
  }

  const trimmedName = name.trim();
  const [inserted] = await query('INSERT INTO accounts (name, type) VALUES (?, ?) RETURNING id', [trimmedName, type]);

  res.status(201).json({ id: inserted.id, name: trimmedName, type });
});

app.delete('/api/accounts/:id', async (req, res) => {
  const accountId = Number(req.params.id);

  if (!Number.isInteger(accountId)) {
    return res.status(404).json({ error: 'Account not found' });
  }

  const result = await runInTransaction(async (runQuery) => {
    const existingAccounts = await runQuery('SELECT id FROM accounts WHERE id = ?', [accountId]);

    if (existingAccounts.length === 0) {
      return null;
    }

    const deletedPayments = await runQuery('DELETE FROM payments WHERE account_id = ? RETURNING id', [accountId]);
    await runQuery('DELETE FROM accounts WHERE id = ?', [accountId]);

    return { deleted: true, payments_deleted: deletedPayments.length };
  });

  if (!result) {
    return res.status(404).json({ error: 'Account not found' });
  }

  res.json(result);
});

app.use((error, req, res, next) => {
  app.get('/api/budgets/status', async (req, res) => {
    const monthKey = resolveMonth(req.query.month);

    if (!monthKey) {
      return res.status(400).json({ error: 'month must be in YYYY-MM format' });
    }

    const accountId = resolveAccountId(req.query.account_id);
    const accountCondition = accountId ? ' AND p.account_id = ?' : '';
    const params = accountId ? [monthKey, accountId] : [monthKey];

    const rows = await query(
      `SELECT b.category,
            b.monthly_limit::float8 AS monthly_limit,
            COALESCE(SUM(p.amount), 0)::float8 AS spent
     FROM budgets b
     LEFT JOIN payments p
       ON p.category = b.category
      AND p.transaction_type = 'debit'
      AND left(p.payment_date, 7) = ?${accountCondition}
     GROUP BY b.category, b.monthly_limit
     ORDER BY b.category`,
      params
    );

    res.json(rows);
  });

  app.put('/api/budgets/:category', async (req, res) => {
    const category = decodeURIComponent(req.params.category).trim();
    const limit = Number(req.body.monthly_limit);

    if (!category) {
      return res.status(400).json({ error: 'category is required' });
    }

    if (!Number.isFinite(limit) || limit <= 0) {
      return res.status(400).json({ error: 'monthly_limit must be greater than 0' });
    }

    const [saved] = await query(
      `INSERT INTO budgets (category, monthly_limit) VALUES (?, ?)
     ON CONFLICT (category) DO UPDATE SET monthly_limit = EXCLUDED.monthly_limit
     RETURNING category, monthly_limit::float8 AS monthly_limit`,
      [category, limit]
    );

    res.json(saved);
  });

  app.delete('/api/budgets/:category', async (req, res) => {
    const category = decodeURIComponent(req.params.category).trim();
    const deleted = await query('DELETE FROM budgets WHERE category = ? RETURNING category', [category]);

    if (deleted.length === 0) {
      return res.status(404).json({ error: 'Budget not found' });
    }

    res.json({ deleted: true });
  });
  console.error(error);
  res.status(500).json({ error: 'Server error' });
});

module.exports = app;

if (require.main === module) {
  ensureDatabaseReady()
    .then(() => {
      app.listen(PORT, () => {
        console.log(`Payments API running on http://localhost:${PORT}`);
      });
    })
    .catch((error) => {
      console.error('Could not connect to the database:', error.message);
      process.exit(1);
    });
}