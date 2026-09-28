import React, { useEffect, useState } from 'react';

export default function BankAccounts({ request, token, version, onImport, onSelect }) {
  const [accounts, setAccounts] = useState([]);
  const [status, setStatus] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    Promise.all([request('/bank-accounts', {}, token), request('/banks/status', {}, token)])
      .then(([result, provider]) => { if (active) { setAccounts(result.items); setStatus(provider); } })
      .catch(err => { if (active) setError(err.message); });
    return () => { active = false; };
  }, [request, token, version]);
  return <div className="bank-page">
    <section className="panel bank-intro">
      <div><div className="eyebrow">ACCOUNT CONNECTIONS</div><h2>Your bank accounts</h2><p>Keep statement history organized by account. Import a CSV statement from SBI, HDFC or another bank to start tracking its transactions.</p></div>
      <button className="primary" onClick={onImport}>↑ Import bank statement</button>
    </section>
    <section className="panel bank-connection"><div className="bank-connection-heading"><h3>Connect a live account</h3><span className="bank-status">Awaiting provider access</span></div><p>{status?.message || 'Checking Account Aggregator availability…'}</p><p className="hint">When production access is approved, account discovery and consent must take place through the provider. Importing a statement does not connect your bank or enable automatic sync.</p><button className="outline" disabled>Connect via Account Aggregator</button></section>
    {error && <div className="alert" role="alert">{error}</div>}
    <div className="section-head"><div><h2>Statement accounts</h2><p>{accounts.length} {accounts.length === 1 ? 'account' : 'accounts'} on file</p></div></div>
    {accounts.length ? <div className="bank-grid">{accounts.map(account => <article className="panel bank-card" key={account.id}><div className="bank-symbol">▣</div><div><h3>{account.nickname}</h3><p>Imported statement · No live connection</p></div><button className="outline" onClick={() => onSelect(account.id)}>View transactions →</button></article>)}</div> : <div className="panel empty"><span>▣</span><p>No bank statements yet. Import a CSV to see its transactions here.</p></div>}
  </div>;
}
