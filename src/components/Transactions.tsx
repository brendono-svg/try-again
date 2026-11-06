import { useMemo, useState } from 'react';
import type { Transaction } from '../types';
import { useAppState } from '../state';
import { filterTransactions, merchantKey, type Filter } from '../lib/analysis';
import { CATEGORIES, GROUP_LABELS, UNCATEGORISED, type CategoryGroup } from '../lib/categories';
import { formatDate } from '../lib/dates';
import { fmt } from '../lib/money';
import { accountLabel, uid, withRecategorise } from '../lib/store';

const GROUP_ORDER: CategoryGroup[] = ['needs', 'wants', 'other', 'savings', 'income', 'transfer'];

export function CategorySelect({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} aria-label={label} className="cat-select">
      {GROUP_ORDER.map((g) => (
        <optgroup key={g} label={GROUP_LABELS[g]}>
          {CATEGORIES.filter((c) => c.group === g).map((c) => (
            <option key={c.name} value={c.name}>
              {c.name}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}

/** A sensible "contains" text for a rule: the merchant name without locations / card numbers. */
export function ruleTextFor(t: Transaction): string {
  const party = (t.otherParty || t.description.split(' – ')[0]).replace(/\*{3,}\s?\d*/g, '').trim();
  const words = party.split(/\s+/).filter((w) => !/^(nzl|akl|auk|auc|auckland)$/i.test(w));
  return words.slice(0, 3).join(' ') || merchantKey(t);
}

export default function Transactions({ filter }: { filter: Filter }) {
  const { state, update } = useAppState();
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('');
  const [account, setAccount] = useState('');
  const [limit, setLimit] = useState(200);
  const [remember, setRemember] = useState(true);
  const [flash, setFlash] = useState('');

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return filterTransactions(state, filter)
      .filter((t) => (!category || t.category === category) && (!account || t.accountId === account))
      .filter((t) => !q || `${t.description} ${t.reference ?? ''} ${t.category} ${t.amount}`.toLowerCase().includes(q))
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [state, filter, query, category, account]);

  const total = rows.reduce((a, t) => a + t.amount, 0);

  const recategorise = (t: Transaction, cat: string) => {
    if (remember) {
      const contains = ruleTextFor(t);
      update((s) =>
        withRecategorise({
          ...s,
          rules: [{ id: uid('r_'), contains, category: cat, direction: t.amount < 0 ? 'out' : 'in' }, ...s.rules.filter((r) => r.contains.toLowerCase() !== contains.toLowerCase())],
          transactions: s.transactions.map((x) => (x.id === t.id ? { ...x, category: cat, categorySource: 'manual' } : x)),
        }),
      );
      setFlash(`Saved rule: “${contains}” → ${cat}. Matching transactions were updated.`);
    } else {
      update((s) => ({ ...s, transactions: s.transactions.map((x) => (x.id === t.id ? { ...x, category: cat, categorySource: 'manual' } : x)) }));
      setFlash('');
    }
  };

  const accountIds = Array.from(new Set(filterTransactions(state, { owners: filter.owners }).map((t) => t.accountId)));

  return (
    <section className="card">
      <div className="card-head wrap">
        <h2>Transactions</h2>
        <div className="row">
          <input type="search" placeholder="Search description, amount…" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search transactions" />
          <select value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Filter by category">
            <option value="">All categories</option>
            {CATEGORIES.map((c) => (
              <option key={c.name} value={c.name}>
                {c.name}
              </option>
            ))}
          </select>
          <select value={account} onChange={(e) => setAccount(e.target.value)} aria-label="Filter by account">
            <option value="">All accounts</option>
            {accountIds.map((id) => (
              <option key={id} value={id}>
                {accountLabel(state.accounts[id])}
              </option>
            ))}
          </select>
          <label className="check">
            <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} /> Remember category changes as rules
          </label>
        </div>
      </div>
      {flash && <p className="flash">{flash}</p>}
      <p className="muted small">
        {rows.length} transactions · net {fmt(total)}
        {category === '' && rows.some((t) => t.category === UNCATEGORISED) && (
          <>
            {' · '}
            <button className="link" onClick={() => setCategory(UNCATEGORISED)}>
              show uncategorised
            </button>
          </>
        )}
      </p>
      <div className="table-wrap">
        <table className="table txns">
          <thead>
            <tr>
              <th>Date</th>
              <th>Description</th>
              <th>Account</th>
              <th>Category</th>
              <th className="num">Amount</th>
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, limit).map((t) => (
              <tr key={t.id}>
                <td className="nowrap">{formatDate(t.date)}</td>
                <td>
                  <div>{t.description}</div>
                  {(t.reference || t.cardholder) && <div className="muted small">{[t.cardholder, t.reference].filter(Boolean).join(' · ')}</div>}
                </td>
                <td className="muted small">{accountLabel(state.accounts[t.accountId])}</td>
                <td>
                  <CategorySelect value={t.category} onChange={(v) => recategorise(t, v)} label={`Category for ${t.description}`} />
                  {t.categorySource === 'transfer-match' && <div className="muted small">matched transfer</div>}
                </td>
                <td className={t.amount < 0 ? 'num' : 'num pos'}>{fmt(t.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length > limit && (
        <button className="secondary" onClick={() => setLimit((l) => l + 300)}>
          Show more ({rows.length - limit} remaining)
        </button>
      )}
    </section>
  );
}
