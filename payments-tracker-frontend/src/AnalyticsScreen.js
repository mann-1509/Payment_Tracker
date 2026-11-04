import { useEffect, useState } from 'react';

const API_URL = '/api';
const TREND_MONTHS = 6;

function getMonthKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function shiftMonthKey(monthKey, delta) {
  const [year, month] = monthKey.split('-').map(Number);
  return getMonthKey(new Date(year, month - 1 + delta, 1));
}

function formatMonth(monthKey, options) {
  const [year, month] = monthKey.split('-').map(Number);
  return new Date(year, month - 1, 1).toLocaleDateString('en-US', options);
}

function getRangeLabel(monthKey) {
  const [year, month] = monthKey.split('-').map(Number);
  const lastDay = new Date(year, month, 0).getDate();
  const shortName = formatMonth(monthKey, { month: 'short' });
  return `01 ${shortName} - ${lastDay} ${shortName}`;
}

function formatWhole(value) {
  return `₹ ${Math.round(Number(value)).toLocaleString('en-IN')}`;
}

function splitRupees(value) {
  const [whole, decimals = '00'] = Number(value).toFixed(2).split('.');
  return { whole: Number(whole).toLocaleString('en-IN'), decimals };
}

function formatShortDate(dateString) {
  return new Date(`${dateString}T00:00:00`).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
}

function getInitial(text) {
  return (text || '?').charAt(0).toUpperCase();
}

function RupeeTotal({ value }) {
  const { whole, decimals } = splitRupees(value);
  return (
    <p className="big-total">
      ₹ {whole}
      <span className="decimal-part">.{decimals}</span>
    </p>
  );
}

