import { describe, expect, it } from 'vitest';
import { groupLines, type PdfToken } from '../src/lib/pdfText';
import { parseCardStatement, parseColumnarStatement, parseCsvStatement, parseOfx } from '../src/lib/parsers';
import { parsePdfPages, parseTextFile } from '../src/lib/parsers';
import { emptyState, importStatement, mergeBackup } from '../src/lib/store';
import { categorise } from '../src/lib/categorise';
import { buildInsights, filterTransactions, monthlySummaries, suggestBudgets, incomeVsSpending } from '../src/lib/analysis';
import { parseLeadingDate, resolveDate } from '../src/lib/dates';

/** Build a fake PDF page from rows of [x, text] at descending y positions. */
function page(rows: Array<{ y: number; cells: Array<[number, string, number?]> }>) {
  const tokens: PdfToken[] = [];
  for (const r of rows) for (const [x, str, w] of r.cells) tokens.push({ x, y: r.y, right: x + (w ?? str.length * 4.2), str });
  return { lines: groupLines(tokens) };
}

// Mirrors the Westpac NZ "Westpac Everyday" summary layout (right-aligned amount columns).
const amt = (right: number, s: string): [number, string, number] => [right - s.length * 4.2, s, s.length * 4.2];
const westpacPage = page([
  { y: 582, cells: [[48, 'Westpac Everyday']] },
  { y: 527, cells: [[48, 'Account name:'], [118, 'Test Person'], [359, 'Account number:'], [458, '03 1234 0123456-00']] },
  { y: 514, cells: [[359, 'Last summary date:'], [491, '16 November 2025']] },
  { y: 501, cells: [[359, 'This summary date:'], [460, '16 January 2026']] },
  { y: 455, cells: [[367, 'OPENING BALANCE'], [497, '$1,000.00']] },
  {
    y: 439,
    cells: [[48, 'DATE'], [79, 'TYPE'], [107, 'NAME OF OTHER PARTY'], [206, 'TRANSACTION PARTICULARS'], [354, 'MONEY OUT $', 41], [428, 'MONEY IN $', 35], [498, 'BALANCE $', 34]],
  },
  { y: 422, cells: [[48, '20 Dec'], [79, 'PS'], [107, 'Countdown Albany'], [206, '************ 1234'], amt(395, '85.50'), amt(532, '914.50')] },
  { y: 400, cells: [[48, '24 Dec'], [79, 'DC'], [107, 'Acme Salaries'], [206, 'Acme Sal'], amt(463, '3,000.00')] },
  { y: 380, cells: [[48, '03 Jan'], [79, 'DE'], [107, 'To 1234-0123456-01'], [206, 'WBC Internet Transfer'], amt(395, '1,000.00')] },
  { y: 371, cells: [[206, '19:12-36016']] },
  { y: 356, cells: [[48, '05 Jan'], [79, 'DD'], [107, 'Mercury NZ'], [206, '123456'], amt(395, '214.50'), amt(532, '2,700.00')] },
  { y: 300, cells: [[354, 'CLOSING BALANCE'], [500, '$2,700.00']] },
]);

describe('dates', () => {
  it('reads leading dates without confusing a second date for a year', () => {
    expect(parseLeadingDate('17 Sep 18 Sep Unichem')).toMatchObject({ day: 17, month: 9, year: undefined });
    expect(parseLeadingDate('19-Jul-21 Coffee')).toMatchObject({ day: 19, month: 7, year: 2021 });
  });
  it('resolves December transactions on a January statement to the previous year', () => {
    expect(resolveDate({ day: 20, month: 12, length: 6 }, '2026-01-16')).toBe('2025-12-20');
    expect(resolveDate({ day: 3, month: 1, length: 6 }, '2026-01-16')).toBe('2026-01-03');
  });
});

describe('Westpac account statement (PDF layout)', () => {
  const st = parseColumnarStatement([westpacPage]);
  it('reads account details and period', () => {
    expect(st.bank).toBe('Westpac');
    expect(st.accountNumber).toBe('03-1234-0123456-00');
    expect(st.holder).toBe('Test Person');
    expect(st.periodEnd).toBe('2026-01-16');
    expect(st.product).toBe('Westpac Everyday');
  });
  it('assigns money out / in by column and reconciles', () => {
    expect(st.transactions.map((t) => [t.date, t.amount])).toEqual([
      ['2025-12-20', -85.5],
      ['2025-12-24', 3000],
      ['2026-01-03', -1000],
      ['2026-01-05', -214.5],
    ]);
    expect(st.openingBalance).toBe(1000);
    expect(st.closingBalance).toBe(2700);
    expect(st.reconciled).toBe(true);
  });
  it('strips internet-banking timestamps from continuation lines', () => {
    expect(st.transactions[2].description).toBe('To 1234-0123456-01 – WBC Internet Transfer');
    expect(st.transactions[0].type).toBe('PS');
  });
  it('is picked by the PDF dispatcher', () => {
    expect(parsePdfPages([westpacPage]).format).toMatch(/account statement/);
  });
});

