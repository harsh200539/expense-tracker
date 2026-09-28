import React, { useMemo, useState } from 'react';
import { guessColumns, mapStatement, parseCsv } from './bankCsv.js';

export default function BankImport({ onClose, onImport, currency }) {
  const [statement, setStatement] = useState(null);
  const [mapping, setMapping] = useState({ date: '-1', title: '-1', debit: '-1', credit: '-1', amount: '-1' });
  const [account, setAccount] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const preview = useMemo(() => {
    if (!statement) return null;
    try { return mapStatement(statement.rows, mapping); } catch (err) { return { mapped: [], rejected: [], error: err.message }; }
  }, [statement, mapping]);
  async function chooseFile(event) {
    setError(''); setStatement(null);
    const file = event.target.files?.[0]; if (!file) return;
    if (file.size > 2_000_000) { setError('Use a CSV smaller than 2 MB.'); return; }
    try { const parsed = parseCsv(await file.text()); setStatement(parsed); setMapping(guessColumns(parsed.headers)); }
    catch (err) { setError(err.message); }
  }
  async function submit(event) {
    event.preventDefault(); setError('');
    if (!preview?.mapped.length || preview.rejected.length || preview.error) { setError('Check your column mapping and fix invalid rows before importing.'); return; }
    setBusy(true);
    try { await onImport(account.trim(), preview.mapped); onClose(); }
    catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }
  const field = (label, key) => <label key={key}>{label}<select value={mapping[key]} onChange={e => setMapping({ ...mapping, [key]: e.target.value })}><option value="-1">Not used</option>{statement.headers.map((header, i) => <option key={i} value={String(i)}>{header}</option>)}</select></label>;
  return <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget && !busy) onClose(); }}><div className="modal import-modal" role="dialog" aria-modal="true" aria-labelledby="import-heading"><div className="modal-top"><div><div className="eyebrow">BANK STATEMENT</div><h2 id="import-heading">Import transactions</h2></div><button className="close" aria-label="Close" disabled={busy} onClick={onClose}>×</button></div><p className="hint">Export a CSV statement from your bank and select it here. This is a manual import, not a live bank connection. Never enter your banking password or OTP here.</p><form onSubmit={submit}><label>Account nickname<input required maxLength="60" placeholder="e.g. Main account" value={account} onChange={e => setAccount(e.target.value)}/></label><label>Bank statement CSV<input required={!statement} type="file" accept=".csv,text/csv" onChange={chooseFile}/></label>{statement && <><div className="import-fields">{field('Date', 'date')}{field('Description', 'title')}{field('Money out / debit', 'debit')}{field('Money in / credit', 'credit')}{field('Signed amount (optional)', 'amount')}</div><p className="hint">Dates: YYYY-MM-DD or DD/MM/YYYY. For a single amount column, negative means expense and positive means income. Imported categories start as “Other”.</p>{preview?.error ? <div className="alert">{preview.error}</div> : <div className="import-preview"><strong>{preview?.mapped.length || 0} ready to import</strong><span>{preview?.rejected.length ? `Invalid CSV lines: ${preview.rejected.slice(0, 8).join(', ')}${preview.rejected.length > 8 ? '…' : ''}` : 'Review the first rows before saving.'}</span>{preview?.mapped.slice(0, 5).map((row, i) => <div className="import-preview-row" key={i}><span>{row.date} · {row.title}</span><strong>{row.type === 'expense' ? '−' : '+'}{new Intl.NumberFormat('en-IN', { style: 'currency', currency }).format(row.amount)}</strong></div>)}</div>}</>}{error && <div className="alert" role="alert">{error}</div>}<div className="modal-actions"><button type="button" className="outline" disabled={busy} onClick={onClose}>Cancel</button><button className="primary" disabled={busy || !preview?.mapped.length || !!preview?.rejected.length || !!preview?.error}>{busy ? 'Importing…' : 'Import statement'}</button></div></form></div></div>;
}
