import { useState } from 'react';
import { useAppState } from '../state';
import { emptyState, mergeBackup, normaliseState, withRecategorise } from '../lib/store';
import { todayIso } from '../lib/dates';
import { CategorySelect } from './Transactions';

export default function SettingsPage() {
  const { state, update } = useAppState();
  const [names, setNames] = useState(state.settings.householdNames.join(', '));
  const [msg, setMsg] = useState('');
  const s = state.settings;

  const saveNames = () =>
    update((st) =>
      withRecategorise({
        ...st,
        settings: { ...st.settings, householdNames: names.split(',').map((n) => n.trim()).filter(Boolean) },
      }),
    );

  const exportData = () => {
    const blob = new Blob([JSON.stringify(state)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `household-budget-backup-${todayIso()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const importData = async (file: File, mode: 'merge' | 'replace') => {
    try {
      const incoming = normaliseState(JSON.parse(await file.text()));
      update((st) => (mode === 'replace' ? incoming : mergeBackup(st, incoming)));
      setMsg(mode === 'replace' ? 'Backup restored.' : `Merged ${incoming.transactions.length} transactions from the backup (duplicates skipped).`);
    } catch (e) {
      setMsg(`Could not read that file: ${e instanceof Error ? e.message : e}`);
    }
  };

  return (
    <div className="stack">
      <section className="card">
        <h2>Household</h2>
        <div className="form-grid">
          <label>
            Your name (shown in filters)
            <input defaultValue={s.meLabel} onBlur={(e) => update((st) => ({ ...st, settings: { ...st.settings, meLabel: e.target.value.trim() || 'Me' } }))} />
          </label>
          <label>
            Partner's name
            <input defaultValue={s.partnerLabel} onBlur={(e) => update((st) => ({ ...st, settings: { ...st.settings, partnerLabel: e.target.value.trim() || 'Partner' } }))} />
          </label>
          <label>
            Savings goal (% of income)
            <input
              type="number"
              min={0}
              max={80}
              defaultValue={Math.round(s.savingsTarget * 100)}
              onBlur={(e) => update((st) => ({ ...st, settings: { ...st.settings, savingsTarget: Math.min(0.8, Math.max(0, Number(e.target.value) / 100 || 0)) } }))}
            />
          </label>
          <label className="span2">
            Household names: payments to or from these count as transfers, not spending or income
            <input value={names} onChange={(e) => setNames(e.target.value)} onBlur={saveNames} placeholder="e.g. Liv, Rees, Orr" />
            <span className="muted small">Comma separated. Useful when you pay each other between Westpac and ASB.</span>
          </label>
        </div>
      </section>

      <section className="card">
        <h2>Category rules</h2>
        <p className="muted small">Rules you create on the Transactions page. They are checked before the built-in rules, top to bottom.</p>
        {state.rules.length === 0 ? (
          <p className="muted">No rules yet. Change a transaction's category with "Remember" ticked to add one.</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>When the description contains</th>
                <th>Applies to</th>
                <th>Category</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {state.rules.map((r) => (
                <tr key={r.id}>
                  <td>
                    <input
                      defaultValue={r.contains}
                      aria-label="Rule text"
                      onBlur={(e) => update((st) => withRecategorise({ ...st, rules: st.rules.map((x) => (x.id === r.id ? { ...x, contains: e.target.value } : x)) }))}
                    />
                  </td>
                  <td className="small">{r.direction === 'in' ? 'Money in' : r.direction === 'out' ? 'Money out' : 'Both'}</td>
                  <td>
                    <CategorySelect
                      value={r.category}
                      label="Rule category"
                      onChange={(v) => update((st) => withRecategorise({ ...st, rules: st.rules.map((x) => (x.id === r.id ? { ...x, category: v } : x)) }))}
                    />
                  </td>
                  <td>
                    <button className="link danger" onClick={() => update((st) => withRecategorise({ ...st, rules: st.rules.filter((x) => x.id !== r.id) }))}>
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <button className="secondary" onClick={() => update((st) => withRecategorise({ ...st, transactions: st.transactions.map((t) => (t.categorySource === 'manual' ? { ...t, categorySource: 'default' } : t)) }))}>
          Reset manual category changes
        </button>
      </section>

      <section className="card">
        <h2>Backup &amp; sharing</h2>
        <p className="muted small">
          Your data is stored only in this browser. Export a backup file to keep it safe, or to share with your partner: they can <em>merge</em> it into their copy. Duplicates are skipped, so you can each import your own bank's statements and swap backups.
        </p>
        <div className="row">
          <button className="primary" onClick={exportData}>
            Export backup
          </button>
          <label className="secondary file-btn">
            Merge a backup…
            <input type="file" accept=".json" onChange={(e) => e.target.files?.[0] && importData(e.target.files[0], 'merge')} />
          </label>
          <label className="secondary file-btn">
            Restore (replace everything)…
            <input type="file" accept=".json" onChange={(e) => e.target.files?.[0] && confirm('Replace all current data with this backup?') && importData(e.target.files[0], 'replace')} />
          </label>
          <button className="link danger" onClick={() => confirm('Delete ALL accounts, transactions, rules and budgets from this browser?') && update(() => emptyState())}>
            Delete all data
          </button>
        </div>
        {msg && <p className="flash">{msg}</p>}
      </section>
    </div>
  );
}
