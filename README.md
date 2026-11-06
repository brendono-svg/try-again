# Household Budget

A private budgeting app for a household with accounts at **Westpac NZ** and **ASB**. Load your bank statements, and the app:

- reads **PDF statements, CSV exports and OFX/QFX files** from both banks
- checks every PDF statement adds up (opening balance + transactions = closing balance)
- de-duplicates overlapping statements, so loading the same period twice is safe
- sorts transactions into categories (rules tuned for NZ merchants) and learns from your corrections
- spots **transfers between your own accounts** (everyday ↔ savings, credit card repayments, money into the joint account), so nothing is counted twice
- shows spending by month, category and merchant, for **you, your partner, joint accounts, or the whole household**
- suggests a **monthly budget** from your typical month and tracks progress against it
- gives specific suggestions: savings rate vs goal, 50/30/20 split, biggest discretionary categories, small frequent purchases, subscriptions, unusual jumps, and credit card due dates

**Privacy:** everything runs in your browser. Statements are never uploaded anywhere, and data is stored in the browser's own storage (IndexedDB).

## Using it

```bash
npm install
npm run dev        # open the printed http://localhost:5173 link
```

Or build a single self-contained file you can open by double-clicking (no server needed):

```bash
npm run build      # creates dist/index.html
```

Then:

1. **Import**: drag in statements. Select many at once if you like.
   - *Westpac:* Westpac One → account → Statements → download PDF (everyday, savings and credit card all work). Or *Export transactions* as CSV/OFX for recent weeks.
   - *ASB:* internet banking → account → Export → **CSV** (most reliable) or OFX. ASB statement PDFs are also read using the generic table reader.
2. **Accounts**: set whether each account is yours, your partner's or joint, and give it a nickname. The coverage grid shows any missing months.
3. **Settings**: enter both your names, and add *household names* (e.g. your partner's first name and surname). Payments between the two of you then count as transfers, not spending.
4. **Transactions**: fix any wrong categories. With "Remember" ticked, each fix becomes a rule for future imports.
5. **Budget**: click *Use suggested budgets*, adjust, and compare each month.

### Sharing between partners

Data lives in one browser. To combine: each of you imports your own bank's statements, then *Settings → Export backup*, and the other uses *Merge a backup*. Duplicates are skipped. Or just use one shared computer.

## Supported formats

| Source | Format | Notes |
|---|---|---|
| Westpac account summary (Everyday, savings…) | PDF | Columns located by position. Balances are reconciled. |
| Westpac Airpoints / credit card statement | PDF | Purchases, payments, refunds, FX notes, due date, minimum payment |
| ASB account export | CSV (`Bank 12; Branch …` header) | Account number and product read from the header |
| ASB credit card export | CSV (`Card Number …` header) | DEBIT/CREDIT handled |
| Westpac CSV export | CSV | Account number taken from the filename if present |
| Any bank | OFX / QFX | |
| Other PDFs laid out as Date / Description / Debit / Credit / Balance | PDF | Generic table reader |

Scanned (image-only) PDFs can't be read. Export a CSV instead.

## Development

```bash
npm test                                   # unit tests (synthetic statements, no real data)
npm run parse -- statement.pdf other.csv   # check how files parse from the command line
npm run parse -- statement.pdf --json      # full parsed output
```

Code layout:

- `src/lib/parsers/`: statement readers (`columnar.ts` for account PDFs, `card.ts` for credit card PDFs, `csv.ts`, `ofx.ts`)
- `src/lib/pdfText.ts`: turns a PDF into positioned text lines (pdf.js)
- `src/lib/categories.ts`: category list and built-in NZ merchant rules
- `src/lib/categorise.ts`: categorisation, user rules and transfer matching
- `src/lib/analysis.ts`: monthly summaries, budget suggestions and insights
- `src/lib/store.ts`: import/de-duplication, persistence and backups
- `src/components/`: React UI

Never commit real statements: `*.pdf`, `*.ofx` and `statements/` are git-ignored.
