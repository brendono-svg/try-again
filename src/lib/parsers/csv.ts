import type { Bank, ParsedStatement, ParsedTransaction } from '../../types';
import { parseFullDate } from '../dates';
import { parseAmountCell, round2 } from '../money';
import { detectBank, findAccountNumber, reconcile } from './common';

/** RFC-4180-ish CSV reader (handles quotes, embedded commas and newlines). */
export function parseCsvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  const s = text.replace(/^﻿/, '');
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (quoted) {
      if (ch === '"') {
        if (s[i + 1] === '"') {
          cell += '"';
          i++;
        } else quoted = false;
      } else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') {
      row.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && s[i + 1] === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else cell += ch;
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.map((r) => r.map((c) => c.trim()));
}

type Field = 'date' | 'processed' | 'amount' | 'debit' | 'credit' | 'balance' | 'payee' | 'memo' | 'particulars' | 'code' | 'reference' | 'type' | 'description' | 'id';

const FIELD_PATTERNS: Array<[Field, RegExp]> = [
  ['processed', /^date processed$|^process(ed|ing)? date$|^posted date$/i],
  ['date', /^(transaction )?date( of transaction)?$|^trans(action)? date$|^date$/i],
  ['debit', /^(debit|debits|withdrawals?|money out|paid out)( amount)?$/i],
  ['credit', /^(credit|credits|deposits?|money in|paid in)( amount)?$/i],
  ['amount', /^amount( \(nzd\))?$|^value$/i],
  ['balance', /^balance$/i],
  ['payee', /^(payee|other party|name|merchant|counterparty)$/i],
  ['memo', /^memo$/i],
  ['description', /^(description|details|transaction details|narrative|transaction)$/i],
  ['particulars', /^particulars$/i],
  ['code', /^(code|analysis code)$/i],
  ['reference', /^reference$/i],
  ['type', /^(tran(saction)? type|type)$/i],
  ['id', /^unique id$|^id$/i],
];

function mapHeader(row: string[]): Partial<Record<Field, number>> | undefined {
  const map: Partial<Record<Field, number>> = {};
  row.forEach((h, i) => {
    for (const [field, re] of FIELD_PATTERNS) {
      if (re.test(h.trim()) && map[field] === undefined) {
        map[field] = i;
        break;
      }
    }
  });
  if (map.date === undefined && map.processed !== undefined) map.date = map.processed;
  if (map.date === undefined) return undefined;
  if (map.amount === undefined && map.debit === undefined && map.credit === undefined) return undefined;
  return map;
}

export function looksLikeCsv(text: string): boolean {
  const rows = parseCsvRows(text.slice(0, 5000));
  return rows.some((r) => r.length >= 3 && mapHeader(r));
}

/**
 * Handles ASB (FastNet / internet banking) exports, Westpac One CSV exports and
 * most other bank CSVs by recognising the header row.
 *
 * ASB example:
 *   Bank 12; Branch 3011; Account 0123456-00 (Streamline)
 *   Date,Unique Id,Tran Type,Cheque Number,Payee,Memo,Amount
 * ASB credit card:
 *   Card Number XXXX-XXXX-XXXX-1234 (Visa Light)
 *   Date Processed,Date of Transaction,Unique Id,Tran Type,Reference,Description,Amount
 */
