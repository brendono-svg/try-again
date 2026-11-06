import type { ParsedStatement, ParsedTransaction } from '../../types';
import { parseLeadingDate, resolveDate, type PartialDate } from '../dates';
import { parseMoney, round2 } from '../money';
import type { PdfLine, PdfPage, PdfToken } from '../pdfText';
import { joinTokens, pagesText } from '../pdfText';
import {
  cleanParty,
  detectBank,
  findAccountNumber,
  findLabelledMoney,
  findPeriod,
  guessKind,
  reconcile,
  stripNoise,
} from './common';

/**
 * Generic parser for bank-account statements laid out as a table:
 *   DATE | [TYPE] | DESCRIPTION... | MONEY OUT / DEBIT | MONEY IN / CREDIT | BALANCE
 * Column positions are read from each page's header row, so amounts are
 * assigned to "out" or "in" by where they sit on the page. Works for Westpac
 * NZ account summaries and similarly laid-out statements (e.g. ASB).
 */

interface Column {
  kind: 'date' | 'type' | 'party' | 'particulars' | 'out' | 'in' | 'balance' | 'amount' | 'text';
  x: number;
  right: number;
}

interface Layout {
  columns: Column[];
  numeric: Column[];
  descStart: number;
  firstNumericLeft: number;
}

const HEADER_PATTERNS: Array<[Column['kind'], RegExp]> = [
  ['date', /^(transaction |trans\.? |posting |value )?date$/i],
  ['type', /^(type|tran type|code)$/i],
  ['out', /money out|withdrawals?|debits?\b|payments? out|paid out|^out$/i],
  ['in', /money in|deposits?|^credits?\b|paid in|^in$/i],
  ['balance', /balance/i],
  ['amount', /^amount/i],
  ['party', /other party|payee|^name/i],
  ['particulars', /particulars|description|details|transaction$|narrative|reference/i],
];

function classifyHeaderToken(str: string): Column['kind'] {
  const s = str.replace(/\$|\(nzd\)/gi, '').trim();
  for (const [kind, re] of HEADER_PATTERNS) if (re.test(s)) return kind;
  return 'text';
}

function readLayout(line: PdfLine): Layout | undefined {
  const columns: Column[] = line.tokens.map((t) => ({ kind: classifyHeaderToken(t.str), x: t.x, right: t.right }));
  const kinds = new Set(columns.map((c) => c.kind));
  if (!kinds.has('date')) return undefined;
  if (!(kinds.has('out') && kinds.has('in')) && !kinds.has('amount')) return undefined;
  const numeric = columns.filter((c) => c.kind === 'out' || c.kind === 'in' || c.kind === 'balance' || c.kind === 'amount');
  const date = columns.find((c) => c.kind === 'date')!;
  const descCols = columns.filter((c) => c.x > date.x && !numeric.includes(c) && c.kind !== 'type');
  const typeCol = columns.find((c) => c.kind === 'type');
  const descStart = Math.min(...descCols.map((c) => c.x), typeCol ? typeCol.x : Infinity, Infinity);
  return {
    columns,
    numeric,
    descStart: Number.isFinite(descStart) ? descStart : date.right + 5,
    firstNumericLeft: Math.min(...numeric.map((c) => c.x)),
  };
}

function nearestNumeric(layout: Layout, t: PdfToken): Column | undefined {
  let best: Column | undefined;
  let bestD = Infinity;
  const centre = (t.x + t.right) / 2;
  for (const c of layout.numeric) {
    const d = Math.min(Math.abs(c.right - t.right), Math.abs((c.x + c.right) / 2 - centre));
    if (d < bestD) {
      bestD = d;
      best = c;
    }
  }
  return bestD < 60 ? best : undefined;
}

const SKIP_LINE = /opening balance|closing balance|brought forward|carried forward|balance forward|continued on|total (debits|credits)|^page \d/i;

interface Draft {
  date?: PartialDate;
  type?: string;
  party: string[];
  particulars: string[];
  out?: number;
  in?: number;
  amount?: number;
  balance?: number;
  lastY: number;
}

