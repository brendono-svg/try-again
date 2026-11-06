/**
 * Parse statements from the command line to check the parsers:
 *   npm run parse -- path/to/statement.pdf [more files...] [--json]
 */
import fs from 'node:fs';
import path from 'node:path';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { extractPdfPages } from '../src/lib/pdfText';
import { parseFile } from '../src/lib/parsers';

const args = process.argv.slice(2);
const json = args.includes('--json');
for (const file of args.filter((a) => !a.startsWith('--'))) {
  const data = new Uint8Array(fs.readFileSync(file));
  const statements = await parseFile(path.basename(file), data, (d) => extractPdfPages(pdfjs, d));
  for (const st of statements) {
    if (json) {
      console.log(JSON.stringify(st, null, 2));
      continue;
    }
    console.log(`\n${path.basename(file)}: ${st.format}`);
    console.log(`  ${st.bank} ${st.accountNumber} ${st.product ?? ''} (${st.kind}) holder=${st.holder ?? '-'}`);
    console.log(`  period ${st.periodStart} → ${st.periodEnd}; opening ${st.openingBalance} closing ${st.closingBalance}; reconciled=${st.reconciled}`);
    if (st.card) console.log(`  card: ${JSON.stringify(st.card)}`);
    console.log(`  ${st.transactions.length} transactions`);
    for (const w of st.warnings) console.log(`  ! ${w}`);
  }
}
