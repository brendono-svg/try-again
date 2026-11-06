import type { AccountKind, Bank, ParsedStatement } from '../../types';
import { findDates, parseFullDate } from '../dates';
import { parseMoney, round2 } from '../money';

export function detectBank(text: string, fileName = ''): Bank {
  const t = `${text}\n${fileName}`;
  if (/westpac/i.test(t)) return 'Westpac';
  if (/\bASB\b|ASB Bank|asb\.co\.nz/i.test(t)) return 'ASB';
  // NZ bank prefix: 03 = Westpac, 12 = ASB.
  const num = t.match(/\b(\d{2})[- ]\d{4}[- ]\d{7}[- ]\d{2,3}\b/);
  if (num?.[1] === '03') return 'Westpac';
  if (num?.[1] === '12') return 'ASB';
  return 'Other';
}

/** NZ bank account number, normalised to BB-bbbb-AAAAAAA-SS(S). */
export function findAccountNumber(text: string): string | undefined {
  const labelled = text.match(/Account (?:number|no\.?)\s*:?\s*(\d{2}[- ]?\d{4}[- ]?\d{7}[- ]?\d{2,3})\b/i);
  const any = labelled ?? text.match(/\b(\d{2}[- ]\d{4}[- ]\d{7}[- ]\d{2,3})\b/);
  if (any) {
    const d = any[1].replace(/\D/g, '');
    return `${d.slice(0, 2)}-${d.slice(2, 6)}-${d.slice(6, 13)}-${d.slice(13)}`;
  }
  const card = text.match(/(?:Account|Card) (?:number|no\.?)\s*:?\s*((?:\d{4}[ -]?){2,3}\d{2,4})\b/i);
  if (card) return card[1].replace(/\s+/g, ' ').replace(/-/g, ' ').trim();
  return undefined;
}

export function findLabelledMoney(text: string, label: RegExp): number | undefined {
  const re = new RegExp(`(?:${label.source})\\s*:?\\s*(\\(?-?\\$?\\s?[\\d,]+\\.\\d{2}\\)?-?)(\\s*(?:CR|DR|OD)\\b)?`, 'i');
  const m = text.match(re);
  if (!m) return undefined;
  const v = parseMoney(m[1]);
  if (v === undefined) return undefined;
  const flag = (m[2] ?? '').trim().toUpperCase();
  if (flag === 'OD' || flag === 'DR') return -Math.abs(v);
  if (flag === 'CR') return Math.abs(v);
  return v;
}

export interface Period {
  start?: string;
  end?: string;
}

/** Work out the statement period from the labels banks use, falling back to the latest date mentioned. */
export function findPeriod(text: string): Period {
  const D = String.raw`(\d{1,2}[\s/.-]+(?:[A-Za-z]{3,9}|\d{1,2})[\s/.-]+\d{2,4})`;
  const range = text.match(new RegExp(`(?:Statement period|Period|Statement from|From)\\s*:?\\s*${D}\\s*(?:to|-|–)\\s*${D}`, 'i'));
  if (range) return { start: parseFullDate(range[1]), end: parseFullDate(range[2]) };
  const thisDate =
    text.match(new RegExp(`(?:This (?:summary|statement) date|Statement date|Closing date)\\s*:?\\s*${D}`, 'i')) ??
    text.match(new RegExp(`(?:^|\\n)\\s*Date\\s*:?\\s*${D}`, 'i'));
  const lastDate = text.match(new RegExp(`(?:Last (?:summary|statement) date|Previous statement date|Opening date)\\s*:?\\s*${D}`, 'i'));
  const end = thisDate ? parseFullDate(thisDate[1]) : undefined;
  const start = lastDate ? parseFullDate(lastDate[1]) : undefined;
  if (end) return { start: start ? addOneDay(start) : undefined, end };
  const all = findDates(text).sort();
  return { end: all[all.length - 1] };
}

function addOneDay(isoDate: string): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

export function guessKind(text: string): AccountKind {
  if (/credit limit|available credit|minimum payment|mastercard|visa (?:card|platinum|light|classic)/i.test(text)) return 'credit';
  if (/home loan|mortgage|loan account/i.test(text)) return 'loan';
  if (/saver|savings|orbit|fastsaver|notice saver|term deposit|bonus/i.test(text)) return 'savings';
  return 'transaction';
}

/** Check opening + sum(transactions) = closing and record the result on the statement. */
export function reconcile(st: ParsedStatement): ParsedStatement {
  if (st.openingBalance === undefined || st.closingBalance === undefined) return st;
  const sum = st.transactions.reduce((a, t) => a + t.amount, 0);
  const expected = round2(st.closingBalance - st.openingBalance);
  const ok = Math.abs(round2(sum) - expected) < 0.015;
  if (!ok) {
    st.warnings.push(
      `Transactions add up to ${round2(sum).toFixed(2)} but the statement balance moved by ${expected.toFixed(2)} – some lines may not have been read correctly.`,
    );
  }
  return { ...st, reconciled: ok };
}

/** Bill-payment payees on Westpac statements carry a 4-digit prefix ("7030Liv - ASB"). */
export function cleanParty(s: string): string {
  return s.replace(/^\d{4}(?=[A-Za-z])/, '').replace(/\s+/g, ' ').trim();
}

/** Internet banking timestamps such as "14:01-05048" add noise to descriptions. */
export function stripNoise(s: string): string {
  return s.replace(/\b\d{2}:\d{2}-\d{5}\b/g, '').replace(/\s+/g, ' ').trim();
}