export default function AnalyticsScreen({ accounts, token, onBack, onUnauthorized }) {
  const [monthKey, setMonthKey] = useState(getMonthKey(new Date()));
  const [accountIndex, setAccountIndex] = useState(-1);
  const [summary, setSummary] = useState(null);
  const [trend, setTrend] = useState([]);
  const [errorMessage, setErrorMessage] = useState('');

  const [pendingDelete, setPendingDelete] = useState(null);
  const [isDeletingPayment, setIsDeletingPayment] = useState(false);
  const [sheetError, setSheetError] = useState('');

  const selectedAccount = accountIndex >= 0 ? accounts[accountIndex] : null;
  const selectedAccountId = selectedAccount?.id ?? null;

  useEffect(() => {
    if (accountIndex >= 0 && (!selectedAccount || !accounts.some((acc) => acc.id === selectedAccountId))) {
      setAccountIndex(-1);
    }
  }, [accounts, accountIndex, selectedAccount, selectedAccountId]);

  const loadAnalyticsData = async () => {
    const accountQuery = selectedAccountId ? `&account_id=${selectedAccountId}` : '';
    const headers = token ? { Authorization: `Bearer ${token}` } : {};

    try {
      const [summaryRes, trendRes] = await Promise.all([
        fetch(`${API_URL}/analytics?month=${monthKey}${accountQuery}`, { headers }),
        fetch(`${API_URL}/analytics/trend?month=${monthKey}&months=${TREND_MONTHS}${accountQuery}`, { headers }),
      ]);

      if (summaryRes.status === 401 || trendRes.status === 401) {
        onUnauthorized();
        return;
      }

      if (!summaryRes.ok || !trendRes.ok) {
        throw new Error('Analytics failed');
      }

      const summaryData = await summaryRes.json();
      const trendData = await trendRes.json();
      setSummary(summaryData);
      setTrend(trendData);
      setErrorMessage('');
    } catch (err) {
      setErrorMessage('Backend not reachable');
    }
  };

  useEffect(() => {
    loadAnalyticsData();
  }, [monthKey, selectedAccountId, token]);

  const cycleAccount = () => {
    setAccountIndex((current) => (current + 1 >= accounts.length ? -1 : current + 1));
  };

  const openDeleteSheet = (payment) => {
    setSheetError('');
    setPendingDelete(payment);
  };

  const closeDeleteSheet = () => {
    if (isDeletingPayment) return;
    setPendingDelete(null);
    setSheetError('');
  };

  const confirmDeletePayment = async () => {
    if (!pendingDelete) return;

    setIsDeletingPayment(true);
    setSheetError('');

    try {
      const response = await fetch(`${API_URL}/payments/${pendingDelete.id}`, {
        method: 'DELETE',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });

      if (response.status === 401) {
        onUnauthorized();
        return;
      }

      if (!response.ok) {
        throw new Error('Delete failed');
      }

      setPendingDelete(null);
      await loadAnalyticsData();
    } catch (err) {
      setSheetError("Could not delete payment. Try again.");
    } finally {
      setIsDeletingPayment(false);
    }
  };

  const totalSpent = summary?.total_spent ?? summary?.total_debit ?? 0;
  const totalIncome = summary?.total_credit ?? summary?.total_income ?? 0;
  const netBalance = summary?.net_balance ?? (totalIncome - totalSpent);
  const paymentCount = summary?.payment_count ?? 0;
  const debitCount = summary?.debit_count ?? 0;
  const creditCount = summary?.credit_count ?? 0;
  const averageDebit = summary?.average_payment ?? 0;
  const previousTotal = summary?.previous_month_total ?? 0;
  const categories = summary?.categories ?? [];
  const largestPayments = summary?.largest_payments ?? [];
  const largestTotal = largestPayments.reduce((sum, payment) => sum + payment.amount, 0);
  const otherDebitCount = debitCount - largestPayments.length;
  const otherDebitTotal = totalSpent - largestTotal;
  const changePercent = previousTotal > 0 ? ((totalSpent - previousTotal) / previousTotal) * 100 : null;

  const highestTrend = Math.max(
    ...trend.map((item) => Math.max(item.debit ?? item.total ?? 0, item.credit ?? item.total_income ?? 0)),
    0
  );
  const currentMonthName = formatMonth(monthKey, { month: 'long' });
  const currentYear = formatMonth(monthKey, { year: 'numeric' });
  const previousMonthName = formatMonth(shiftMonthKey(monthKey, -1), { month: 'long' });

  return (
    <div className="screen">
      <header className="top-bar">
        <button type="button" className="back-button" onClick={onBack} aria-label="Back">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M19 12H5M11 6l-6 6 6 6" />
          </svg>
        </button>
        <h1>Monthly analytics</h1>
      </header>

      {errorMessage && <p className="message">{errorMessage}</p>}

      <div className="month-nav">
        <button
          type="button"
          className="nav-button"
          onClick={() => setMonthKey(shiftMonthKey(monthKey, -1))}
          aria-label="Previous month"
        >
          ‹
        </button>
        <div className="month-center">
          <span className="month-title">
            {currentMonthName} {currentYear}
          </span>
          <span className="month-range">{getRangeLabel(monthKey)}</span>
        </div>
        <button
          type="button"
          className="nav-button"
          onClick={() => setMonthKey(shiftMonthKey(monthKey, 1))}
          aria-label="Next month"
        >
          ›
        </button>
      </div>

      <button type="button" className="account-banner" onClick={cycleAccount}>
        <span className="banner-square" />
        <span className="banner-text">
          <span className="banner-brand">MANN</span>
          <span className="banner-sub">designer · Payment records</span>
        </span>
        <span className="banner-account">{selectedAccount ? selectedAccount.name : 'All accounts'}</span>
      </button>

      <section className="summary-block">
        <div className="summary-header">
          <span className="field-label">Total expenses (Debit)</span>
          <span className="currency-tag">INR</span>
        </div>
        <RupeeTotal value={totalSpent} />
        {changePercent === null ? (
          <p className="muted">No debit expenses recorded in {previousMonthName}</p>
        ) : (
          <>
            <p className={changePercent >= 0 ? 'trend-up' : 'trend-down'}>
              {changePercent >= 0 ? '▲' : '▼'} {Math.abs(changePercent).toFixed(1)}%{' '}
              {changePercent >= 0 ? 'more' : 'less'} spending than {previousMonthName}
            </p>
            <p className="muted">
              {formatWhole(Math.abs(totalSpent - previousTotal))} {totalSpent >= previousTotal ? 'more' : 'less'} ·{' '}
              {previousMonthName} spending {formatWhole(previousTotal)}
            </p>
          </>
        )}
      </section>

      <section className="balance-grid">
        <div className="balance-card income-card">
          <span className="field-label">Total income (Credit)</span>
          <span className="balance-value income-value">{formatWhole(totalIncome)}</span>
          <span className="balance-sub">{creditCount} credit {creditCount === 1 ? 'transaction' : 'transactions'}</span>
        </div>
        <div className="balance-card net-card">
          <span className="field-label">Net balance</span>
          <span className={`balance-value ${netBalance >= 0 ? 'net-positive' : 'net-negative'}`}>
            {netBalance >= 0 ? `+${formatWhole(netBalance)}` : `-₹ ${Math.abs(Math.round(netBalance)).toLocaleString('en-IN')}`}
          </span>
          <span className="balance-sub">Income − Expenses</span>
        </div>
      </section>

      <section className="stats-card">
        <div>
          <span className="field-label">Debits</span>
          <span className="stat-value">{debitCount}</span>
        </div>
        <div className="stat-divider" />
        <div>
          <span className="field-label">Average expense</span>
          <span className="stat-value">{formatWhole(averageDebit)}</span>
        </div>
        <div className="stat-divider" />
        <div>
          <span className="field-label">Total transactions</span>
          <span className="stat-value">{paymentCount}</span>
        </div>
      </section>

      {paymentCount === 0 ? (
        <p className="empty-state">No transactions recorded for this month.</p>
      ) : (
        <>
          <section className="section">
            <div className="section-header">
              <h2>Monthly trend</h2>
              <span className="muted">Last {TREND_MONTHS} months</span>
            </div>
            <div className="trend-legend">
              <span className="legend-item"><span className="legend-dot dot-expense" /> Expense (Debit)</span>
              <span className="legend-item"><span className="legend-dot dot-income" /> Income (Credit)</span>
            </div>
            <span className="muted">Recorded amounts · ₹ thousands</span>
            <div className="trend-chart dual-trend-chart">
              {trend.map((item) => {
                const isCurrent = item.month === monthKey;
                const debitAmount = item.debit ?? item.total ?? 0;
                const creditAmount = item.credit ?? item.total_income ?? 0;
                const debitHeight = highestTrend > 0 ? (debitAmount / highestTrend) * 100 : 0;
                const creditHeight = highestTrend > 0 ? (creditAmount / highestTrend) * 100 : 0;

                return (
                  <div key={item.month} className="trend-column">
                    <div className="trend-values-group">
                      <span className={`trend-value ${isCurrent ? 'trend-current' : ''}`}>
                        {debitAmount > 0 ? (debitAmount / 1000).toFixed(1) : ''}
                      </span>
                    </div>
                    <div className="trend-track-group">
                      <div className="trend-track">
                        <div
                          className={`trend-bar expense-bar ${isCurrent ? 'trend-bar-current' : ''}`}
                          style={{ height: `${debitHeight}%` }}
                          title={`Debit: ₹${debitAmount}`}
                        />
                      </div>
                      <div className="trend-track">
                        <div
                          className="trend-bar income-bar"
                          style={{ height: `${creditHeight}%` }}
                          title={`Credit: ₹${creditAmount}`}
                        />
                      </div>
                    </div>
                    <span className={`trend-label ${isCurrent ? 'trend-current' : ''}`}>
                      {formatMonth(item.month, { month: 'short' })}
                    </span>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="section">
            <div className="section-header">
              <h2>Expenses by category</h2>
              <span className="muted">
                {currentMonthName} {currentYear}
              </span>
            </div>
            {categories.length === 0 ? (
              <p className="empty-state">No debit expenses in this month.</p>
            ) : (
              categories.map((item) => (
                <div key={item.category} className="category-row">
                  <div className="category-top">
                    <div>
                      <p className="category-name">{item.category}</p>
                      <p className="muted">
                        {item.count} {item.count === 1 ? 'expense' : 'expenses'} · {item.share.toFixed(1)}%
                      </p>
                    </div>
                    <span className="category-amount">{formatWhole(item.total)}</span>
                  </div>
                  <div className="bar-track">
                    <div className="bar-fill" style={{ width: `${item.share}%` }} />
                  </div>
                </div>
              ))
            )}
            <div className="footer-row">
              <span className="muted">All {debitCount} debit {debitCount === 1 ? 'expense' : 'expenses'}</span>
              <span className="yellow-amount">{formatWhole(totalSpent)}</span>
            </div>
          </section>

          <section className="section">
            <div className="section-header">
              <h2>Largest expenses</h2>
              <span className="muted">
                Top {largestPayments.length} of {debitCount}
              </span>
            </div>
            {largestPayments.length === 0 ? (
              <p className="empty-state">No expenses to display.</p>
            ) : (
              largestPayments.map((payment) => (
                <div key={payment.id} className="largest-row">
                  <span className="payment-icon">{getInitial(payment.category)}</span>
                  <div className="largest-info">
                    <p className="category-name">{payment.note || payment.category}</p>
                    <p className="muted">
                      {formatShortDate(payment.payment_date)} · {payment.category}
                    </p>
                  </div>
                  <span className="category-amount">{formatWhole(payment.amount)}</span>
                  <button
                    type="button"
                    className="row-delete-btn"
                    onClick={() => openDeleteSheet(payment)}
                    aria-label="Delete payment"
                  >
                    ×
                  </button>
                </div>
              ))
            )}
            {otherDebitCount > 0 && (
              <div className="footer-row">
                <span className="muted">
                  Other {otherDebitCount} {otherDebitCount === 1 ? 'expense' : 'expenses'}
                </span>
                <span>{formatWhole(otherDebitTotal)}</span>
              </div>
            )}
          </section>
        </>
      )}

      {pendingDelete && (
        <div className="sheet-overlay" onClick={closeDeleteSheet}>
          <div className="sheet" onClick={(event) => event.stopPropagation()}>
            <h2 className="sheet-title">Delete this payment?</h2>
            <div className="sheet-details">
              <span className="sheet-amount">{formatWhole(pendingDelete.amount)}</span>
              <span className="sheet-date">{formatShortDate(pendingDelete.payment_date)} · {pendingDelete.category}</span>
            </div>
            <p className="sheet-message">It will be removed from history and analytics. This can't be undone.</p>
            {sheetError && <p className="message sheet-error">{sheetError}</p>}
            <div className="sheet-actions">
              <button
                type="button"
                className="sheet-cancel"
                onClick={closeDeleteSheet}
                disabled={isDeletingPayment}
              >
                Cancel
              </button>
              <button
                type="button"
                className="sheet-delete"
                onClick={confirmDeletePayment}
                disabled={isDeletingPayment}
              >
                {isDeletingPayment ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      <p className="footnote">Your records, at a glance.</p>
      <p className="footnote">Not a bank statement. No money is moved.</p>
    </div>
  );
}