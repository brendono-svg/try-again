import { useMemo, useState } from 'react';
import { useAppState } from '../state';
import {
  buildInsights,
  categoryTotals,
  completeMonths,
  filterTransactions,
  monthlySummaries,
  topMerchants,
  type Filter,
  incomeVsSpending,
  type Insight,
  type MonthSummary,
} from '../lib/analysis';
import { formatDate, todayIso } from '../lib/dates';
import { fmt, fmt0 } from '../lib/money';
import { BarList, MonthlyChart } from './charts';
import { accountLabel } from '../lib/store';

const SEVERITY_ICON: Record<Insight['severity'], string> = { good: '✓', warning: '!', serious: '!!', info: 'i' };
const SEVERITY_LABEL: Record<Insight['severity'], string> = { good: 'On track', warning: 'Watch', serious: 'Act now', info: 'Tip' };

export default function Dashboard({ filter, onGo }: { filter: Filter; onGo: (tab: string) => void }) {
  const { state } = useAppState();
  const txns = useMemo(() => filterTransactions(state, filter), [state, filter]);
  // Insights look at the whole history for this view (not just the selected period).
  const allForView = useMemo(() => filterTransactions(state, { owners: filter.owners }), [state, filter.owners]);
  const summaries = useMemo(() => monthlySummaries(txns), [txns]);
  const cats = useMemo(() => categoryTotals(txns), [txns]);
  const merchants = useMemo(() => topMerchants(txns, 8), [txns]);
  const insights = useMemo(() => buildInsights(state, allForView, todayIso()), [state, allForView]);
  const [showTable, setShowTable] = useState(false);

  const months = completeMonths(summaries, txns);
  const nMonths = Math.max(months.length, 1);
  const inMonths = summaries.filter((s) => months.includes(s.month));
  const spending = inMonths.reduce((a, s) => a + s.spending, 0);
  const totalSpent = summaries.reduce((a, s) => a + s.spending, 0);
  const iv = incomeVsSpending(summaries, txns, 120);
  const chartData = useMemo(() => collapseGaps(summaries), [summaries]);
  const dates = txns.map((t) => t.date).sort();
  const accounts = new Set(txns.map((t) => t.accountId));

  if (!txns.length) {
    return <p className="card muted">No transactions for this selection. Try "Household" or a longer period.</p>;
  }

  return (
    <div className="grid">
      <section className="tiles" aria-label="Summary">
        <div className="tile">
          <div className="tile-label">Spent</div>
          <div className="tile-value">{fmt0(totalSpent)}</div>
          <div className="tile-sub">
            {formatDate(dates[0])} – {formatDate(dates[dates.length - 1])}
          </div>
        </div>
        <div className="tile">
          <div className="tile-label">Average spend / month</div>
          <div className="tile-value">{fmt0(spending / nMonths)}</div>
          <div className="tile-sub">over {nMonths} full month{nMonths === 1 ? '' : 's'}</div>
        </div>
        <div className="tile">
          <div className="tile-label">Average income / month</div>
          <div className="tile-value">{iv.months ? fmt0(iv.income) : '–'}</div>
          <div className="tile-sub">{iv.months ? `over ${iv.months} month${iv.months === 1 ? '' : 's'} with income` : 'load your salary account'}</div>
        </div>
        <div className="tile">
          <div className="tile-label">Savings rate</div>
          <div className="tile-value">{iv.rate === undefined ? '–' : `${Math.round(iv.rate * 100)}%`}</div>
          <div className="tile-sub">goal {Math.round(state.settings.savingsTarget * 100)}%{iv.months ? ' · months with income only' : ''}</div>
        </div>
      </section>

      <section className="card span2">
        <div className="card-head">
          <h2>Spending by month</h2>
          <button className="link" onClick={() => setShowTable((v) => !v)}>
            {showTable ? 'Show chart' : 'Show table'}
          </button>
        </div>
        {showTable ? (
          <table className="table">
            <thead>
              <tr>
                <th>Month</th>
                <th className="num">Income</th>
                <th className="num">Needs</th>
                <th className="num">Wants</th>
                <th className="num">Other</th>
                <th className="num">Total spent</th>
              </tr>
            </thead>
            <tbody>
              {summaries.map((s) => (
                <tr key={s.month}>
                  <td>{s.month}</td>
                  <td className="num">{fmt0(s.income)}</td>
                  <td className="num">{fmt0(s.needs)}</td>
                  <td className="num">{fmt0(s.wants)}</td>
                  <td className="num">{fmt0(s.other)}</td>
                  <td className="num">{fmt0(s.spending)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <MonthlyChart data={chartData} />
        )}
        <p className="muted small">
          Covers {accounts.size} account{accounts.size === 1 ? '' : 's'}: {Array.from(accounts).map((id) => accountLabel(state.accounts[id])).join(', ')}. Transfers between your own accounts and credit card repayments are left out so nothing is counted twice.
        </p>
      </section>

      <section className="card">
        <div className="card-head">
          <h2>What to do next</h2>
          <button className="link" onClick={() => onGo('budget')}>
            Budget planner →
          </button>
        </div>
        <ul className="insights">
          {insights.map((i) => (
            <li key={i.id} className={`insight ${i.severity}`}>
              <span className="badge" aria-label={SEVERITY_LABEL[i.severity]}>
                {SEVERITY_ICON[i.severity]}
              </span>
              <div>
                <div className="insight-title">
                  {i.title} <span className="sev-label">{SEVERITY_LABEL[i.severity]}</span>
                </div>
                <div className="insight-detail">{i.detail}</div>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="card">
        <h2>Where the money went</h2>
        <BarList rows={cats.slice(0, 14).map((c) => ({ label: c.category, value: c.total, sub: `${c.count} transactions` }))} />
        {cats.length > 14 && <p className="muted small">+ {cats.length - 14} smaller categories</p>}
      </section>

      <section className="card span2">
        <h2>Top merchants</h2>
        <table className="table">
          <thead>
            <tr>
              <th>Merchant</th>
              <th>Category</th>
              <th className="num">Visits</th>
              <th className="num">Total</th>
            </tr>
          </thead>
          <tbody>
            {merchants.map((m) => (
              <tr key={m.name}>
                <td>{m.name}</td>
                <td className="muted">{m.category}</td>
                <td className="num">{m.count}</td>
                <td className="num">{fmt(m.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}

/** Drop long runs of empty months (e.g. a single old statement years before the rest). */
function collapseGaps(data: MonthSummary[]): MonthSummary[] {
  const empty = (s: MonthSummary) => s.income === 0 && s.spending === 0 && s.savings === 0;
  const out: MonthSummary[] = [];
  for (let i = 0; i < data.length; ) {
    if (!empty(data[i])) {
      out.push(data[i++]);
      continue;
    }
    let j = i;
    while (j < data.length && empty(data[j])) j++;
    if (j - i <= 2) out.push(...data.slice(i, j));
    i = j;
  }
  return out;
}
