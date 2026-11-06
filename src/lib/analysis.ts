import type { Account, AppState, ImportRecord, Owner, Transaction } from '../types';
import { CATEGORIES, UNCATEGORISED, categoryGroup, isSpendingCategory, type CategoryGroup } from './categories';
import { daysBetween, formatDate, monthKey, monthLabel, monthRange } from './dates';
import { fmt0, round2 } from './money';

export interface Filter {
  owners: Owner[];
  accountIds?: string[];
  fromMonth?: string;
  toMonth?: string;
}

export function filterTransactions(state: AppState, f: Filter): Transaction[] {
  const owners = new Set(f.owners);
  const ids = f.accountIds && f.accountIds.length ? new Set(f.accountIds) : undefined;
  return state.transactions.filter((t) => {
    const a = state.accounts[t.accountId];
    if (!a || !owners.has(a.owner)) return false;
    if (ids && !ids.has(t.accountId)) return false;
    const m = monthKey(t.date);
    if (f.fromMonth && m < f.fromMonth) return false;
    if (f.toMonth && m > f.toMonth) return false;
    return true;
  });
}

/** Spending is positive here: money out (net of refunds) in spending categories. */
export function spendOf(t: Transaction): number {
  return isSpendingCategory(t.category) ? -t.amount : 0;
}

export interface MonthSummary {
  month: string;
  income: number;
  spending: number;
  needs: number;
  wants: number;
  other: number;
  savings: number;
  byCategory: Record<string, number>;
}

export function monthlySummaries(txns: Transaction[]): MonthSummary[] {
  const map = new Map<string, MonthSummary>();
  for (const t of txns) {
    const m = monthKey(t.date);
    let s = map.get(m);
    if (!s) {
      s = { month: m, income: 0, spending: 0, needs: 0, wants: 0, other: 0, savings: 0, byCategory: {} };
      map.set(m, s);
    }
    const g = categoryGroup(t.category);
    if (g === 'income') s.income += t.amount;
    else if (g === 'savings') s.savings += -t.amount;
    else if (g === 'needs' || g === 'wants' || g === 'other') {
      s.spending += -t.amount;
      s[g] += -t.amount;
      s.byCategory[t.category] = (s.byCategory[t.category] ?? 0) + -t.amount;
    }
  }
  const months = Array.from(map.keys()).sort();
  if (!months.length) return [];
  // Fill gaps so charts show empty months honestly.
  return monthRange(months[0], months[months.length - 1]).map(
    (m) => map.get(m) ?? { month: m, income: 0, spending: 0, needs: 0, wants: 0, other: 0, savings: 0, byCategory: {} },
  );
}

export function categoryTotals(txns: Transaction[]): Array<{ category: string; total: number; count: number }> {
  const map = new Map<string, { total: number; count: number }>();
  for (const t of txns) {
    if (!isSpendingCategory(t.category)) continue;
    const e = map.get(t.category) ?? { total: 0, count: 0 };
    e.total += -t.amount;
    e.count++;
    map.set(t.category, e);
  }
  return Array.from(map, ([category, v]) => ({ category, total: round2(v.total), count: v.count }))
    .filter((c) => c.total > 0.005)
    .sort((a, b) => b.total - a.total);
}

