import { useMemo, useState } from 'react';
import type { Owner } from '../types';
import { useAppState } from '../state';
import { completeMonths, filterTransactions, incomeVsSpending, monthlySummaries, suggestBudgets } from '../lib/analysis';
import { CATEGORIES, GROUP_LABELS, UNCATEGORISED, type CategoryGroup } from '../lib/categories';
import { monthLabel } from '../lib/dates';
import { fmt0 } from '../lib/money';

const GROUPS: CategoryGroup[] = ['needs', 'wants', 'other'];

export default function Budget({ owners, months }: { owners: Owner[]; months: string[] }) {
  const { state, update } = useAppState();
  const [month, setMonth] = useState(months[0]);
  const all = useMemo(() => filterTransactions(state, { owners }), [state, owners]);
  const summaries = useMemo(() => monthlySummaries(all), [all]);
  const full = completeMonths(summaries, all).slice(-6);
  const iv = incomeVsSpending(summaries, all);
  const avgIncome = iv.income;
  const savingsShort = iv.rate !== undefined && iv.rate < state.settings.savingsTarget;
  const suggestions = useMemo(() => suggestBudgets(all, savingsShort), [all, savingsShort]);
  const sugMap = new Map(suggestions.map((s) => [s.category, s]));
  const current = summaries.find((s) => s.month === month);

  const budgets = state.budgets;
  const totalBudget = Object.entries(budgets).reduce((a, [, v]) => a + (v || 0), 0);
  const totalSpent = current?.spending ?? 0;

  const setBudget = (cat: string, value: string) => {
    const n = Number(value);
    update((s) => {
      const b = { ...s.budgets };
      if (!value || !Number.isFinite(n) || n <= 0) delete b[cat];
      else b[cat] = Math.round(n);
      return { ...s, budgets: b };
    });
  };

  const applySuggested = () =>
    update((s) => ({ ...s, budgets: Object.fromEntries(suggestions.map((x) => [x.category, x.suggested])) }));

  const visible = CATEGORIES.filter((c) => GROUPS.includes(c.group) && c.name !== UNCATEGORISED && (sugMap.has(c.name) || budgets[c.name] || current?.byCategory[c.name]));

  return (
    <div className="stack">
      <section className="tiles">
        <div className="tile">
          <div className="tile-label">Monthly budget</div>
          <div className="tile-value">{totalBudget ? fmt0(totalBudget) : '–'}</div>
          <div className="tile-sub">{Object.keys(budgets).length} categories</div>
        </div>
        <div className="tile">
          <div className="tile-label">Typical income</div>
          <div className="tile-value">{avgIncome ? fmt0(avgIncome) : '–'}</div>
          <div className="tile-sub">{iv.months ? `average of ${iv.months} months with income` : 'load salary account statements'}</div>
        </div>
        <div className="tile">
          <div className="tile-label">Planned to save</div>
          <div className="tile-value">{avgIncome && totalBudget ? fmt0(avgIncome - totalBudget) : '–'}</div>
          <div className="tile-sub">
            {avgIncome && totalBudget ? `${Math.round(((avgIncome - totalBudget) / avgIncome) * 100)}% of income (goal ${Math.round(state.settings.savingsTarget * 100)}%)` : 'needs income data and a budget'}
          </div>
        </div>
        <div className="tile">
          <div className="tile-label">Spent in {month ? monthLabel(month) : '–'}</div>
          <div className="tile-value">{fmt0(totalSpent)}</div>
          <div className="tile-sub">{totalBudget ? `${fmt0(totalBudget - totalSpent)} left in budget` : 'set a budget to compare'}</div>
        </div>
      </section>

      <section className="card">
        <div className="card-head wrap">
          <div>
            <h2>Budget planner</h2>
            <p className="muted small">
              Suggestions are your typical (median) month over the last {full.length} full months{savingsShort ? ', with a 10% trim on "wants" because you are under your savings goal' : ''}. Edit any figure. Leave it blank to skip that category.
            </p>
          </div>
          <div className="row">
            <select value={month} onChange={(e) => setMonth(e.target.value)} aria-label="Compare month">
              {months.map((m) => (
                <option key={m} value={m}>
                  Compare: {monthLabel(m)}
                </option>
              ))}
            </select>
            <button className="primary" onClick={applySuggested} disabled={!suggestions.length}>
              Use suggested budgets
            </button>
          </div>
        </div>

        <div className="table-wrap">
          <table className="table budget">
            <thead>
              <tr>
                <th>Category</th>
                <th className="num">Typical</th>
                <th className="num">Suggested</th>
                <th className="num">Budget</th>
                <th className="num">Spent</th>
                <th className="progress-col">Progress</th>
              </tr>
            </thead>
            {GROUPS.map((g) => {
              const rows = visible.filter((c) => c.group === g);
              if (!rows.length) return null;
              const gBudget = rows.reduce((a, c) => a + (budgets[c.name] ?? 0), 0);
              const gSpent = rows.reduce((a, c) => a + (current?.byCategory[c.name] ?? 0), 0);
              return (
                <tbody key={g}>
                  <tr className="group-row">
                    <th colSpan={3}>{GROUP_LABELS[g]}</th>
                    <th className="num">{gBudget ? fmt0(gBudget) : ''}</th>
                    <th className="num">{fmt0(gSpent)}</th>
                    <th />
                  </tr>
                  {rows.map((c) => {
                    const sug = sugMap.get(c.name);
                    const spent = current?.byCategory[c.name] ?? 0;
                    const b = budgets[c.name];
                    const pct = b ? spent / b : 0;
                    return (
                      <tr key={c.name}>
                        <td>
                          {c.name}
                          {c.hint && <div className="muted small">{c.hint}</div>}
                        </td>
                        <td className="num muted">{sug ? fmt0(sug.median || sug.average) : '–'}</td>
                        <td className="num">
                          {sug ? (
                            <button className="link" onClick={() => setBudget(c.name, String(sug.suggested))} title="Use this">
                              {fmt0(sug.suggested)}
                            </button>
                          ) : (
                            '–'
                          )}
                        </td>
                        <td className="num">
                          <input
                            className="money-input"
                            type="number"
                            min={0}
                            step={10}
                            inputMode="numeric"
                            aria-label={`Budget for ${c.name}`}
                            value={b ?? ''}
                            placeholder="–"
                            onChange={(e) => setBudget(c.name, e.target.value)}
                          />
                        </td>
                        <td className="num">{fmt0(spent)}</td>
                        <td className="progress-col">
                          {b ? (
                            <div className="progress" aria-label={`${Math.round(pct * 100)}% of budget used`}>
                              <span className={pct > 1 ? 'fill over' : pct > 0.85 ? 'fill near' : 'fill'} style={{ width: `${Math.min(100, pct * 100)}%` }} />
                              <em>{pct > 1 ? `Over by ${fmt0(spent - b)}` : `${fmt0(b - spent)} left`}</em>
                            </div>
                          ) : null}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              );
            })}
          </table>
        </div>
      </section>

      <section className="card">
        <h2>How to use this budget</h2>
        <ul className="tips">
          <li>
            <strong>Pay yourself first.</strong> On payday, automatically move your savings goal ({Math.round(state.settings.savingsTarget * 100)}% of income
            {avgIncome ? `, about ${fmt0(avgIncome * state.settings.savingsTarget)}/month` : ''}) into a savings account before spending starts.
          </li>
          <li>
            <strong>Fund the joint account to the budget.</strong> Add up the shared categories (groceries, power, internet, insurance, mortgage/rent) and each pay an agreed share into the ASB joint account by automatic payment.
          </li>
          <li>
            <strong>Give "wants" a weekly allowance.</strong> Cafés, takeaways and shopping are easier to control as a weekly amount on a separate card or account.
          </li>
          <li>
            <strong>Set aside money for irregular bills.</strong> Rego, WOF, insurance renewals and car servicing are spread into monthly amounts above. Move that into a "bills" savings account.
          </li>
          <li>
            <strong>Review monthly.</strong> Import the new statements, recategorise anything odd, and check the progress bars.
          </li>
        </ul>
      </section>
    </div>
  );
}
