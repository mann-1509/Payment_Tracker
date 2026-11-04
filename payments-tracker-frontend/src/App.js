import { useEffect, useState } from 'react';
import './App.css';
import AnalyticsScreen from './AnalyticsScreen';

const API_URL = 'https://payment-tracker-henna.vercel.app/api';
const ACCOUNT_TYPES = ['bank', 'upi', 'cash'];
const CATEGORIES = ['Food', 'Travel', 'Bills', 'Shopping', 'Other'];
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

function AccountPicker({ accounts, selectedAccountId, onSelect, onCreate, onDeleteClick }) {
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
        <div
          key={account.id}
          className={`account-row ${account.id === selectedAccountId ? 'account-row-active' : ''}`}
        >
          <button
            type="button"
            className="account-row-select"
            onClick={() => onSelect(account.id)}
          >
            <span>{account.name}</span>
            <span className="account-type">{account.type}</span>
          </button>
          <button
            type="button"
            className="account-delete-button"
            onClick={(event) => {
              event.stopPropagation();
              onDeleteClick(account);
            }}
            aria-label={`Delete ${account.name}`}
          >
            Delete
          </button>
        </div>
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

function DeleteAccountDialog({ account, paymentCount, isDeleting, errorMessage, onConfirm, onCancel }) {
  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="dialog-title">
      <div className="modal-content">
        <h2 id="dialog-title" className="modal-title">Delete Account</h2>
        <p className="modal-text">
          Delete {account.name}? This also deletes all {paymentCount} payments in it. This cannot be undone.
        </p>
        {errorMessage && <p className="message modal-error">{errorMessage}</p>}
        <div className="modal-actions">
          <button
            type="button"
            className="modal-button modal-button-cancel"
            onClick={onCancel}
            disabled={isDeleting}
          >
            Cancel
          </button>
          <button
            type="button"
            className="modal-button modal-button-danger"
            onClick={onConfirm}
            disabled={isDeleting}
          >
            {isDeleting ? 'Deleting...' : 'Delete'}
          </button>
        </div>
      </div>
    </div>
  );
}

