import { useMemo } from 'react';
import type { Account, AccountKind, Owner } from '../types';
import { useAppState } from '../state';
import { coverage } from '../lib/analysis';
import { formatDate, monthLabel, monthRange } from '../lib/dates';
import { fmt } from '../lib/money';
import { accountLabel, mergeAccounts, removeAccount, removeImport, withRecategorise } from '../lib/store';

const KINDS: Array<[AccountKind, string]> = [
  ['transaction', 'Everyday / transaction'],
  ['savings', 'Savings'],
  ['credit', 'Credit card'],
  ['loan', 'Loan / mortgage'],
  ['other', 'Other'],
];

export default function Accounts() {
  const { state, update } = useAppState();
  const accounts = Object.values(state.accounts).sort((a, b) => a.bank.localeCompare(b.bank) || a.number.localeCompare(b.number));
  const cov = useMemo(() => coverage(state), [state]);
  const allMonths = useMemo(() => {
    const ms = cov.flatMap((c) => Array.from(c.months)).sort();
    return ms.length ? monthRange(ms[0], ms[ms.length - 1]).slice(-18) : [];
  }, [cov]);

  const patch = (id: string, p: Partial<Account>) =>
    update((s) => withRecategorise({ ...s, accounts: { ...s.accounts, [id]: { ...s.accounts[id], ...p } } }));

  const ownerName = (o: Owner) => (o === 'me' ? state.settings.meLabel : o === 'partner' ? state.settings.partnerLabel : 'Joint');

  return (
    <div className="stack">
      <section className="card">
        <h2>Accounts</h2>
        <p className="muted small">Set who each account belongs to. The Overview can then show you, your partner, joint accounts, or the whole household.</p>
        <div className="accounts">
          {accounts.map((a) => {
            const txns = state.transactions.filter((t) => t.accountId === a.id);
            const imports = state.imports.filter((i) => i.accountId === a.id).sort((x, y) => (x.periodEnd ?? '').localeCompare(y.periodEnd ?? ''));
            const latest = imports[imports.length - 1];
            return (
              <article key={a.id} className="account">
                <header>
                  <div>
                    <div className="acct-title">{accountLabel(a)}</div>
                    <div className="muted small">
                      {a.bank} · {a.number}
                      {a.holder ? ` · ${a.holder}` : ''} · {txns.length} transactions
                    </div>
                  </div>
                  {latest?.closingBalance !== undefined && (
                    <div className="acct-bal">
                      <div className="num">{fmt(latest.closingBalance)}</div>
                      <div className="muted small">at {latest.periodEnd ? formatDate(latest.periodEnd) : 'last statement'}</div>
                    </div>
                  )}
                </header>
                <div className="acct-fields">
                  <label>
                    Belongs to
                    <select value={a.owner} onChange={(e) => patch(a.id, { owner: e.target.value as Owner })}>
                      {(['me', 'partner', 'joint'] as Owner[]).map((o) => (
                        <option key={o} value={o}>
                          {ownerName(o)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Type
                    <select value={a.kind} onChange={(e) => patch(a.id, { kind: e.target.value as AccountKind })}>
                      {KINDS.map(([k, l]) => (
                        <option key={k} value={k}>
                          {l}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Nickname
                    <input defaultValue={a.nickname ?? ''} placeholder={accountLabel({ ...a, nickname: undefined })} onBlur={(e) => patch(a.id, { nickname: e.target.value.trim() || undefined })} />
                  </label>
                  {accounts.length > 1 && (
                    <label>
                      Merge into
                      <select
                        value=""
                        onChange={(e) => {
                          const into = e.target.value;
                          if (into && confirm(`Move all transactions from "${accountLabel(a)}" into "${accountLabel(state.accounts[into])}"?`)) {
                            update((s) => withRecategorise(mergeAccounts(s, a.id, into)));
                          }
                        }}
                      >
                        <option value="">—</option>
                        {accounts
                          .filter((o) => o.id !== a.id)
                          .map((o) => (
                            <option key={o.id} value={o.id}>
                              {accountLabel(o)}
                            </option>
                          ))}
                      </select>
                    </label>
                  )}
                </div>
                {latest?.card?.dueDate && (
                  <p className="small">
                    Latest statement: {fmt(-(latest.closingBalance ?? 0))} owing, due {formatDate(latest.card.dueDate)}
                    {latest.card.creditLimit ? ` · limit ${fmt(latest.card.creditLimit)}` : ''}
                  </p>
                )}
                <details>
                  <summary>
                    {imports.length} statement{imports.length === 1 ? '' : 's'} imported
                  </summary>
                  <table className="table">
                    <tbody>
                      {imports.map((i) => (
                        <tr key={i.id}>
                          <td className="small">{i.fileName}</td>
                          <td className="small nowrap">
                            {i.periodStart ? formatDate(i.periodStart) : '?'} – {i.periodEnd ? formatDate(i.periodEnd) : '?'}
                          </td>
                          <td className="small">{i.reconciled === true ? <span className="ok">✓ balanced</span> : i.reconciled === false ? <span className="warn">! check</span> : ''}</td>
                          <td className="small num">{i.added} txns</td>
                          <td>
                            <button className="link danger" onClick={() => confirm(`Remove ${i.fileName} and its ${i.added} transactions?`) && update((s) => removeImport(s, i.id))}>
                              Remove
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <button className="link danger" onClick={() => confirm(`Delete ${accountLabel(a)} and all its transactions?`) && update((s) => removeAccount(s, a.id))}>
                    Delete account
                  </button>
                </details>
              </article>
            );
          })}
        </div>
      </section>

      {allMonths.length > 0 && (
        <section className="card">
          <h2>Statement coverage</h2>
          <p className="muted small">Filled squares mean that month is loaded. Gaps make totals look lower than they really are, so fill them for accurate budgets.</p>
          <div className="table-wrap">
            <table className="coverage">
              <thead>
                <tr>
                  <th />
                  {allMonths.map((m) => (
                    <th key={m} scope="col">
                      {monthLabel(m)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {cov.map(({ account, months }) => (
                  <tr key={account.id}>
                    <th scope="row">{accountLabel(account)}</th>
                    {allMonths.map((m) => (
                      <td key={m}>
                        <span className={months.has(m) ? 'cov on' : 'cov'} aria-label={months.has(m) ? 'loaded' : 'missing'} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