export function looksLikeColumnar(pages: PdfPage[]): boolean {
  return pages.some((p) => p.lines.some((l) => readLayout(l)));
}

export function parseColumnarStatement(pages: PdfPage[], fileName = ''): ParsedStatement {
  const text = pagesText(pages);
  const bank = detectBank(text, fileName);
  const period = findPeriod(text);
  const warnings: string[] = [];
  const drafts: Draft[] = [];
  let layout: Layout | undefined;
  let lastDate: PartialDate | undefined;

  for (const page of pages) {
    let inTable = false;
    let current: Draft | undefined;
    for (const line of page.lines) {
      const header = readLayout(line);
      if (header) {
        layout = header;
        inTable = true;
        current = undefined;
        continue;
      }
      if (!layout) continue;
      if (SKIP_LINE.test(line.text)) {
        current = undefined;
        continue;
      }

      const leading = parseLeadingDate(line.text);
      const dateToken = line.tokens[0];
      const startsWithDate = leading && dateToken && dateToken.x < layout.descStart - 2;
      if (!inTable && !startsWithDate) continue;

      // Split tokens into amounts (by column) and description text.
      const amounts: Array<{ col: Column; value: number; token: PdfToken }> = [];
      const descTokens: PdfToken[] = [];
      let consumed = startsWithDate ? leading!.length : 0;
      for (const tok of line.tokens) {
        if (consumed > 0) {
          // Drop the characters belonging to the leading date (which may span tokens).
          if (tok.str.length <= consumed) {
            consumed -= tok.str.length;
            consumed = Math.max(0, consumed - 1); // the space between tokens
            continue;
          }
          const rest = tok.str.slice(consumed).trim();
          consumed = 0;
          if (!rest) continue;
          descTokens.push({ ...tok, str: rest });
          continue;
        }
        const money = tok.right > layout.firstNumericLeft - 25 ? parseMoney(tok.str) : undefined;
        if (money !== undefined) {
          const col = nearestNumeric(layout, tok);
          if (col) {
            amounts.push({ col, value: money, token: tok });
            continue;
          }
        }
        if (/^(CR|DR|OD)$/i.test(tok.str) && amounts.length) {
          const last = amounts[amounts.length - 1];
          if (/^(DR|OD)$/i.test(tok.str)) last.value = -Math.abs(last.value);
          else if (last.col.kind === 'amount') last.value = Math.abs(last.value);
          continue;
        }
        descTokens.push(tok);
      }

      const hasMovement = amounts.some((a) => a.col.kind === 'out' || a.col.kind === 'in' || a.col.kind === 'amount');

      if (!startsWithDate && !hasMovement) {
        // Continuation line: extra particulars for the transaction above.
        if (current && descTokens.length && line.y >= current.lastY - 13 && descTokens[0].x >= layout.descStart - 3) {
          current.particulars.push(joinTokens(descTokens));
          current.lastY = line.y;
          if (amounts.length) applyAmounts(current, amounts);
        } else {
          current = undefined;
          if (amounts.length === 0 && descTokens.length && line.y < (drafts[drafts.length - 1]?.lastY ?? 0) - 40) inTable = false;
        }
        continue;
      }

      if (startsWithDate) lastDate = leading;
      if (!lastDate) continue;
      if (!hasMovement && amounts.length === 0 && descTokens.length === 0) continue;

      const draft: Draft = { date: lastDate, party: [], particulars: [], lastY: line.y };
      splitDescription(layout, descTokens, draft);
      applyAmounts(draft, amounts);
      drafts.push(draft);
      current = draft;
      inTable = true;
    }
  }

  // Lines with a date but no movement are usually a date header followed by
  // transactions on later lines – merge them forward.
  const transactions: ParsedTransaction[] = [];
  for (const d of drafts) {
    let amount: number | undefined;
    if (d.out !== undefined || d.in !== undefined) amount = round2((d.in ?? 0) - Math.abs(d.out ?? 0));
    else if (d.amount !== undefined) amount = d.amount;
    if (amount === undefined || !d.date) continue;
    const date = resolveDate(d.date, period.end);
    if (!date) {
      warnings.push(`Skipped a line with an unreadable date: ${d.party.join(' ')} ${d.particulars.join(' ')}`);
      continue;
    }
    const otherParty = cleanParty(d.party.join(' '));
    const particulars = stripNoise(d.particulars.join(' '));
    transactions.push({
      date,
      amount,
      otherParty: otherParty || undefined,
      particulars: particulars || undefined,
      description: [otherParty, particulars].filter(Boolean).join(' – ') || '(no description)',
      type: d.type,
      balance: d.balance,
    });
  }

  // Single "amount" column statements without CR/DR markers: derive the sign from the running balance.
  inferSignsFromBalance(transactions, findLabelledMoney(text, /opening balance|balance brought forward/));

  const holder = text.match(/Account name\s*:?\s*([^\n]+?)(?:\s{2,}|\s+Account number|\n|$)/i)?.[1]?.trim();
  const product = findProduct(pages);
  let st: ParsedStatement = {
    bank,
    accountNumber: findAccountNumber(text) ?? fileName.replace(/\.[^.]+$/, ''),
    holder,
    product,
    kind: guessKind(`${product ?? ''}`) === 'transaction' ? guessKind(text.slice(0, 1500)) : guessKind(product ?? ''),
    periodStart: period.start,
    periodEnd: period.end,
    openingBalance: findLabelledMoney(text, /opening balance|balance brought forward|previous balance/),
    closingBalance: findLabelledMoney(text, /closing balance|balance carried forward|new balance/),
    transactions,
    format: `${bank} account statement (PDF)`,
    warnings,
  };
  if (!transactions.length) st.warnings.push('No transactions were found in this statement.');
  st = reconcile(st);
  return st;
}

