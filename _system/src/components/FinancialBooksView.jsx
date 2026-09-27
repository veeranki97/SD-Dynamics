import { useState, useEffect, useMemo } from 'react';
import { getAllJournals, saveJournal } from '../store';
import { formatCurrency } from '../utils';
import {
  trialBalance, balanceSheet, computeTradingPnL, siteWisePnL,
  woWisePnL,
  periodCloseJournal, bankBalance, lockMonth, unlockMonth, isMonthLocked,
} from '../utils/ledger';
import { toast } from './Toast';
import { downloadCsv, printHtmlTable } from '../utils/exportData';

export default function FinancialBooksView() {
  const [journals, setJournals] = useState([]);
  const [tab, setTab] = useState('tb'); // tb | bs | pnl | site | lock
  const [asOf, setAsOf] = useState(new Date().toISOString().slice(0, 10));
  const [from, setFrom] = useState(() => {
    const y = new Date().getFullYear();
    const m = new Date().getMonth();
    return m >= 3 ? `${y}-04-01` : `${y - 1}-04-01`;
  });
  const [lockMonthKey, setLockMonthKey] = useState(() => {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
  });

  const load = () => getAllJournals().then(setJournals).catch(() => toast('Failed to load journals', 'error'));
  useEffect(() => { load(); }, []);

  const tb = useMemo(() => trialBalance(journals, asOf), [journals, asOf]);
  const bs = useMemo(() => balanceSheet(journals, asOf), [journals, asOf]);
  const pnl = useMemo(() => computeTradingPnL(journals, from, asOf), [journals, from, asOf]);
  const sites = useMemo(() => siteWisePnL(journals, from, asOf), [journals, from, asOf]);
  const wos = useMemo(() => (typeof woWisePnL === 'function' ? woWisePnL(journals, from, asOf) : []), [journals, from, asOf]);
  const bank = useMemo(() => bankBalance(journals, 'Bank') + bankBalance(journals, 'Cash'), [journals]);

  const runPeriodClose = async () => {
    const j = periodCloseJournal(journals, asOf);
    if (!j) return toast('Nothing to close (P&L ~ 0)', 'info');
    if (!confirm(`Post period-close journal for ${asOf}? Net P&L: ${j.entries[0].debit || j.entries[0].credit}`)) return;
    try {
      await saveJournal(j);
      toast('Period close posted to Retained Earnings', 'success');
      load();
    } catch (e) {
      toast(e.message || 'Close failed', 'error');
    }
  };

  const tabs = [
    { id: 'tb', label: 'Trial Balance' },
    { id: 'bs', label: 'Balance Sheet' },
    { id: 'pnl', label: 'P&L' },
    { id: 'site', label: 'Site-wise P&L' },
    { id: 'wo', label: 'WO-wise P&L' },
    { id: 'lock', label: 'Period Lock' },
  ];

  return (
    <div className="page">
      <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
        <div>
          <h2 style={{ margin: 0 }}>Financial Books</h2>
          <p className="page-subtitle" style={{ margin: 0 }}>
            GL-backed statements · Bank+Cash: <strong>{formatCurrency(bank)}</strong>
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <label style={{ fontSize: 13 }}>From</label>
          <input type="date" className="form-input" style={{ width: 140 }} value={from} onChange={e => setFrom(e.target.value)} />
          <label style={{ fontSize: 13 }}>As of</label>
          <input type="date" className="form-input" style={{ width: 140 }} value={asOf} onChange={e => setAsOf(e.target.value)} />
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => {
            if (tab === 'tb') downloadCsv('trial-balance.csv', tb, ['account', 'debit', 'credit', 'balance']);
            else if (tab === 'pnl') downloadCsv('pnl.csv', [pnl], ['sales', 'purchases', 'expenses', 'grossProfit', 'netProfit']);
            else if (tab === 'site' || tab === 'wo') downloadCsv('site-pnl.csv', sites, ['site', 'income', 'expense', 'profit']);
          }}>Export CSV</button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
        {tabs.map(t => (
          <button key={t.id} type="button"
            className={`btn btn-sm ${tab === t.id ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setTab(t.id)}>{t.label}</button>
        ))}
      </div>

      {tab === 'tb' && (
        <table className="data-table" style={{ width: '100%' }}>
          <thead>
            <tr><th>Account</th><th className="text-end">Debit</th><th className="text-end">Credit</th><th className="text-end">Balance (Dr-Cr)</th></tr>
          </thead>
          <tbody>
            {tb.map(r => (
              <tr key={r.account}>
                <td>{r.account}</td>
                <td className="text-end">{r.debit ? formatCurrency(r.debit) : '—'}</td>
                <td className="text-end">{r.credit ? formatCurrency(r.credit) : '—'}</td>
                <td className="text-end">{formatCurrency(r.balance)}</td>
              </tr>
            ))}
            {tb.length === 0 && (
              <tr><td colSpan={4} style={{ textAlign: 'center', color: '#94a3b8' }}>
                No journal postings yet. Save a Tax Invoice to auto-post Dr Debtors / Cr Sales + GST.
              </td></tr>
            )}
            {tb.length > 0 && (
              <tr style={{ fontWeight: 700, background: '#f8fafc' }}>
                <td>Total</td>
                <td className="text-end">{formatCurrency(tb.reduce((s, r) => s + r.debit, 0))}</td>
                <td className="text-end">{formatCurrency(tb.reduce((s, r) => s + r.credit, 0))}</td>
                <td className="text-end">{formatCurrency(tb.reduce((s, r) => s + r.balance, 0))}</td>
              </tr>
            )}
          </tbody>
        </table>
      )}

      {tab === 'bs' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div className="glass-panel p-4">
            <h3>Assets</h3>
            <ul style={{ listStyle: 'none', padding: 0 }}>
              {bs.assets.map(a => (
                <li key={a.account} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}>
                  <span>{a.account}</span><span>{formatCurrency(a.amount)}</span>
                </li>
              ))}
            </ul>
            <div style={{ fontWeight: 700, borderTop: '1px solid #e2e8f0', paddingTop: 8 }}>
              Total Assets: {formatCurrency(bs.totalAssets)}
            </div>
          </div>
          <div className="glass-panel p-4">
            <h3>Liabilities & Equity</h3>
            <ul style={{ listStyle: 'none', padding: 0 }}>
              {[...bs.liabilities, ...bs.equity].map(a => (
                <li key={a.account} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}>
                  <span>{a.account}</span><span>{formatCurrency(a.amount)}</span>
                </li>
              ))}
            </ul>
            <div style={{ fontWeight: 700, borderTop: '1px solid #e2e8f0', paddingTop: 8 }}>
              Total L+E: {formatCurrency(bs.totalLiabilitiesAndEquity)}
            </div>
            <p style={{ fontSize: 12, color: '#64748b', marginTop: 8 }}>
              Net profit (YTD logic): {formatCurrency(bs.netProfit)}
            </p>
          </div>
        </div>
      )}

      {tab === 'pnl' && (
        <div className="glass-panel p-4" style={{ maxWidth: 480 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Sales</span><strong>{formatCurrency(pnl.sales)}</strong></div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Direct costs / purchases</span><span>{formatCurrency(pnl.purchases)}</span></div>
          <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid #e2e8f0', marginTop: 8, paddingTop: 8 }}>
            <span>Gross profit</span><strong>{formatCurrency(pnl.grossProfit)}</strong>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Indirect expenses</span><span>{formatCurrency(pnl.expenses)}</span></div>
          <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '2px solid #0f172a', marginTop: 8, paddingTop: 8, fontSize: '1.1rem' }}>
            <span>Net profit</span><strong style={{ color: pnl.netProfit >= 0 ? '#059669' : '#dc2626' }}>{formatCurrency(pnl.netProfit)}</strong>
          </div>
          <button type="button" className="btn btn-primary" style={{ marginTop: 16 }} onClick={runPeriodClose}>
            Period close → Retained Earnings
          </button>
        </div>
      )}

      {tab === 'site' && (
        <table className="data-table" style={{ width: '100%' }}>
          <thead><tr><th>Site</th><th className="text-end">Income</th><th className="text-end">Expense</th><th className="text-end">Profit</th></tr></thead>
          <tbody>
            {(tab === 'wo' ? wos : sites).map(s => (
              <tr key={s.site}>
                <td>{s.site}</td>
                <td className="text-end">{formatCurrency(s.income)}</td>
                <td className="text-end">{formatCurrency(s.expense)}</td>
                <td className="text-end">{formatCurrency(s.profit)}</td>
              </tr>
            ))}
            {sites.length === 0 && <tr><td colSpan={4} style={{ textAlign: 'center', color: '#94a3b8' }}>Tag site on invoices/expenses to see site-wise P&L</td></tr>}
          </tbody>
        </table>
      )}

      {tab === 'lock' && (
        <div className="glass-panel p-4" style={{ maxWidth: 420 }}>
          <p style={{ fontSize: 14, color: '#64748b' }}>
            Lock a month to block edits (uses local period lock). Combine with freeze-days for audit control.
          </p>
          <input className="form-input" value={lockMonthKey} onChange={e => setLockMonthKey(e.target.value)} placeholder="YYYY-MM" />
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button type="button" className="btn btn-primary" onClick={() => { lockMonth(lockMonthKey); toast(`Locked ${lockMonthKey}`, 'success'); }}>Lock month</button>
            <button type="button" className="btn btn-secondary" onClick={() => { unlockMonth(lockMonthKey); toast(`Unlocked ${lockMonthKey}`, 'success'); }}>Unlock</button>
          </div>
          <p style={{ marginTop: 12, fontSize: 13 }}>
            Status for {lockMonthKey}: <strong>{isMonthLocked(lockMonthKey + '-01') ? 'LOCKED' : 'Open'}</strong>
          </p>
          <div className="form-group" style={{ marginTop: 16 }}>
            <label className="form-label">Freeze after N days (0 = off)</label>
            <input type="number" className="form-input" defaultValue={localStorage.getItem('fgsb_freeze_days') || '0'}
              onBlur={e => { localStorage.setItem('fgsb_freeze_days', String(Number(e.target.value) || 0)); toast('Freeze days saved', 'success'); }} />
          </div>
        </div>
      )}
    </div>
  );
}
