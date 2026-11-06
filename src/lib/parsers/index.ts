import type { ParsedStatement } from '../../types';
import type { PdfPage } from '../pdfText';
import { pagesText } from '../pdfText';
import { looksLikeCardStatement, parseCardStatement } from './card';
import { looksLikeColumnar, parseColumnarStatement } from './columnar';
import { looksLikeCsv, parseCsvStatement } from './csv';
import { looksLikeOfx, parseOfx } from './ofx';

export { parseCardStatement, parseColumnarStatement, parseCsvStatement, parseOfx };

/** Pick the right parser for a PDF that has already been turned into lines. */
export function parsePdfPages(pages: PdfPage[], fileName = ''): ParsedStatement {
  const text = pagesText(pages);
  if (looksLikeCardStatement(text)) return parseCardStatement(pages, fileName);
  if (looksLikeColumnar(pages)) return parseColumnarStatement(pages, fileName);
  if (!text.trim()) {
    throw new Error('This PDF has no readable text (it may be a scanned image). Download the statement from internet banking, or export a CSV instead.');
  }
  throw new Error('Could not recognise the statement layout. Try exporting a CSV or OFX file from internet banking instead.');
}

/** Parse a text-based export (CSV, OFX/QFX). */
export function parseTextFile(text: string, fileName = ''): ParsedStatement[] {
  if (looksLikeOfx(text)) return parseOfx(text, fileName);
  if (looksLikeCsv(text)) return [parseCsvStatement(text, fileName)];
  throw new Error('Unrecognised file. Supported: PDF statements, CSV and OFX/QFX exports.');
}

export interface PdfJsLoader {
  (data: Uint8Array): Promise<PdfPage[]>;
}

export async function parseFile(name: string, data: Uint8Array, loadPdf: PdfJsLoader): Promise<ParsedStatement[]> {
  const isPdf = /\.pdf$/i.test(name) || (data[0] === 0x25 && data[1] === 0x50 && data[2] === 0x44 && data[3] === 0x46);
  if (isPdf) return [parsePdfPages(await loadPdf(data), name)];
  return parseTextFile(new TextDecoder('utf-8').decode(data), name);
}