export function parseCsvStatement(text: string, fileName = ''): ParsedStatement {
  const rows = parseCsvRows(text);
  const headerIndex = rows.findIndex((r) => r.length >= 3 && mapHeader(r));
  const warnings: string[] = [];
  if (headerIndex < 0) throw new Error('Could not find a header row with Date and Amount columns.');
  const map = mapHeader(rows[headerIndex])!;
  const preamble = rows.slice(0, headerIndex).map((r) => r.join(' ')).join('\n');
  const bank: Bank = detectBank(preamble, fileName) !== 'Other' ? detectBank(preamble, fileName) : /^Bank \d+; Branch/m.test(preamble) ? 'ASB' : 'Other';

  // Account number: ASB preamble "Bank 12; Branch 3011; Account 0123456-00 (Streamline)"
  let accountNumber: string | undefined;
  let product: string | undefined;
  const asb = preamble.match(/Bank (\d+); Branch (\d+); Account (\d+)-(\d+)(?:\s*\(([^)]+)\))?/i);
  if (asb) {
    accountNumber = `${asb[1].padStart(2, '0')}-${asb[2].padStart(4, '0')}-${asb[3].padStart(7, '0')}-${asb[4]}`;
    product = asb[5];
  }
  const card = preamble.match(/Card Number\s*:?\s*([X\d*]{4}[- ][X\d*]{4}[- ][X\d*]{4}[- ]\d{4})(?:\s*\(([^)]+)\))?/i);
  const isCard = !!card || map.processed !== undefined;
  if (card) {
    accountNumber = card[1].replace(/[- ]/g, ' ');
    product = card[2] ?? 'Credit card';
  }
  accountNumber ??= findAccountNumber(preamble) ?? findAccountNumber(fileName.replace(/[_]/g, '-')) ?? fileName.replace(/\.[^.]+$/, '');

  const transactions: ParsedTransaction[] = [];
  const cell = (r: string[], f: Field) => (map[f] !== undefined ? (r[map[f]!] ?? '').trim() : '');
  for (const r of rows.slice(headerIndex + 1)) {
    if (r.every((c) => !c)) continue;
    const date = parseFullDate(cell(r, 'date')) ?? parseFullDate(cell(r, 'processed'));
    if (!date) continue;
    let amount: number | undefined;
    if (map.amount !== undefined) amount = parseAmountCell(cell(r, 'amount'));
    if (amount === undefined && (map.debit !== undefined || map.credit !== undefined)) {
      const debit = parseAmountCell(cell(r, 'debit')) ?? 0;
      const credit = parseAmountCell(cell(r, 'credit')) ?? 0;
      amount = round2(Math.abs(credit) - Math.abs(debit));
    }
    if (amount === undefined) continue;
    const type = cell(r, 'type');
    // ASB card exports list purchases as positive DEBIT rows.
    if (isCard && /^debit$/i.test(type)) amount = -Math.abs(amount);
    else if (isCard && /^credit$/i.test(type)) amount = Math.abs(amount);
    const payee = cell(r, 'payee');
    const desc = cell(r, 'description');
    const memo = cell(r, 'memo');
    const particulars = [cell(r, 'particulars'), cell(r, 'code'), memo].filter(Boolean).join(' ');
    const reference = cell(r, 'reference');
    const description = [payee || desc, particulars || (payee ? desc : '')].filter(Boolean).join(' – ') || reference || '(no description)';
    const balance = parseAmountCell(cell(r, 'balance'));
    transactions.push({
      date,
      amount,
      description: description.replace(/\s+/g, ' '),
      otherParty: payee || undefined,
      particulars: particulars || undefined,
      reference: reference || undefined,
      type: type || undefined,
      balance,
    });
  }
  transactions.sort((a, b) => a.date.localeCompare(b.date));
  const dates = transactions.map((t) => t.date);
  const from = preamble.match(/From date\s*:?\s*(\d{8}|[\d/.-]+)/i)?.[1];
  const to = preamble.match(/To date\s*:?\s*(\d{8}|[\d/.-]+)/i)?.[1];
  let st: ParsedStatement = {
    bank,
    accountNumber,
    product,
    kind: isCard ? 'credit' : /saver|savings|orbit|fastsaver/i.test(product ?? '') ? 'savings' : 'transaction',
    periodStart: (from && parseFullDate(from)) || dates[0],
    periodEnd: (to && parseFullDate(to)) || dates[dates.length - 1],
    transactions,
    format: `${bank === 'Other' ? 'Bank' : bank} CSV export`,
    warnings,
  };
  if (!transactions.length) st.warnings.push('No transactions were found in this file.');
  st = reconcile(st);
  return st;
}