describe('credit card statement', () => {
  const p1 = page([
    { y: 800, cells: [[488, 'Westpac Cards']] },
    { y: 538, cells: [[45, 'Opening Balance'], [252, '$100.00'], [320, 'Account Number:'], [478, '0030 1111 2222']] },
    { y: 524, cells: [[320, 'Statement Period:'], [435, '17/12/2025 to 16/01/2026']] },
    { y: 510, cells: [[320, 'Credit Limit:'], [500, '$5,000.00']] },
    { y: 481, cells: [[45, 'Closing Balance'], [241, '$162.50'], [320, 'Current Payment Due Date:'], [473, '30 January 2026']] },
    { y: 470, cells: [[45, 'Total Minimum Payment Due'], [241, '$10.00']] },
  ]);
  const p2 = page([
    { y: 753, cells: [[48, 'TRANSACTION'], [99, 'PROCESS'], [150, 'DETAILS'], [496, 'AMOUNT $']] },
    { y: 729, cells: [[48, 'A Person'], [220, '**** **** **** 1234'], [304, 'Platinum Mastercard']] },
    { y: 714, cells: [[48, '30 Dec'], [99, '31 Dec'], [150, 'Spotify P123 Stockholm Swe'], [507, '17.99']] },
    { y: 700, cells: [[48, '02 Jan'], [99, '02 Jan'], [150, 'Payment Received Thank You NZL'], [507, '100.00'], [536, 'CR']] },
    { y: 686, cells: [[48, '05 Jan'], [99, '06 Jan'], [150, 'Kindle SVCS Seattle WA'], [507, '15.23']] },
    { y: 677, cells: [[150, '8.35 USD, Foreign Currency Fee $ .26 NZD Included']] },
    { y: 660, cells: [[48, '10 Jan'], [99, '11 Jan'], [150, 'New World Long Bay Auckland NZL'], [500, '129.28']] },
  ]);
  const st = parseCardStatement([p1, p2]);
  it('parses purchases as negative and payments as positive', () => {
    expect(st.kind).toBe('credit');
    expect(st.accountNumber).toBe('0030 1111 2222');
    expect(st.transactions.map((t) => t.amount)).toEqual([-17.99, 100, -15.23, -129.28]);
    expect(st.transactions[0].date).toBe('2025-12-30');
    expect(st.transactions[0].cardholder).toBe('A Person');
  });
  it('keeps foreign-currency notes out of the description', () => {
    expect(st.transactions[2].description).toBe('Kindle SVCS Seattle WA');
    expect(st.transactions[2].reference).toMatch(/USD/);
  });
  it('reconciles with debt stored as a negative balance', () => {
    expect(st.openingBalance).toBe(-100);
    expect(st.closingBalance).toBe(-162.5);
    expect(st.reconciled).toBe(true);
    expect(st.card).toMatchObject({ dueDate: '2026-01-30', creditLimit: 5000, minimumPayment: 10 });
  });
});

describe('ASB CSV exports', () => {
  const asb = `Created date / time : 6 November 2026 / 10:00:00
Bank 12; Branch 3077; Account 0123456-50 (Streamline)
From date 20261001
To date 20261031
Avail Bal : 1234.56 as of 20261031
Ledger Balance : 1234.56 as of 20261031
Date,Unique Id,Tran Type,Cheque Number,Payee,Memo,Amount

2026/10/02,2026100201,D/C,,"D/C FROM B ORR","Power + Food",160.00
2026/10/03,2026100301,EFTPOS,,"PAK N SAVE ALBANY","4835-****-****-1234 Df",-187.42
2026/10/05,2026100501,DEBIT,,"MERCURY NZ LTD","Power, monthly",-210.00
`;
  it('reads account number, product and signed amounts', () => {
    const st = parseCsvStatement(asb, 'Export.csv');
    expect(st.bank).toBe('ASB');
    expect(st.accountNumber).toBe('12-3077-0123456-50');
    expect(st.product).toBe('Streamline');
    expect(st.periodStart).toBe('2026-10-01');
    expect(st.transactions.map((t) => t.amount)).toEqual([160, -187.42, -210]);
    expect(st.transactions[2].description).toBe('MERCURY NZ LTD – Power, monthly');
  });

  it('treats ASB credit card DEBIT rows as spending', () => {
    const cc = `Created date / time : 6 November 2026
Card Number XXXX-XXXX-XXXX-4321 (Visa Light)
From date 20261001
To date 20261031
Date Processed,Date of Transaction,Unique Id,Tran Type,Reference,Description,Amount
2026/10/03,2026/10/02,1,DEBIT,123,"COUNTDOWN TAKAPUNA",54.20
2026/10/10,2026/10/10,2,CREDIT,124,"PAYMENT RECEIVED THANK YOU",-500.00
`;
    const st = parseTextFile(cc, 'cc.csv')[0];
    expect(st.kind).toBe('credit');
    expect(st.accountNumber).toBe('XXXX XXXX XXXX 4321');
    expect(st.transactions.map((t) => t.amount)).toEqual([-54.2, 500]);
  });

  it('handles Westpac-style CSV with separate columns', () => {
    const csv = `Date,Amount,Other Party,Description,Reference,Particulars,Analysis Code
05/10/2026,-12.50,Lieutenant Coffee,POS W/D,,,
06/10/2026,2500.00,Acme Ltd,Salary,,Wages,
`;
    const st = parseTextFile(csv, 'Westpac_03-1234-0123456-00.csv')[0];
    expect(st.accountNumber).toBe('03-1234-0123456-00');
    expect(st.bank).toBe('Westpac');
    expect(st.transactions.map((t) => t.date)).toEqual(['2026-10-05', '2026-10-06']);
  });
});

