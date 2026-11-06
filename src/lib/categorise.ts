import type { Account, CategorySource, ParsedTransaction, Settings, Transaction, UserRule } from '../types';
import { BUILT_IN_RULES, CARD_PAYMENT, TRANSFER, UNCATEGORISED } from './categories';
import { daysBetween } from './dates';

export interface CategoryResult {
  category: string;
  source: CategorySource;
}

function digitsOnly(s: string): string {
  return s.replace(/\D/g, '');
}

/** Account-number fragments that identify the household's own accounts inside descriptions. */
export function ownAccountKeys(accounts: Account[]): string[] {
  const keys: string[] = [];
  for (const a of accounts) {
    const d = digitsOnly(a.number);
    // Bank-branch-account-suffix: match on branch+account (the bank prefix is often dropped).
    if (d.length >= 13) keys.push(d.slice(2, 13));
    else if (d.length >= 8) keys.push(d);
  }
  return keys;
}

export function matchText(t: ParsedTransaction): string {
  return `${t.description} ${t.otherParty ?? ''}`.toLowerCase().replace(/\s+/g, ' ').trim();
}

export function categorise(
  t: ParsedTransaction,
  rules: UserRule[],
  settings: Settings,
  ownKeys: string[],
): CategoryResult {
  const text = matchText(t);
  const dir = t.amount < 0 ? 'out' : 'in';

  for (const rule of rules) {
    if (rule.direction && rule.direction !== dir) continue;
    if (rule.contains && text.includes(rule.contains.toLowerCase())) return { category: rule.category, source: 'user-rule' };
  }

  // Money moving to/from another of our own accounts.
  const digits = digitsOnly(text);
  if (digits.length >= 8 && ownKeys.some((k) => digits.includes(k))) {
    return { category: /loan/.test(text) ? 'Loan Repayments' : TRANSFER, source: 'rule' };
  }
  for (const name of settings.householdNames) {
    const n = name.trim().toLowerCase();
    if (n.length >= 3 && new RegExp(`\\b${n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(text)) {
      return { category: TRANSFER, source: 'rule' };
    }
  }

  for (const rule of BUILT_IN_RULES) {
    if (rule.direction && rule.direction !== dir) continue;
    if (rule.re.test(text)) return { category: rule.category, source: 'rule' };
  }
  return { category: dir === 'in' ? 'Other Income' : UNCATEGORISED, source: 'default' };
}

/** Re-run categorisation on everything not manually set. */
export function recategoriseAll(
  txns: Transaction[],
  rules: UserRule[],
  settings: Settings,
  accounts: Account[],
): Transaction[] {
  const keys = ownAccountKeys(accounts);
  const out = txns.map((t) => {
    if (t.categorySource === 'manual') return t;
    const res = categorise(t, rules, settings, keys);
    return { ...t, category: res.category, categorySource: res.source };
  });
  return matchTransfers(out);
}

const TRANSFERABLE = new Set([UNCATEGORISED, 'Other Income', TRANSFER, CARD_PAYMENT, 'Cash Withdrawals']);

/**
 * Pair up money leaving one household account with the same amount arriving in
 * another within a few days – e.g. a payment from Westpac Everyday showing up as
 * "Payment Received" on the credit card, or a transfer into the ASB joint account.
 * Both sides become transfers so they don't count as spending or income.
 */
export function matchTransfers(txns: Transaction[]): Transaction[] {
  const result = txns.slice();
  const incoming = new Map<string, number[]>();
  result.forEach((t, i) => {
    if (t.amount > 0 && t.categorySource !== 'manual' && t.categorySource !== 'user-rule' && TRANSFERABLE.has(t.category)) {
      const key = t.amount.toFixed(2);
      const list = incoming.get(key) ?? [];
      list.push(i);
      incoming.set(key, list);
    }
  });
  const used = new Set<number>();
  result.forEach((t, i) => {
    if (t.amount >= 0 || t.categorySource === 'manual' || t.categorySource === 'user-rule' || !TRANSFERABLE.has(t.category)) return;
    const candidates = incoming.get((-t.amount).toFixed(2));
    if (!candidates) return;
    let best = -1;
    let bestGap = Infinity;
    for (const j of candidates) {
      if (used.has(j)) continue;
      const other = result[j];
      if (other.accountId === t.accountId) continue;
      const gap = daysBetween(t.date, other.date);
      if (gap >= -1 && gap <= 4 && Math.abs(gap) < bestGap) {
        best = j;
        bestGap = Math.abs(gap);
      }
    }
    if (best >= 0) {
      used.add(best);
      const other = result[best];
      const cat = other.category === CARD_PAYMENT || t.category === CARD_PAYMENT ? CARD_PAYMENT : TRANSFER;
      result[i] = { ...t, category: cat, categorySource: t.category === cat ? t.categorySource : 'transfer-match' };
      result[best] = { ...other, category: cat, categorySource: other.category === cat ? other.categorySource : 'transfer-match' };
    }
  });
  return result;
}
