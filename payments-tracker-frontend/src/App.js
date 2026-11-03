import { useEffect, useState } from 'react';
import './App.css';
import AnalyticsScreen from './AnalyticsScreen';

const API_URL = '/api';
const ACCOUNT_TYPES = ['bank', 'upi', 'cash'];
const DEFAULT_CATEGORY = 'Other';

function getTodayDate() {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getDateParts(dateString) {
  const date = new Date(`${dateString}T00:00:00`);
  return {
    weekday: date.toLocaleDateString('en-US', { weekday: 'short' }),
    dayAndMonth: date.toLocaleDateString('en-US', { day: 'numeric', month: 'short' }),
  };
}

function AccountCard({ account, isOpen, onToggle }) {
  return (
    <button type="button" className="account-card" onClick={onToggle} aria-expanded={isOpen}>
      <div className="card-square" />
      <div className="card-star" />
      <div className="card-brand">MANN</div>
      <div className="card-role">designer</div>
      <div className="card-bank">{account ? account.name : 'Add account'}</div>
      <svg className={`card-chevron ${isOpen ? 'card-chevron-open' : ''}`} viewBox="0 0 24 24" aria-hidden="true">
        <path d="M6 9l6 6 6-6" />
      </svg>
    </button>
  );
}

function AccountPicker({ accounts, selectedAccountId, onSelect, onCreate }) {
  const [newName, setNewName] = useState('');
  const [newType, setNewType] = useState('bank');
  const [isAdding, setIsAdding] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const submitNewAccount = async () => {
    const trimmedName = newName.trim();

    if (!trimmedName) {
      setErrorMessage('Enter an account name');
      return;
    }

    const wasCreated = await onCreate(trimmedName, newType);

    if (wasCreated) {
      setNewName('');
      setNewType('bank');
      setErrorMessage('');
      setIsAdding(false);
    } else {
      setErrorMessage('Could not add account');
    }
  };

  return (
    <div className="account-picker">
      {accounts.map((account) => (
        <button
          key={account.id}
          type="button"
          className={`account-option ${account.id === selectedAccountId ? 'account-option-active' : ''}`}
          onClick={() => onSelect(account.id)}
        >
          <span>{account.name}</span>
          <span className="account-type">{account.type}</span>
        </button>
      ))}

      {isAdding ? (
        <div className="new-account-form">
          <input
            className="text-input"
            type="text"
            placeholder="Account name, e.g. SBI"
            value={newName}
            onChange={(event) => setNewName(event.target.value)}
          />
          <div className="chip-row">
            {ACCOUNT_TYPES.map((type) => (
              <button
                type="button"
                key={type}
                className={`chip ${newType === type ? 'chip-active' : ''}`}
                onClick={() => setNewType(type)}
              >
                {type}
              </button>
            ))}
          </div>
          {errorMessage && <p className="message">{errorMessage}</p>}
          <button type="button" className="secondary-button" onClick={submitNewAccount}>
            Save account
          </button>
        </div>
      ) : (
        <button type="button" className="account-option add-option" onClick={() => setIsAdding(true)}>
          + Add account
        </button>
      )}
    </div>
  );
}

function App() {
  const [screen, setScreen] = useState('record');
  const [accounts, setAccounts] = useState([]);
  const [selectedAccountId, setSelectedAccountId] = useState(null);
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [amount, setAmount] = useState('');
  const [paymentDate, setPaymentDate] = useState(getTodayDate());
  const [note, setNote] = useState('');
  const [message, setMessage] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const selectedAccount =
    accounts.find((account) => account.id === selectedAccountId) ?? accounts[0] ?? null;
  const dateParts = getDateParts(paymentDate);

  const loadAccounts = async () => {
    const response = await fetch(`${API_URL}/accounts`);
    const data = await response.json();
    setAccounts(data);
    setSelectedAccountId((current) => current ?? data[0]?.id ?? null);
    return data;
  };

  useEffect(() => {
    loadAccounts().catch(() => setMessage('Backend not reachable'));
  }, []);

  const createAccount = async (name, type) => {
    try {
      const response = await fetch(`${API_URL}/accounts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, type }),
      });

      if (!response.ok) {
        return false;
      }

      const createdAccount = await response.json();
      await loadAccounts();
      setSelectedAccountId(createdAccount.id);
      return true;
    } catch (error) {
      return false;
    }
  };

  const savePayment = async () => {
    const numericAmount = Number(amount);

    if (!numericAmount || numericAmount <= 0) {
      setMessage('Enter an amount greater than 0');
      return;
    }

    if (!selectedAccount) {
      setMessage('Add an account first');
      return;
    }

    setIsSaving(true);
    setMessage('');

    try {
      const response = await fetch(`${API_URL}/payments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: numericAmount,
          category: DEFAULT_CATEGORY,
          payment_date: paymentDate,
          account_id: selectedAccount.id,
          note,
        }),
      });

      if (!response.ok) {
        throw new Error('Save failed');
      }

      setAmount('');
      setNote('');
      setMessage('Payment recorded');
    } catch (error) {
      setMessage('Could not save payment');
    } finally {
      setIsSaving(false);
    }
  };

  if (screen === 'analytics') {
    return <AnalyticsScreen accounts={accounts} onBack={() => setScreen('record')} />;
  }

  return (
    <div className="screen">
      <header className="top-bar">
        <button
          type="button"
          className="back-button"
          onClick={() => {
            setAmount('');
            setNote('');
            setMessage('');
          }}
          aria-label="Clear form"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M19 12H5M11 6l-6 6 6 6" />
          </svg>
        </button>
        <h1>Record payment</h1>
        <button type="button" className="analytics-link" onClick={() => setScreen('analytics')}>
          Analytics
        </button>
      </header>

      <section className="field">
        <div className="field-header">
          <span className="field-label">Amount</span>
          <span className="currency-tag">INR</span>
        </div>
        <div className="amount-row">
          <span className="rupee-symbol">₹</span>
          <input
            className="amount-input"
            type="text"
            inputMode="decimal"
            placeholder="0"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
          />
        </div>
      </section>

      <section className="field">
        <span className="field-label">Account</span>
        <AccountCard
          account={selectedAccount}
          isOpen={isPickerOpen}
          onToggle={() => setIsPickerOpen(!isPickerOpen)}
        />
        {isPickerOpen && (
          <AccountPicker
            accounts={accounts}
            selectedAccountId={selectedAccount?.id}
            onSelect={(accountId) => {
              setSelectedAccountId(accountId);
              setIsPickerOpen(false);
            }}
            onCreate={createAccount}
          />
        )}
      </section>

      <section className="input-tile date-tile">
        <span className="tile-label">Date</span>
        <div className="tile-value">
          <span className="weekday">{dateParts.weekday}</span>, {dateParts.dayAndMonth}
        </div>
        <svg className="calendar-icon" viewBox="0 0 24 24" aria-hidden="true">
          <rect x="3" y="5" width="18" height="16" rx="2" />
          <path d="M3 10h18M8 3v4M16 3v4" />
        </svg>
        <input
          type="date"
          className="date-picker"
          value={paymentDate}
          onChange={(event) => setPaymentDate(event.target.value)}
          aria-label="Select date"
        />
      </section>

      <section className="input-tile">
        <label className="tile-label" htmlFor="note-input">
          Note <span className="optional">/ Optional</span>
        </label>
        <input
          id="note-input"
          className="note-input"
          type="text"
          placeholder="What was this payment for?"
          value={note}
          onChange={(event) => setNote(event.target.value)}
        />
      </section>

      {message && <p className="message">{message}</p>}

      <button type="button" className="save-button" onClick={savePayment} disabled={isSaving}>
        <span>{isSaving ? 'Saving...' : 'Save payment'}</span>
        <span className="plus-symbol">+</span>
      </button>

      <p className="footnote">For your records. No money will be moved.</p>
    </div>
  );
}

export default App;