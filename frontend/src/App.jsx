import { useEffect, useMemo, useState } from 'react';
import { io } from 'socket.io-client';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000';
const socket = io(API_BASE_URL, { transports: ['websocket', 'polling'] });

function shortAddress(value = '') {
  if (!value) return '-';
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}

function formatNumber(value, digits = 6) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '-';
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits,
  }).format(Number(value));
}

function relativeTime(iso) {
  const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

export default function App() {
  const [walletInput, setWalletInput] = useState('');
  const [wallets, setWallets] = useState([]);
  const [buys, setBuys] = useState([]);
  const [selectedWallet, setSelectedWallet] = useState('ALL');
  const [minSolFilter, setMinSolFilter] = useState('0');
  const [status, setStatus] = useState('Connecting…');
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    fetch(`${API_BASE_URL}/api/wallets`)
      .then((res) => res.json())
      .then((data) => setWallets(data.wallets || []))
      .catch(() => setMessage('Could not load wallets.'));

    fetch(`${API_BASE_URL}/api/buys/history`)
      .then((res) => res.json())
      .then((data) => setBuys(data.buys || []))
      .catch(() => setMessage('Could not load history.'));
  }, []);

  useEffect(() => {
    socket.on('connect', () => setStatus('Live'));
    socket.on('disconnect', () => setStatus('Disconnected'));
    socket.on('bootstrap', (payload) => {
      setWallets(payload.wallets || []);
      setBuys(payload.buys || []);
    });
    socket.on('wallets:updated', (nextWallets) => setWallets(nextWallets || []));
    socket.on('buy:new', (buy) => {
      setBuys((current) => [buy, ...current.filter((item) => item.id !== buy.id)]);
    });

    return () => {
      socket.off('connect');
      socket.off('disconnect');
      socket.off('bootstrap');
      socket.off('wallets:updated');
      socket.off('buy:new');
    };
  }, []);

  const filteredBuys = useMemo(() => {
    return buys.filter((buy) => {
      const walletMatch = selectedWallet === 'ALL' || buy.wallet === selectedWallet;
      const solMatch = Number(buy.solSpent || 0) >= Number(minSolFilter || 0);
      return walletMatch && solMatch;
    });
  }, [buys, selectedWallet, minSolFilter]);

  async function addWallet(event) {
    event.preventDefault();
    const wallet = walletInput.trim();
    if (!wallet) return;

    setSubmitting(true);
    setMessage('');

    try {
      const response = await fetch(`${API_BASE_URL}/api/wallets/add`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wallet }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to add wallet');
      setWallets(data.wallets || []);
      setWalletInput('');
      setMessage(data.syncResult?.message || 'Wallet added.');
    } catch (error) {
      setMessage(error.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function removeWallet(wallet) {
    setMessage('');
    try {
      const response = await fetch(`${API_BASE_URL}/api/wallets/remove`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wallet }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to remove wallet');
      setWallets(data.wallets || []);
      if (selectedWallet === wallet) setSelectedWallet('ALL');
      setMessage(data.syncResult?.message || 'Wallet removed.');
    } catch (error) {
      setMessage(error.message);
    }
  }

  return (
    <div className="page">
      <header className="hero">
        <div>
          <p className="eyebrow">Solana wallet tracker</p>
          <h1>Live Buy Dashboard</h1>
          <p className="subtext">
            Paste wallet addresses, track only buys, and jump straight to the Dexscreener chart.
          </p>
        </div>
        <div className={`status ${status === 'Live' ? 'status-live' : ''}`}>{status}</div>
      </header>

      <section className="panel">
        <form className="wallet-form" onSubmit={addWallet}>
          <input
            value={walletInput}
            onChange={(e) => setWalletInput(e.target.value)}
            placeholder="Paste Solana wallet address"
          />
          <button type="submit" disabled={submitting}>
            {submitting ? 'Adding…' : 'Track Wallet'}
          </button>
        </form>
        {message ? <p className="message">{message}</p> : null}
      </section>

      <section className="grid">
        <div className="panel">
          <div className="panel-header">
            <h2>Tracked wallets</h2>
            <span>{wallets.length}</span>
          </div>
          <div className="wallet-list">
            {wallets.length ? (
              wallets.map((wallet) => (
                <div className="wallet-item" key={wallet}>
                  <div>
                    <div className="wallet-full">{wallet}</div>
                    <div className="wallet-short">{shortAddress(wallet)}</div>
                  </div>
                  <button className="danger" onClick={() => removeWallet(wallet)}>
                    Remove
                  </button>
                </div>
              ))
            ) : (
              <p className="empty">No wallets added yet.</p>
            )}
          </div>
        </div>

        <div className="panel">
          <div className="panel-header">
            <h2>Filters</h2>
          </div>
          <label className="field">
            <span>Wallet</span>
            <select value={selectedWallet} onChange={(e) => setSelectedWallet(e.target.value)}>
              <option value="ALL">All wallets</option>
              {wallets.map((wallet) => (
                <option key={wallet} value={wallet}>
                  {shortAddress(wallet)}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Minimum SOL spent</span>
            <input value={minSolFilter} onChange={(e) => setMinSolFilter(e.target.value)} />
          </label>
          <div className="stats">
            <div className="stat-card">
              <span>Total buys shown</span>
              <strong>{filteredBuys.length}</strong>
            </div>
            <div className="stat-card">
              <span>Latest wallet count</span>
              <strong>{wallets.length}</strong>
            </div>
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <h2>Live buys</h2>
          <span>{filteredBuys.length} rows</span>
        </div>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Time</th>
                <th>Wallet</th>
                <th>Token</th>
                <th>Amount</th>
                <th>SOL Spent</th>
                <th>Price</th>
                <th>Chart</th>
              </tr>
            </thead>
            <tbody>
              {filteredBuys.length ? (
                filteredBuys.map((buy) => (
                  <tr key={buy.id}>
                    <td title={buy.timestamp}>{relativeTime(buy.timestamp)}</td>
                    <td title={buy.wallet}>{shortAddress(buy.wallet)}</td>
                    <td>
                      <div className="token-cell">
                        <strong>{buy.tokenSymbol}</strong>
                        <span>{buy.tokenName}</span>
                        <code>{shortAddress(buy.tokenAddress)}</code>
                      </div>
                    </td>
                    <td>{formatNumber(buy.tokenAmount)}</td>
                    <td>{formatNumber(buy.solSpent, 4)}</td>
                    <td>{buy.priceUsd ? `$${formatNumber(buy.priceUsd, 8)}` : '-'}</td>
                    <td>
                      <a href={buy.chartUrl} target="_blank" rel="noreferrer">
                        Open
                      </a>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="7" className="empty-row">
                    No buy activity yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
