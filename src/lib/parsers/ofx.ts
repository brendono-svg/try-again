import type { ParsedStatement, ParsedTransaction } from '../../types';
import { parseFullDate } from '../dates';
import { parseAmountCell } from '../money';
import { detectBank, reconcile } from './common';

/** OFX / QFX exports (both Westpac and ASB offer these). Supports SGML and XML flavours. */

export function looksLikeOfx(text: string): boolean {
  return /<OFX>|OFXHEADER/i.test(text.slice(0, 2000));
}

function tag(block: string, name: string): string | undefined {
  const m = block.match(new RegExp(`<${name}>([^<\\r\\n]*)`, 'i'));
  return m ? m[1].trim() : undefined;
}

function ofxDate(s?: string): string | undefined {
  return s ? parseFullDate(s.slice(0, 8)) : undefined;
}

export function parseOfx(text: string, fileName = ''): ParsedStatement[] {
  const statements: ParsedStatement[] = [];
  const blocks = text.split(/<STMTRS>|<CCSTMTRS>/i).slice(1);
  const bankName = detectBank(text, fileName);
  for (const block of blocks) {
    const isCard = /<CCACCTFROM>/i.test(block);
    const bankId = tag(block, 'BANKID') ?? '';
    const branch = tag(block, 'BRANCHID') ?? '';
    const acct = tag(block, 'ACCTID') ?? fileName;
    const digits = `${bankId}${branch}${acct}`.replace(/\D/g, '');
    const accountNumber = !isCard && digits.length >= 15
      ? `${digits.slice(0, 2)}-${digits.slice(2, 6)}-${digits.slice(6, 13)}-${digits.slice(13)}`
      : acct;
    const transactions: ParsedTransaction[] = [];
    for (const t of block.split(/<STMTTRN>/i).slice(1)) {
      const date = ofxDate(tag(t, 'DTPOSTED'));
      const amount = parseAmountCell(tag(t, 'TRNAMT') ?? '');
      if (!date || amount === undefined) continue;
      const name = tag(t, 'NAME') ?? '';
      const memo = tag(t, 'MEMO') ?? '';
      transactions.push({
        date,
        amount,
        description: [name, memo].filter(Boolean).join(' – ') || '(no description)',
        otherParty: name || undefined,
        particulars: memo || undefined,
        type: tag(t, 'TRNTYPE'),
        reference: tag(t, 'FITID'),
      });
    }
    const closing = parseAmountCell(tag(block.split(/<LEDGERBAL>/i)[1] ?? '', 'BALAMT') ?? '');
    const st: ParsedStatement = {
      bank: detectBank(`${bankName} ${bankId}`, fileName) === 'Other' && /^0?12$/.test(bankId) ? 'ASB' : bankId === '03' ? 'Westpac' : bankName,
      accountNumber,
      kind: isCard ? 'credit' : /SAVINGS/i.test(tag(block, 'ACCTTYPE') ?? '') ? 'savings' : 'transaction',
      periodStart: ofxDate(tag(block, 'DTSTART')),
      periodEnd: ofxDate(tag(block, 'DTEND')),
      closingBalance: closing,
      transactions,
      format: 'OFX export',
      warnings: transactions.length ? [] : ['No transactions were found in this file.'],
    };
    statements.push(reconcile(st));
  }
  return statements;
}
