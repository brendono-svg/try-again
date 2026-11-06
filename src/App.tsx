import { useMemo, useState } from 'react';
import type { Owner } from './types';
import { StateProvider, useAppState } from './state';
import { monthKey, monthLabel, monthRange } from './lib/dates';
import type { Filter } from './lib/analysis';
import Dashboard from './components/Dashboard';
import Budget from './components/Budget';
import Transactions from './components/Transactions';
import ImportPage from './components/ImportPage';
import Accounts from './components/Accounts';
import SettingsPage from './components/SettingsPage';

type Tab = 'dashboard' | 'budget' | 'transactions' | 'import' | 'accounts' | 'settings';

const TABS: Array<[Tab, string]> = [
  ['dashboard', 'Overview'],
  ['budget', 'Budget'],
  ['transactions', 'Transactions'],
  ['import', 'Import'],
  ['accounts', 'Accounts'],
  ['settings', 'Settings'],
];

export type Period = 'last3' | 'last6' | 'last12' | 'all' | string;

function Shell() {
  const { state, ready } = useAppState();
  const [tab, setTab] = useState<Tab>('dashboard');
  const [view, setView] = useState<'household' | Owner>('household');
  const [period, setPeriod] = useState<Period>('last6');

  const months = useMemo(() => {
    const dates = state.transactions.map((t) => t.date).sort();
    if (!dates.length) return [];
    return monthRange(monthKey(dates[0]), monthKey(dates[dates.length - 1])).reverse();
  }, [state.transactions]);

  const filter: Filter = useMemo(() => {
    const owners: Owner[] = view === 'household' ? ['me', 'partner', 'joint'] : [view];
    if (!months.length || period === 'all') return { owners };
    const latest = months[0];
    if (period.startsWith('last')) {
      const n = Number(period.slice(4));
      return { owners, fromMonth: months[Math.min(n, months.length) - 1], toMonth: latest };
    }
    return { owners, fromMonth: period, toMonth: period };
  }, [view, period, months]);

  const hasData = state.transactions.length > 0;
  const showFilters = hasData && (tab === 'dashboard' || tab === 'transactions' || tab === 'budget');

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="logo" aria-hidden>
            $
          </span>
          <span>Household Budget</span>
        </div>
        <nav className="tabs" aria-label="Sections">
          {TABS.map(([id, label]) => (
            <button key={id} className={tab === id ? 'tab active' : 'tab'} onClick={() => setTab(id)} aria-current={tab === id ? 'page' : undefined}>
              {label}
            </button>
          ))}
        </nav>
      </header>

      {showFilters && (
        <div className="filters" role="group" aria-label="Filters">
          <div className="seg" role="radiogroup" aria-label="Whose money">
            {(['household', 'me', 'partner', 'joint'] as const).map((v) => (
              <button key={v} role="radio" aria-checked={view === v} className={view === v ? 'on' : ''} onClick={() => setView(v)}>
                {v === 'household' ? 'Household' : v === 'me' ? state.settings.meLabel : v === 'partner' ? state.settings.partnerLabel : 'Joint'}
              </button>
            ))}
          </div>
          {tab !== 'budget' && (
            <select value={period} onChange={(e) => setPeriod(e.target.value)} aria-label="Period">
              <option value="last3">Last 3 months</option>
              <option value="last6">Last 6 months</option>
              <option value="last12">Last 12 months</option>
              <option value="all">All time</option>
              <optgroup label="Single month">
                {months.map((m) => (
                  <option key={m} value={m}>
                    {monthLabel(m)}
                  </option>
                ))}
              </optgroup>
            </select>
          )}
        </div>
      )}

      <main>
        {!ready ? (
          <p className="muted">Loading…</p>
        ) : !hasData && tab !== 'import' && tab !== 'settings' ? (
          <Welcome onImport={() => setTab('import')} />
        ) : tab === 'dashboard' ? (
          <Dashboard filter={filter} onGo={(t) => setTab(t as Tab)} />
        ) : tab === 'budget' ? (
          <Budget owners={filter.owners} months={months} />
        ) : tab === 'transactions' ? (
          <Transactions filter={filter} />
        ) : tab === 'import' ? (
          <ImportPage onDone={() => setTab('dashboard')} />
        ) : tab === 'accounts' ? (
          <Accounts />
        ) : (
          <SettingsPage />
        )}
      </main>
      <footer className="foot muted">Everything stays in this browser. Nothing is uploaded. Use Settings → Export to back up or share with your partner.</footer>
    </div>
  );
}

function Welcome({ onImport }: { onImport: () => void }) {
  return (
    <section className="card welcome">
      <h1>Track spending across Westpac and ASB</h1>
      <p>Load statements for your accounts, your partner's accounts and your joint accounts. The app reads them on this device, sorts every transaction into a category, spots transfers between your own accounts, and suggests a budget.</p>
      <ol>
        <li>
          <strong>Westpac:</strong> statement PDFs from Westpac One (everyday, savings and credit card), or CSV / OFX exports.
        </li>
        <li>
          <strong>ASB:</strong> CSV or OFX exports from internet banking (Accounts → Export), or statement PDFs.
        </li>
        <li>Mark each account as yours, your partner's or joint, then look at the Overview and Budget pages.</li>
      </ol>
      <button className="primary" onClick={onImport}>
        Import statements
      </button>
    </section>
  );
}

export default function App() {
  return (
    <StateProvider>
      <Shell />
    </StateProvider>
  );
}