function splitDescription(layout: Layout, tokens: PdfToken[], draft: Draft) {
  const typeCol = layout.columns.find((c) => c.kind === 'type');
  const partCol = layout.columns.find((c) => c.kind === 'particulars');
  const partyCol = layout.columns.find((c) => c.kind === 'party');
  for (const tok of tokens) {
    if (!draft.type && typeCol && /^[A-Z]{1,3}$/.test(tok.str) && Math.abs(tok.x - typeCol.x) < 18) {
      draft.type = tok.str;
      continue;
    }
    if (partyCol && partCol && partCol.x > partyCol.x && tok.x >= partCol.x - 3) draft.particulars.push(tok.str);
    else draft.party.push(tok.str);
  }
}

function applyAmounts(draft: Draft, amounts: Array<{ col: Column; value: number }>) {
  for (const a of amounts) {
    if (a.col.kind === 'out') draft.out = Math.abs(a.value);
    else if (a.col.kind === 'in') draft.in = Math.abs(a.value);
    else if (a.col.kind === 'balance') draft.balance = a.value;
    else if (a.col.kind === 'amount') draft.amount = a.value;
  }
}

function inferSignsFromBalance(txns: ParsedTransaction[], opening?: number) {
  let prev = opening;
  for (const t of txns) {
    if (t.balance !== undefined && prev !== undefined) {
      const delta = round2(t.balance - prev);
      if (Math.abs(Math.abs(delta) - Math.abs(t.amount)) < 0.005 && Math.sign(delta) !== Math.sign(t.amount)) {
        t.amount = delta;
      }
    }
    if (t.balance !== undefined) prev = t.balance;
    else if (prev !== undefined) prev = round2(prev + t.amount);
  }
}

const PRODUCT_RE = /\b(everyday|saver|savings|streamline|orbit|fastsaver|cheque|choices|online|notice|bonus|term deposit|business|joint|transaction|headroom|simple|premium|account)\b/i;

function findProduct(pages: PdfPage[]): string | undefined {
  const first = pages[0]?.lines ?? [];
  for (const l of first.slice(0, 40)) {
    const words = l.text.split(' ');
    if (words.length <= 5 && PRODUCT_RE.test(l.text) && !/:|number|statement|summary|page|phone|po box|street|road/i.test(l.text)) {
      return l.text;
    }
  }
  return undefined;
}