describe('OFX', () => {
  it('parses SGML OFX', () => {
    const ofx = `OFXHEADER:100
<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS><CURDEF>NZD<BANKACCTFROM><BANKID>12<BRANCHID>3077<ACCTID>0123456-50<ACCTTYPE>CHECKING</BANKACCTFROM>
<BANKTRANLIST><DTSTART>20261001<DTEND>20261031
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20261003<TRNAMT>-45.10<FITID>1<NAME>NEW WORLD<MEMO>Groceries</STMTTRN>
</BANKTRANLIST><LEDGERBAL><BALAMT>100.00</LEDGERBAL></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`;
    const [st] = parseOfx(ofx, 'x.ofx');
    expect(st.accountNumber).toBe('12-3077-0123456-50');
    expect(st.bank).toBe('ASB');
    expect(st.transactions[0]).toMatchObject({ date: '2026-10-03', amount: -45.1, description: 'NEW WORLD – Groceries' });
  });
});

describe('store & analysis', () => {
  const s0 = emptyState();
  const everyday = parseColumnarStatement([westpacPage]);

  it('categorises common NZ merchants', () => {
    const c = (description: string, amount = -10) => categorise({ date: '2026-01-01', amount, description }, [], s0.settings, []).category;
    expect(c('Countdown Albany')).toBe('Groceries');
    expect(c('Lieutenant Coffee Ba Auckland NZL')).toBe('Cafes & Coffee');
    expect(c('Auckland Transport Auckland Auk')).toBe('Public Transport & Parking');
    expect(c('Spark Arena Auckland Auc')).toBe('Entertainment & Events');
    expect(c('Spark New Zealand')).toBe('Internet & Phone');
    expect(c('Uber Eats')).toBe('Eating Out & Takeaways');
    expect(c('Payment Received Thank You NZL', 100)).toBe('Credit Card Payments');
    expect(c('Westpac Salaries – Westpac Sal', 4000)).toBe('Salary & Wages');
    expect(c('ASB Joint - Liv and – Power + Food')).toBe('Transfers');
  });

  it('de-duplicates overlapping statements but keeps genuine repeats', () => {
    const a = importStatement(s0, everyday, 'a.pdf');
    expect(a.record.added).toBe(4);
    const b = importStatement(a.state, everyday, 'again.pdf');
    expect(b.record.added).toBe(0);
    expect(b.record.duplicates).toBe(4);
    const twice = { ...everyday, transactions: [...everyday.transactions, everyday.transactions[0]] };
    const c = importStatement(a.state, twice, 'twice.pdf');
    expect(c.record.added).toBe(1);
  });

  it('matches transfers between household accounts so they are not spending', () => {
    let s = importStatement(s0, everyday, 'a.pdf').state;
    const savings = {
      ...everyday,
      accountNumber: '03-1234-0123456-01',
      transactions: [{ date: '2026-01-03', amount: 1000, description: 'From 1234-0123456-00' }],
      openingBalance: undefined,
      closingBalance: undefined,
    };
    s = importStatement(s, savings, 'b.pdf').state;
    const moved = s.transactions.filter((t) => Math.abs(t.amount) === 1000);
    expect(moved.map((t) => t.category)).toEqual(['Transfers', 'Transfers']);
  });

  it('builds monthly summaries, budgets and insights', () => {
    const s = importStatement(s0, everyday, 'a.pdf').state;
    const txns = filterTransactions(s, { owners: ['me', 'partner', 'joint'] });
    const months = monthlySummaries(txns);
    expect(months.map((m) => m.month)).toEqual(['2025-12', '2026-01']);
    expect(months[0].byCategory.Groceries).toBeCloseTo(85.5);
    expect(months[0].income).toBe(3000);
    expect(incomeVsSpending(months, txns).income).toBe(3000);
    expect(suggestBudgets(txns, false).find((b) => b.category === 'Groceries')).toBeTruthy();
    expect(buildInsights(s, txns, '2026-02-01').some((i) => i.id === 'savings-rate')).toBe(true);
  });

  it('merges a partner backup without duplicating', () => {
    const mine = importStatement(s0, everyday, 'a.pdf').state;
    const merged = mergeBackup(mine, mine);
    expect(merged.transactions.length).toBe(mine.transactions.length);
  });
});
