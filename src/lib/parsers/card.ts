import type { ParsedStatement, ParsedTransaction } from '../../types';
import { parseFullDate, parseLeadingDate, resolveDate } from '../dates';
import { parseMoney } from '../money';
import type { PdfPage } from '../pdfText';
import { pagesText } from '../pdfText';
import { detectBank, findAccountNumber, findLabelledMoney, findPeriod, reconcile } from './common';

/**
 * Credit card statements (Westpac NZ, and the similar ASB layout):
 *   TRANSACTION DATE | PROCESS DATE | DETAILS | AMOUNT [CR]
 * Purchases become negative amounts, payments/refunds (CR) positive.
 * Balances are stored as negative numbers when money is owed.
 */

export function looksLikeCardStatement(text: string): boolean {
  return /credit limit|available credit/i.test(text) && /(minimum payment|payment due|closing balance)/i.test(text);
}

export function parseCardStatement(pages: PdfPage[], fileName = ''): ParsedStatement {
  const text = pagesText(pages);
  const bank = detectBank(text, fileName);
  const period = findPeriod(text);
  const warnings: string[] = [];
  const transactions: ParsedTransaction[] = [];
  let cardholder: string | undefined;

  for (const page of pages) {
    let last: ParsedTransaction | undefined;
    let lastY = 0;
    for (const line of page.lines) {
      const masked = line.text.match(/^(.*?)\s*(?:\*{4}\s?){3}(\d{4})\b/);
      if (masked && !parseLeadingDate(line.text)) {
        cardholder = masked[1].trim() || cardholder;
        last = undefined;
        continue;
      }
      const d1 = parseLeadingDate(line.text);
      if (d1) {
        const rest = line.text.slice(d1.length).trim();
        const d2 = parseLeadingDate(rest);
        if (d2) {
          const afterDates = rest.slice(d2.length).trim();
          const m = afterDates.match(/^(.*?)\s+(-?\$?[\d,]+\.\d{2})\s*(CR|DR|-)?$/i);
          if (m) {
            const value = parseMoney(m[2]);
            if (value !== undefined) {
              const credit = (m[3] ?? '').toUpperCase() === 'CR' || (m[3] ?? '') === '-' || value < 0;
              const date = resolveDate(d1, period.end);
              if (!date) continue;
              last = {
                date,
                amount: credit ? Math.abs(value) : -Math.abs(value),
                description: m[1].replace(/\s+/g, ' ').trim(),
                cardholder,
              };
              transactions.push(last);
              lastY = line.y;
              continue;
            }
          }
        }
      }
      // Continuation (e.g. foreign currency details) sits just under its transaction.
      if (last && lastY - line.y > 0 && lastY - line.y <= 12 && !d1) {
        last.reference = [last.reference, line.text].filter(Boolean).join(' ');
        lastY = line.y;
        continue;
      }
      last = undefined;
    }
  }

  // Credit card balances are amounts owed; store as negative.
  const owed = (v?: number) => (v === undefined ? undefined : -v);
  const opening = findLabelledMoney(text, /opening balance|previous balance/);
  const closing = findLabelledMoney(text, /closing balance|new balance/);
  const dueRaw = text.match(/(?:Current )?Payment Due Date\s*:?\s*(\d{1,2}[\s/.-]+(?:[A-Za-z]{3,9}|\d{1,2})[\s/.-]+\d{2,4})/i)?.[1];
  const holderLine = text.match(/Account summary for\s+([^\n]+)/i)?.[1]?.trim();
  const product = text.match(/(Westpac [^\n]*?(?:Mastercard|Visa)[^\n]*|ASB [^\n]*?(?:Mastercard|Visa)[^\n]*)/i)?.[1]?.replace(/TM|®/g, '').replace(/\s+/g, ' ').trim();

  let st: ParsedStatement = {
    bank,
    accountNumber:
      text.match(/(?:Account|Card) Number\s*:?\s*(\d{4} \d{4} \d{4}(?: \d{4})?)\b/i)?.[1] ??
      findAccountNumber(text) ??
      fileName.replace(/\.[^.]+$/, ''),
    holder: holderLine,
    product: product ?? 'Credit card',
    kind: 'credit',
    periodStart: period.start,
    periodEnd: period.end,
    openingBalance: owed(opening),
    closingBalance: owed(closing),
    transactions,
    card: {
      dueDate: dueRaw ? parseFullDate(dueRaw) : undefined,
      minimumPayment: findLabelledMoney(text, /(?:Total )?Minimum Payment(?: Due)?/),
      creditLimit: findLabelledMoney(text, /Credit Limit/),
      overdue: findLabelledMoney(text, /Overdue Payment(?: \(pay now\))?/),
    },
    format: `${bank} credit card statement (PDF)`,
    warnings,
  };
  if (!transactions.length) st.warnings.push('No transactions were found in this statement.');
  st = reconcile(st);
  return st;
}