function PinScreen({ onLoginSuccess, initialMessage }) {
  const [pin, setPin] = useState('');
  const [errorMessage, setErrorMessage] = useState(initialMessage || '');
  const [isLoading, setIsLoading] = useState(false);

  const handlePinChange = (event) => {
    const value = event.target.value.replace(/\D/g, '').slice(0, 4);
    setPin(value);
  };

  const handleUnlock = async (event) => {
    event.preventDefault();
    if (pin.length !== 4) {
      setErrorMessage('Enter a 4-digit PIN');
      return;
    }

    setIsLoading(true);
    setErrorMessage('');

    try {
      const response = await fetch(`${API_URL}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin }),
      });

      if (!response.ok) {
        setErrorMessage('Wrong PIN');
        setPin('');
        return;
      }

      const data = await response.json();
      onLoginSuccess(data.token);
    } catch (err) {
      setErrorMessage('Backend not reachable');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="screen pin-screen">
      <div className="pin-container">
        <div className="pin-brand">MANN</div>
        <h1 className="pin-title">Enter PIN</h1>
        <p className="pin-subtitle">Enter your 4-digit PIN to access your payments.</p>

        <form onSubmit={handleUnlock} className="pin-form">
          <input
            className="pin-input"
            type="password"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={4}
            placeholder="••••"
            value={pin}
            onChange={handlePinChange}
            autoFocus
          />

          {errorMessage && <p className="message pin-error">{errorMessage}</p>}

          <button type="submit" className="save-button pin-button" disabled={isLoading || pin.length !== 4}>
            <span>{isLoading ? 'Verifying...' : 'Unlock'}</span>
            <span className="plus-symbol">→</span>
          </button>
        </form>
      </div>
    </div>
  );
}

function App() {
  const [token, setToken] = useState(null);
  const [authError, setAuthError] = useState('');
  const [screen, setScreen] = useState('record');
  const [accounts, setAccounts] = useState([]);
  const [selectedAccountId, setSelectedAccountId] = useState(null);
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [transactionType, setTransactionType] = useState('debit');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState(DEFAULT_CATEGORY);
  const [paymentDate, setPaymentDate] = useState(getTodayDate());
  const [note, setNote] = useState('');
  const [message, setMessage] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const [deletingAccount, setDeletingAccount] = useState(null);
  const [deletingPaymentCount, setDeletingPaymentCount] = useState(0);
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);
  const [deleteDialogError, setDeleteDialogError] = useState('');

  const selectedAccount =
    accounts.find((account) => account.id === selectedAccountId) ?? accounts[0] ?? null;
  const dateParts = getDateParts(paymentDate);

  const handleUnauthorized = (msg = 'Session expired') => {
    setToken(null);
    setAuthError(msg);
  };

  const loadAccounts = async (authToken = token) => {
    if (!authToken) return [];
    try {
      const response = await fetch(`${API_URL}/accounts`, {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      if (response.status === 401) {
        handleUnauthorized('Session expired');
        return [];
      }
      if (!response.ok) {
        throw new Error('Failed to load accounts');
      }
      const data = await response.json();
      setAccounts(data);
      setSelectedAccountId((current) => current ?? data[0]?.id ?? null);
      return data;
    } catch (err) {
      if (token) setMessage('Backend not reachable');
      return [];
    }
  };

  useEffect(() => {
    if (token) {
      loadAccounts(token);
    }
  }, [token]);

  const onLoginSuccess = (newToken) => {
    setToken(newToken);
    setAuthError('');
    loadAccounts(newToken);
  };

  const createAccount = async (name, type) => {
    try {
      const response = await fetch(`${API_URL}/accounts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ name, type }),
      });

      if (response.status === 401) {
        handleUnauthorized('Session expired');
        return false;
      }

      if (!response.ok) {
        return false;
      }

      const createdAccount = await response.json();
      await loadAccounts(token);
      setSelectedAccountId(createdAccount.id);
      return true;
    } catch (error) {
      return false;
    }
  };

  const openDeleteDialog = async (account) => {
    setDeleteDialogError('');
    setDeletingAccount(account);
    setDeletingPaymentCount(0);

    try {
      const response = await fetch(`${API_URL}/payments?account_id=${account.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.status === 401) {
        handleUnauthorized('Session expired');
        return;
      }
      if (response.ok) {
        const payments = await response.json();
        setDeletingPaymentCount(payments.length);
      }
    } catch (err) {
      setDeletingPaymentCount(0);
    }
  };

  const confirmDeleteAccount = async () => {
    if (!deletingAccount) return;

    setIsDeletingAccount(true);
    setDeleteDialogError('');

    try {
      const response = await fetch(`${API_URL}/accounts/${deletingAccount.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.status === 401) {
        handleUnauthorized('Session expired');
        return;
      }

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to delete account');
      }

      const remainingAccounts = accounts.filter((account) => account.id !== deletingAccount.id);
      setAccounts(remainingAccounts);

      if (selectedAccountId === deletingAccount.id) {
        setSelectedAccountId(remainingAccounts[0]?.id ?? null);
      }

      setDeletingAccount(null);
    } catch (err) {
      setDeleteDialogError(err.message || 'Could not delete account');
    } finally {
      setIsDeletingAccount(false);
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
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          amount: numericAmount,
          category,
          payment_date: paymentDate,
          account_id: selectedAccount.id,
          note,
          type: transactionType,
          transaction_type: transactionType,
        }),
      });

      if (response.status === 401) {
        handleUnauthorized('Session expired');
        return;
      }

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Save failed');
      }

      setAmount('');
      setCategory(DEFAULT_CATEGORY);
      setTransactionType('debit');
      setNote('');
      setMessage(transactionType === 'credit' ? 'Credit payment recorded' : 'Debit payment recorded');
    } catch (error) {
      setMessage(error.message || 'Could not save payment');
    } finally {
      setIsSaving(false);
    }
  };

  if (!token) {
    return <PinScreen onLoginSuccess={onLoginSuccess} initialMessage={authError} />;
  }

  if (screen === 'analytics') {
    return (
      <AnalyticsScreen
        accounts={accounts}
        token={token}
        onBack={() => setScreen('record')}
        onUnauthorized={() => handleUnauthorized('Session expired')}
      />
    );
  }

  return (
    <div className="screen">
      <header className="top-bar">
        <button
          type="button"
          className="back-button"
          onClick={() => {
            setAmount('');
            setCategory(DEFAULT_CATEGORY);
            setTransactionType('debit');
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

      <section className="transaction-type-container">
        <div className="transaction-type-toggle" role="radiogroup" aria-label="Transaction Type">
          <button
            type="button"
            role="radio"
            aria-checked={transactionType === 'debit'}
            className={`type-toggle-btn debit-btn ${transactionType === 'debit' ? 'active' : ''}`}
            onClick={() => setTransactionType('debit')}
          >
            <span className="type-dot debit-dot" />
            Debit
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={transactionType === 'credit'}
            className={`type-toggle-btn credit-btn ${transactionType === 'credit' ? 'active' : ''}`}
            onClick={() => setTransactionType('credit')}
          >
            <span className="type-dot credit-dot" />
            Credit
          </button>
        </div>
      </section>

      <section className="field">
        <div className="field-header">
          <span className="field-label">{transactionType === 'credit' ? 'Income Amount' : 'Amount'}</span>
          <span className="currency-tag">INR</span>
        </div>
        <div className="amount-row">
          <span className={`rupee-symbol ${transactionType === 'credit' ? 'credit-symbol' : ''}`}>₹</span>
          <input
            className={`amount-input ${transactionType === 'credit' ? 'credit-symbol' : ''}`}
            type="text"
            inputMode="decimal"
            placeholder="0"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
          />
        </div>
      </section>

      <section className="field">
        <span className="field-label">Category</span>
        <div className="chip-row">
          {CATEGORIES.map((item) => (
            <button
              type="button"
              key={item}
              className={`chip ${category === item ? 'chip-active' : ''}`}
              onClick={() => setCategory(item)}
            >
              {item}
            </button>
          ))}
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
            onDeleteClick={openDeleteDialog}
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
          placeholder={transactionType === 'credit' ? 'What was this income for?' : 'What was this payment for?'}
          value={note}
          onChange={(event) => setNote(event.target.value)}
        />
      </section>

      {message && <p className="message">{message}</p>}

      <button type="button" className="save-button" onClick={savePayment} disabled={isSaving}>
        <span>{isSaving ? 'Saving...' : transactionType === 'credit' ? 'Save credit' : 'Save payment'}</span>
        <span className="plus-symbol">+</span>
      </button>

      <p className="footnote">
        {transactionType === 'credit'
          ? 'Recorded as incoming funds. No real money will be moved.'
          : 'For your records. No money will be moved.'}
      </p>

      {deletingAccount && (
        <DeleteAccountDialog
          account={deletingAccount}
          paymentCount={deletingPaymentCount}
          isDeleting={isDeletingAccount}
          errorMessage={deleteDialogError}
          onConfirm={confirmDeleteAccount}
          onCancel={() => setDeletingAccount(null)}
        />
      )}
    </div>
  );
}

export default App;