/** "Countdown Albany Auckland NZL" -> "countdown albany" – good enough to group merchants. */
export function merchantKey(t: Transaction): string {
  const base = (t.otherParty || t.description.split(' – ')[0] || t.description)
    .toLowerCase()
    .replace(/\*.*$/, (m) => (m.length > 3 ? '' : m))
    .replace(/\b(nzl|nz|akl|auk|auc|auckland|wellington|christchurch|ltd|limited|swe|wa|aus)\b/g, '')
    .replace(/[^a-z ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return base.split(' ').slice(0, 3).join(' ') || t.description.toLowerCase();
}

export function topMerchants(txns: Transaction[], n = 10) {
  const map = new Map<string, { name: string; total: number; count: number; category: string }>();
  for (const t of txns) {
    if (!isSpendingCategory(t.category) || t.amount >= 0) continue;
    const k = merchantKey(t);
    const e = map.get(k) ?? { name: t.otherParty || t.description.split(' – ')[0], total: 0, count: 0, category: t.category };
    e.total += -t.amount;
    e.count++;
    map.set(k, e);
  }
  return Array.from(map.values()).sort((a, b) => b.total - a.total).slice(0, n);
}

export interface Recurring {
  name: string;
  category: string;
  typicalAmount: number;
  months: number;
  perYear: number;
  lastDate: string;
}

/** Find payments that repeat most months at a similar amount – subscriptions, bills, memberships. */
export function findRecurring(txns: Transaction[]): Recurring[] {
  const groups = new Map<string, Transaction[]>();
  for (const t of txns) {
    if (t.amount >= 0 || !isSpendingCategory(t.category)) continue;
    const k = merchantKey(t);
    const list = groups.get(k) ?? [];
    list.push(t);
    groups.set(k, list);
  }
  const allMonths = new Set(txns.map((t) => monthKey(t.date)));
  const out: Recurring[] = [];
  for (const list of groups.values()) {
    const months = new Set(list.map((t) => monthKey(t.date)));
    if (months.size < 3 || months.size < allMonths.size * 0.6) continue;
    const amounts = list.map((t) => -t.amount).sort((a, b) => a - b);
    const median = amounts[Math.floor(amounts.length / 2)];
    const similar = amounts.filter((a) => Math.abs(a - median) <= Math.max(1, median * 0.1)).length;
    if (similar / amounts.length < 0.6) continue;
    const perMonth = list.length / months.size;
    if (perMonth > 2.5) continue; // daily habits (coffee) are not subscriptions
    const sorted = list.slice().sort((a, b) => a.date.localeCompare(b.date));
    out.push({
      name: sorted[sorted.length - 1].otherParty || sorted[sorted.length - 1].description.split(' – ')[0],
      category: sorted[sorted.length - 1].category,
      typicalAmount: round2(median),
      months: months.size,
      perYear: round2(median * perMonth * 12),
      lastDate: sorted[sorted.length - 1].date,
    });
  }
  return out.sort((a, b) => b.perYear - a.perYear);
}

/** Which months each account has statement coverage for. */
export function coverage(state: AppState): Array<{ account: Account; months: Set<string> }> {
  return Object.values(state.accounts).map((account) => {
    const months = new Set<string>();
    for (const imp of state.imports.filter((i) => i.accountId === account.id)) {
      if (imp.periodStart && imp.periodEnd) monthRange(monthKey(imp.periodStart), monthKey(imp.periodEnd)).forEach((m) => months.add(m));
    }
    for (const t of state.transactions) if (t.accountId === account.id) months.add(monthKey(t.date));
    return { account, months };
  });
}

function median(values: number[]): number {
  if (!values.length) return 0;
  const s = values.slice().sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/** Months with data, excluding a partial current month and partial first month where possible. */
export function completeMonths(summaries: MonthSummary[], txns: Transaction[]): string[] {
  const months = summaries.filter((s) => s.spending !== 0 || s.income !== 0).map((s) => s.month);
  if (months.length <= 2) return months;
  const dates = txns.map((t) => t.date).sort();
  const first = dates[0];
  const last = dates[dates.length - 1];
  return months.filter((m) => {
    if (m === monthKey(first) && Number(first.slice(8)) > 7) return false;
    if (m === monthKey(last) && Number(last.slice(8)) < 24) return false;
    return true;
  });
}

/**
 * Average income, spending and savings rate – measured only over months where
 * income was actually recorded, so loading just a credit card (or an old
 * salary-account statement) doesn't skew the savings rate.
 */
export function incomeVsSpending(summaries: MonthSummary[], txns: Transaction[], lookback = 6) {
  const months = new Set(completeMonths(summaries, txns));
  const withIncome = summaries.filter((s) => months.has(s.month) && s.income > 0).slice(-lookback);
  const n = withIncome.length;
  if (!n) return { months: 0, income: 0, spending: 0, needs: 0, wants: 0, rate: undefined as number | undefined };
  const avg = (k: 'income' | 'spending' | 'needs' | 'wants') => withIncome.reduce((a, s) => a + s[k], 0) / n;
  const income = avg('income');
  const spending = avg('spending');
  return { months: n, income, spending, needs: avg('needs'), wants: avg('wants'), rate: (income - spending) / income };
}

export interface BudgetSuggestion {
  category: string;
  group: CategoryGroup;
  median: number;
  average: number;
  suggested: number;
  monthsSeen: number;
}

const roundUp = (n: number, step: number) => Math.ceil(n / step) * step;

/**
 * Suggested monthly budget per category from recent history: the median month
 * (robust to one-off big purchases). Discretionary "wants" get a 10% stretch
 * target when the household isn't hitting its savings goal.
 */
export function suggestBudgets(txns: Transaction[], savingsShort: boolean, lookback = 6): BudgetSuggestion[] {
  const summaries = monthlySummaries(txns);
  const months = completeMonths(summaries, txns).slice(-lookback);
  if (!months.length) return [];
  const byMonth = new Map(summaries.map((s) => [s.month, s]));
  const out: BudgetSuggestion[] = [];
  for (const c of CATEGORIES) {
    if (!isSpendingCategory(c.name) || c.name === UNCATEGORISED) continue;
    const values = months.map((m) => Math.max(0, byMonth.get(m)?.byCategory[c.name] ?? 0));
    const seen = values.filter((v) => v > 0).length;
    if (!seen) continue;
    const med = median(values);
    const avg = values.reduce((a, b) => a + b, 0) / values.length;
    // Irregular categories (seen in < half the months) budget on the average so the money is set aside.
    let base = seen < months.length / 2 ? avg : med;
    if (savingsShort && c.group === 'wants') base *= 0.9;
    const step = base > 500 ? 50 : base > 100 ? 10 : 5;
    out.push({ category: c.name, group: c.group, median: round2(med), average: round2(avg), suggested: roundUp(base, step), monthsSeen: seen });
  }
  return out.sort((a, b) => b.suggested - a.suggested);
}

export type Severity = 'good' | 'warning' | 'serious' | 'info';

export interface Insight {
  id: string;
  severity: Severity;
  title: string;
  detail: string;
  saving?: number; // potential yearly saving
}

export function latestCardStatement(state: AppState, accountIds: Set<string>): ImportRecord | undefined {
  return state.imports
    .filter((i) => i.card && accountIds.has(i.accountId) && i.periodEnd)
    .sort((a, b) => (a.periodEnd! < b.periodEnd! ? 1 : -1))[0];
}

export function buildInsights(state: AppState, txns: Transaction[], today: string): Insight[] {
  const out: Insight[] = [];
  const target = state.settings.savingsTarget;
  const summaries = monthlySummaries(txns);
  const months = completeMonths(summaries, txns).slice(-6);
  const byMonth = new Map(summaries.map((s) => [s.month, s]));
  const recent = months.map((m) => byMonth.get(m)!).filter(Boolean);
  const n = recent.length || 1;
  const iv = incomeVsSpending(summaries, txns);
  const income = iv.income;
  const spending = iv.spending;
  const needs = iv.needs;
  const wants = iv.wants;
  const accountIds = new Set(txns.map((t) => t.accountId));
  const accounts = Array.from(accountIds).map((id) => state.accounts[id]).filter(Boolean);

  if (!txns.length) return out;

  // 1. Income visibility
  const hasIncome = income > 0;
  const onlyCards = accounts.length > 0 && accounts.every((a) => a.kind === 'credit');
  if (!hasIncome) {
    out.push({
      id: 'no-income',
      severity: 'info',
      title: onlyCards ? 'Only credit card statements are loaded' : 'No income in the recent statements',
      detail:
        'Load your everyday / salary account statements (Westpac) and the ASB accounts so the app can see income and work out a savings rate. Spending figures below only cover the accounts loaded.',
    });
  } else {
    const rate = (income - spending) / income;
    out.push({
      id: 'savings-rate',
      severity: rate >= target ? 'good' : rate >= 0 ? 'warning' : 'serious',
      title: `Savings rate ${(rate * 100).toFixed(0)}% (goal ${(target * 100).toFixed(0)}%)`,
      detail:
        rate >= target
          ? `On average you bring in ${fmt0(income)}/month and spend ${fmt0(spending)}. Keep it up – consider automating the surplus into savings or KiwiSaver on payday.`
          : rate >= 0
            ? `You bring in ${fmt0(income)}/month and spend ${fmt0(spending)}. Reaching ${(target * 100).toFixed(0)}% means trimming about ${fmt0(income * target - (income - spending))}/month.`
            : `Spending (${fmt0(spending)}/month) is more than income (${fmt0(income)}/month). Start with the biggest "wants" below and set a budget for each.`,
      saving: rate < target ? Math.max(0, income * target - (income - spending)) * 12 : undefined,
    });
    // 50/30/20
    out.push({
      id: '50-30-20',
      severity: needs / income > 0.6 || wants / income > 0.35 ? 'warning' : 'info',
      title: `Needs ${((needs / income) * 100).toFixed(0)}% · Wants ${((wants / income) * 100).toFixed(0)}% of income`,
      detail:
        'A common guide is 50% needs, 30% wants, 20% savings. ' +
        (needs / income > 0.6
          ? 'Needs are high – review insurance, power and phone plans (Powerswitch.org.nz compares power), and loan rates.'
          : wants / income > 0.35
            ? 'Wants are above 30% – that is where the easiest savings are.'
            : 'You are within the guide.'),
    });
  }

  // 2. Biggest discretionary categories
  const wantTotals = new Map<string, number>();
  for (const s of recent) for (const [c, v] of Object.entries(s.byCategory)) if (categoryGroup(c) === 'wants') wantTotals.set(c, (wantTotals.get(c) ?? 0) + v / n);
  const topWants = Array.from(wantTotals).sort((a, b) => b[1] - a[1]).slice(0, 3);
  for (const [cat, monthly] of topWants) {
    if (monthly < 50) continue;
    out.push({
      id: `want-${cat}`,
      severity: 'info',
      title: `${cat}: ${fmt0(monthly)}/month`,
      detail: `That is ${fmt0(monthly * 12)} a year. Cutting it by a quarter would free up ${fmt0(monthly * 0.25 * 12)} a year.`,
      saving: monthly * 0.25 * 12,
    });
  }

  // 3. Small frequent purchases
  const small = txns.filter((t) => t.amount < 0 && t.amount > -25 && (t.category === 'Cafes & Coffee' || t.category === 'Eating Out & Takeaways'));
  const smallMonths = new Set(small.map((t) => monthKey(t.date))).size || 1;
  if (small.length / smallMonths >= 12) {
    const total = small.reduce((a, t) => a - t.amount, 0) / smallMonths;
    out.push({
      id: 'small-buys',
      severity: 'warning',
      title: `About ${Math.round(small.length / smallMonths)} small café / food buys a month`,
      detail: `Purchases under $25 add up to ${fmt0(total)}/month (${fmt0(total * 12)}/year). Setting a weekly café allowance is an easy win.`,
      saving: total * 0.4 * 12,
    });
  }

  // 4. Subscriptions
  const recurring = findRecurring(txns).filter((r) => r.category === 'Subscriptions' || r.category === 'Hobbies & Games' || r.category === 'Personal Care & Fitness');
  if (recurring.length) {
    const total = recurring.reduce((a, r) => a + r.perYear, 0);
    out.push({
      id: 'subscriptions',
      severity: 'info',
      title: `${recurring.length} subscription${recurring.length === 1 ? '' : 's'} costing ${fmt0(total)}/year`,
      detail: recurring.map((r) => `${r.name} (${fmt0(r.typicalAmount)})`).join(', ') + '. Cancel any you have not used in the last month.',
    });
  }

  // 5. Spikes this month vs typical
  const lastMonth = months[months.length - 1];
  if (lastMonth && months.length >= 3) {
    const prior = months.slice(0, -1).map((m) => byMonth.get(m)!);
    const last = byMonth.get(lastMonth)!;
    for (const [cat, v] of Object.entries(last.byCategory)) {
      const typical = median(prior.map((s) => s.byCategory[cat] ?? 0));
      if (v > 150 && typical > 0 && v > typical * 1.6) {
        out.push({
          id: `spike-${cat}`,
          severity: 'warning',
          title: `${cat} jumped`,
          detail: `${fmt0(v)} in ${monthLabel(lastMonth)} vs a typical ${fmt0(typical)}. One-off, or something to budget for?`,
        });
      }
    }
  }

  // 6. Credit card
  const card = latestCardStatement(state, accountIds);
  if (card && card.closingBalance !== undefined && card.closingBalance < 0 && card.card?.dueDate) {
    const owed = -card.closingBalance;
    const paidSince = state.transactions
      .filter((t) => t.accountId === card.accountId && t.amount > 0 && card.periodEnd && t.date > card.periodEnd)
      .reduce((a, t) => a + t.amount, 0);
    const daysLeft = daysBetween(today, card.card.dueDate);
    const overdue = daysLeft < 0 && paidSince < owed - 0.01;
    out.push({
      id: 'card-due',
      severity: overdue ? 'serious' : daysLeft <= 7 ? 'warning' : 'info',
      title: overdue
        ? `Credit card payment of ${fmt0(owed)} was due ${formatDate(card.card.dueDate)}`
        : `Pay the credit card's ${fmt0(owed)} balance in full by ${formatDate(card.card.dueDate)}`,
      detail: overdue
        ? 'No payment covering the closing balance is in the loaded statements. If it is still unpaid, pay it now to avoid interest and late fees (check your banking app – newer payments may not be loaded yet).'
        : 'Paying the closing balance in full each month keeps purchases interest-free. Setting up a direct debit for the full closing balance makes this automatic.',
    });
  }
  const interest = txns.filter((t) => t.category === 'Fees & Interest' && t.amount < 0).reduce((a, t) => a - t.amount, 0);
  if (interest > 20) {
    out.push({
      id: 'fees',
      severity: 'warning',
      title: `${fmt0(interest)} in fees and interest`,
      detail: 'Bank fees, card interest and foreign currency fees are avoidable money – check for a fee-free account or a no-FX-fee card for overseas purchases.',
      saving: interest,
    });
  }

  // 7. Transfers to accounts that aren't loaded
  const jointOut = txns.filter((t) => t.amount < 0 && /joint|asb/i.test(t.description) && (t.category === 'Transfers' || t.category === UNCATEGORISED));
  const hasJoint = Object.values(state.accounts).some((a) => a.owner === 'joint');
  if (jointOut.length && !hasJoint) {
    const total = jointOut.reduce((a, t) => a - t.amount, 0);
    out.push({
      id: 'joint-missing',
      severity: 'info',
      title: `${fmt0(total)} sent to joint / ASB accounts that aren't loaded`,
      detail: 'Those transfers are excluded from spending. Load the ASB joint account statements to see what that money was spent on (bills, groceries, etc.).',
    });
  }

  // 8. Data quality
  const uncategorised = txns.filter((t) => t.category === UNCATEGORISED);
  if (uncategorised.length) {
    out.push({
      id: 'uncategorised',
      severity: 'info',
      title: `${uncategorised.length} transactions need a category`,
      detail: `Worth ${fmt0(uncategorised.reduce((a, t) => a - t.amount, 0))}. Categorise them on the Transactions page – tick "remember" to create a rule for next time.`,
    });
  }

  return out;
}
