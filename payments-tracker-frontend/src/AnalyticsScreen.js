import { useEffect, useState } from 'react';

const API_URL = 'https://payment-tracker-henna.vercel.app/api';
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

function formatFullDate(dateString) {
  return new Date(`${dateString}T00:00:00`).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function getInitial(text) {
  return (text || '?').charAt(0).toUpperCase();
}

async function requestJson(url, token, options = {}, onUnauthorized) {
  const response = await fetch(url, {
    ...options,
    headers: {
      ...(options.headers || {}),
      Authorization: `Bearer ${token}`,
    },
  });

  if (response.status === 401) {
    onUnauthorized();
    throw new Error('Session expired');
  }

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || 'Request failed');
  }

  return response.json();
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

function AccountBanner({ selectedAccount, onCycle }) {
  return (
    <button type="button" className="account-banner" onClick={onCycle} aria-label="Switch account">
      <span className="banner-square" />
      <span className="banner-text">
        <span className="banner-brand">MANN</span>
        <span className="banner-sub">
          {selectedAccount ? `${selectedAccount.type} · Payment records` : 'designer · Payment records'}
        </span>
      </span>
      <span className="banner-account">{selectedAccount ? selectedAccount.name : 'All accounts'}</span>
    </button>
  );
}

export default function AnalyticsScreen({
  accounts,
  token,
  selectedAccountId,
  onSelectAccount,
  onBack,
  onUnauthorized,
}) {
  const [monthKey, setMonthKey] = useState(getMonthKey(new Date()));
  const [analyticsAccountId, setAnalyticsAccountId] = useState(selectedAccountId ?? null);
  const [view, setView] = useState('summary');
  const [summary, setSummary] = useState(null);
  const [trend, setTrend] = useState([]);
  const [history, setHistory] = useState([]);
  const [errorMessage, setErrorMessage] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);
  const [pendingDelete, setPendingDelete] = useState(null);
  const [deleteError, setDeleteError] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);

  const selectedAccount = accounts.find((account) => account.id === analyticsAccountId) ?? null;

  useEffect(() => {
    const accountQuery = analyticsAccountId ? `&account_id=${analyticsAccountId}` : '';

    Promise.all([
      requestJson(`${API_URL}/analytics?month=${monthKey}${accountQuery}`, token, {}, onUnauthorized),
      requestJson(
        `${API_URL}/analytics/trend?month=${monthKey}&months=${TREND_MONTHS}${accountQuery}`,
        token,
        {},
        onUnauthorized
      ),
    ])
      .then(([summaryData, trendData]) => {
        setSummary(summaryData);
        setTrend(trendData);
        setErrorMessage('');
      })
      .catch((error) => {
        if (error.message !== 'Session expired') {
          setErrorMessage('Backend not reachable');
        }
      });
  }, [monthKey, analyticsAccountId, refreshKey]);

  useEffect(() => {
    if (view !== 'history') {
      return;
    }

    const accountQuery = analyticsAccountId ? `?account_id=${analyticsAccountId}` : '';

    requestJson(`${API_URL}/payments${accountQuery}`, token, {}, onUnauthorized)
      .then((data) => {
        setHistory(data);
        setErrorMessage('');
      })
      .catch((error) => {
        if (error.message !== 'Session expired') {
          setErrorMessage('Backend not reachable');
        }
      });
  }, [view, analyticsAccountId, refreshKey]);

  const cycleAccount = () => {
    const accountIds = [null, ...accounts.map((account) => account.id)];
    const currentPosition = accountIds.indexOf(analyticsAccountId);
    const nextAccountId = accountIds[(currentPosition + 1) % accountIds.length];

    setAnalyticsAccountId(nextAccountId);

    if (nextAccountId !== null && onSelectAccount) {
      onSelectAccount(nextAccountId);
    }
  };

  const getAccountName = (accountId) =>
    accounts.find((account) => account.id === accountId)?.name ?? 'No account';

  const requestDelete = (payment) => {
    setDeleteError('');
    setPendingDelete(payment);
  };

  const closeDeleteSheet = () => {
    setPendingDelete(null);
    setDeleteError('');
  };

  const confirmDelete = async () => {
    if (!pendingDelete) {
      return;
    }

    setIsDeleting(true);
    setDeleteError('');

    try {
      await requestJson(
        `${API_URL}/payments/${pendingDelete.id}`,
        token,
        { method: 'DELETE' },
        onUnauthorized
      );
      setPendingDelete(null);
      setRefreshKey((current) => current + 1);
    } catch (error) {
      if (error.message !== 'Session expired') {
        setDeleteError('Could not delete payment. Try again.');
      }
    } finally {
      setIsDeleting(false);
    }
  };

  const exportHistoryCsv = () => {
    const escapeCell = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;
    const rows = [
      ['Date', 'Account', 'Category', 'Note', 'Amount'],
      ...history.map((payment) => [
        payment.payment_date,
        getAccountName(payment.account_id),
        payment.category,
        payment.note,
        payment.amount,
      ]),
    ];
    const csvText = rows.map((row) => row.map(escapeCell).join(',')).join('\n');
    const blob = new Blob([csvText], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');

    link.href = url;
    link.download = `payments-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  if (view === 'history') {
    const historyTotal = history.reduce((sum, payment) => sum + payment.amount, 0);

    return (
      <div className="screen">
        <header className="top-bar">
          <button type="button" className="back-button" onClick={() => setView('summary')} aria-label="Back to analytics">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M19 12H5M11 6l-6 6 6 6" />
            </svg>
          </button>
          <h1>Payment history</h1>
        </header>

        <AccountBanner selectedAccount={selectedAccount} onCycle={cycleAccount} />

        {errorMessage && <p className="message">{errorMessage}</p>}

        <section className="section">
          <div className="section-header">
            <h2>All payments</h2>
            <span className="muted">
              {history.length} {history.length === 1 ? 'payment' : 'payments'}
            </span>
          </div>

          {history.length === 0 ? (
            <p className="empty-state">No payments recorded yet.</p>
          ) : (
            history.map((payment) => (
              <div key={payment.id} className="largest-row">
                <span className="payment-icon">{getInitial(payment.category)}</span>
                <div className="largest-info">
                  <p className="category-name">{payment.note || payment.category}</p>
                  <p className="muted">
                    {formatFullDate(payment.payment_date)} · {getAccountName(payment.account_id)}
                  </p>
                </div>
                <div className="history-amount-group">
                  <span className="category-amount">{formatWhole(payment.amount)}</span>
                  <button
                    type="button"
                    className="delete-payment-button"
                    onClick={() => requestDelete(payment)}
                    aria-label="Delete payment"
                  >
                    ×
                  </button>
                </div>
              </div>
            ))
          )}

          {history.length > 0 && (
            <div className="footer-row">
              <span className="muted">Total of all {history.length} payments</span>
              <span className="yellow-amount">{formatWhole(historyTotal)}</span>
            </div>
          )}
        </section>

        {history.length > 0 && (
          <button type="button" className="history-button" onClick={exportHistoryCsv}>
            Export CSV (backup)
          </button>
        )}

        <p className="footnote">Your records, at a glance.</p>
        <p className="footnote">Not a bank statement. No money is moved.</p>

        {pendingDelete && (
          <div className="sheet-overlay" onClick={closeDeleteSheet}>
            <div className="sheet" onClick={(event) => event.stopPropagation()}>
              <p className="sheet-title">Delete this payment?</p>
              <p className="muted">
                {formatWhole(pendingDelete.amount)} · {formatFullDate(pendingDelete.payment_date)}
              </p>
              <p className="muted">It will be removed from history and analytics. This can't be undone.</p>
              {deleteError && <p className="message">{deleteError}</p>}
              <div className="sheet-actions">
                <button type="button" className="sheet-cancel" onClick={closeDeleteSheet}>
                  Cancel
                </button>
                <button type="button" className="sheet-delete" onClick={confirmDelete} disabled={isDeleting}>
                  {isDeleting ? 'Deleting...' : 'Delete'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  const total = summary?.total_spent ?? 0;
  const paymentCount = summary?.payment_count ?? 0;
  const averagePayment = summary?.average_payment ?? 0;
  const previousTotal = summary?.previous_month_total ?? 0;
  const categories = summary?.categories ?? [];
  const largestPayments = summary?.largest_payments ?? [];
  const largestTotal = largestPayments.reduce((sum, payment) => sum + payment.amount, 0);
  const otherCount = paymentCount - largestPayments.length;
  const otherTotal = total - largestTotal;
  const changePercent = previousTotal > 0 ? ((total - previousTotal) / previousTotal) * 100 : null;
  const highestTrend = Math.max(...trend.map((item) => item.total), 0);
  const highestTrendItem = trend.find((item) => highestTrend > 0 && item.total === highestTrend);
  const isCurrentHighest = highestTrendItem?.month === monthKey;
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

      <AccountBanner selectedAccount={selectedAccount} onCycle={cycleAccount} />

      <section className="summary-block">
        <div className="summary-header">
          <span className="field-label">Total payments recorded</span>
          <span className="currency-tag">INR</span>
        </div>
        <RupeeTotal value={total} />
        {changePercent === null ? (
          <p className="muted">No payments recorded in {previousMonthName}</p>
        ) : (
          <>
            <p className={changePercent >= 0 ? 'trend-up' : 'trend-down'}>
              {changePercent >= 0 ? '▲' : '▼'} {Math.abs(changePercent).toFixed(1)}%{' '}
              {changePercent >= 0 ? 'more' : 'less'} than {previousMonthName}
            </p>
            <p className="muted">
              {formatWhole(Math.abs(total - previousTotal))} {total >= previousTotal ? 'more' : 'less'} ·{' '}
              {previousMonthName} total {formatWhole(previousTotal)}
            </p>
          </>
        )}
      </section>

      <section className="stats-card">
        <div>
          <span className="field-label">Payments</span>
          <span className="stat-value">{paymentCount}</span>
        </div>
        <div className="stat-divider" />
        <div>
          <span className="field-label">Average payment</span>
          <span className="stat-value">{formatWhole(averagePayment)}</span>
        </div>
      </section>

      {paymentCount === 0 ? (
        <p className="empty-state">No payments recorded for this month.</p>
      ) : (
        <>
          <section className="section">
            <div className="section-header">
              <h2>Monthly trend</h2>
              <span className="muted">Last {TREND_MONTHS} months</span>
            </div>
            <span className="muted">Recorded payments · ₹ thousands</span>
            <div className="trend-chart">
              {trend.map((item) => {
                const isCurrent = item.month === monthKey;
                const heightPercent = highestTrend > 0 ? (item.total / highestTrend) * 100 : 0;
                return (
                  <div key={item.month} className="trend-column">
                    <span className={`trend-value ${isCurrent ? 'trend-current' : ''}`}>
                      {item.total > 0 ? (item.total / 1000).toFixed(1) : ''}
                    </span>
                    <div className="trend-track">
                      <div
                        className={`trend-bar ${isCurrent ? 'trend-bar-current' : ''}`}
                        style={{ height: `${heightPercent}%` }}
                      />
                    </div>
                    <span className={`trend-label ${isCurrent ? 'trend-current' : ''}`}>
                      {formatMonth(item.month, { month: 'short' })}
                    </span>
                  </div>
                );
              })}
            </div>
            {isCurrentHighest && (
              <p className="callout">
                {currentMonthName} has the highest recorded total in this six-month view.
              </p>
            )}
          </section>

          <section className="section">
            <div className="section-header">
              <h2>By category</h2>
              <span className="muted">
                {currentMonthName} {currentYear}
              </span>
            </div>
            {categories.map((item) => (
              <div key={item.category} className="category-row">
                <div className="category-top">
                  <div>
                    <p className="category-name">{item.category}</p>
                    <p className="muted">
                      {item.count} {item.count === 1 ? 'payment' : 'payments'} · {item.share.toFixed(1)}%
                    </p>
                  </div>
                  <span className="category-amount">{formatWhole(item.total)}</span>
                </div>
                <div className="bar-track">
                  <div className="bar-fill" style={{ width: `${item.share}%` }} />
                </div>
              </div>
            ))}
            <div className="footer-row">
              <span className="muted">All {paymentCount} payments</span>
              <span className="yellow-amount">{formatWhole(total)}</span>
            </div>
          </section>

          <section className="section">
            <div className="section-header">
              <h2>Largest payments</h2>
              <span className="muted">
                Top {largestPayments.length} of {paymentCount}
              </span>
            </div>
            {largestPayments.map((payment) => (
              <div key={payment.id} className="largest-row">
                <span className="payment-icon">{getInitial(payment.category)}</span>
                <div className="largest-info">
                  <p className="category-name">{payment.note || payment.category}</p>
                  <p className="muted">
                    {formatShortDate(payment.payment_date)} · {payment.category}
                  </p>
                </div>
                <span className="category-amount">{formatWhole(payment.amount)}</span>
              </div>
            ))}
            {otherCount > 0 && (
              <div className="footer-row">
                <span className="muted">
                  Other {otherCount} {otherCount === 1 ? 'payment' : 'payments'}
                </span>
                <span>{formatWhole(otherTotal)}</span>
              </div>
            )}
          </section>
        </>
      )}

      <button type="button" className="history-button" onClick={() => setView('history')}>
        View full payment history
      </button>

      <p className="footnote">Your records, at a glance.</p>
      <p className="footnote">Not a bank statement. No money is moved.</p>
    </div>
  );
}