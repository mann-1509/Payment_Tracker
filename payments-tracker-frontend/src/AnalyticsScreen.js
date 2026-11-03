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

export default function AnalyticsScreen({ accounts, onBack }) {
  const [monthKey, setMonthKey] = useState(getMonthKey(new Date()));
  const [accountIndex, setAccountIndex] = useState(-1);
  const [summary, setSummary] = useState(null);
  const [trend, setTrend] = useState([]);
  const [errorMessage, setErrorMessage] = useState('');

  const selectedAccount = accountIndex >= 0 ? accounts[accountIndex] : null;
  const selectedAccountId = selectedAccount?.id ?? null;

  useEffect(() => {
    const accountQuery = selectedAccountId ? `&account_id=${selectedAccountId}` : '';

    Promise.all([
      fetch(`${API_URL}/analytics?month=${monthKey}${accountQuery}`).then((response) => response.json()),
      fetch(`${API_URL}/analytics/trend?month=${monthKey}&months=${TREND_MONTHS}${accountQuery}`).then((response) =>
        response.json()
      ),
    ])
      .then(([summaryData, trendData]) => {
        setSummary(summaryData);
        setTrend(trendData);
        setErrorMessage('');
      })
      .catch(() => setErrorMessage('Backend not reachable'));
  }, [monthKey, selectedAccountId]);

  const cycleAccount = () => {
    setAccountIndex((current) => (current + 1 >= accounts.length ? -1 : current + 1));
  };

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

      <p className="footnote">Your records, at a glance.</p>
      <p className="footnote">Not a bank statement. No money is moved.</p>
    </div>
  );
}