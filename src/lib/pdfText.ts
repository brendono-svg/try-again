/**
 * Turns a PDF into positioned lines of text. pdf.js is injected so the same code
 * runs in the browser (with a web worker) and in Node (tests / CLI script).
 */

export interface PdfToken {
  x: number;
  right: number;
  y: number;
  str: string;
}

export interface PdfLine {
  y: number;
  tokens: PdfToken[];
  text: string;
}

export interface PdfPage {
  lines: PdfLine[];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PdfJs = any;

export async function extractPdfPages(pdfjs: PdfJs, data: Uint8Array): Promise<PdfPage[]> {
  const doc = await pdfjs.getDocument({ data, isEvalSupported: false, useSystemFonts: false }).promise;
  const pages: PdfPage[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    const tokens: PdfToken[] = [];
    for (const item of content.items as Array<{ str?: string; transform?: number[]; width?: number }>) {
      if (!item.str || !item.transform) continue;
      // Strip control characters (barcode fonts produce lots of them).
      // eslint-disable-next-line no-control-regex
      const str = item.str.replace(/[\u0000-\u001f\u007f]/g, '').trim();
      if (!str) continue;
      const x = item.transform[4];
      tokens.push({ x, right: x + (item.width ?? 0), y: item.transform[5], str });
    }
    pages.push({ lines: groupLines(tokens) });
  }
  await doc.destroy?.();
  return pages;
}

/** Group tokens into lines by their baseline, top of page first, left to right. */
export function groupLines(tokens: PdfToken[], tolerance = 2.5): PdfLine[] {
  const sorted = tokens.slice().sort((a, b) => b.y - a.y || a.x - b.x);
  const lines: PdfLine[] = [];
  for (const t of sorted) {
    const line = lines.find((l) => Math.abs(l.y - t.y) <= tolerance);
    if (line) line.tokens.push(t);
    else lines.push({ y: t.y, tokens: [t], text: '' });
  }
  for (const l of lines) {
    l.tokens.sort((a, b) => a.x - b.x);
    l.text = joinTokens(l.tokens);
  }
  return lines.sort((a, b) => b.y - a.y);
}

export function joinTokens(tokens: PdfToken[]): string {
  let out = '';
  let prevRight = -Infinity;
  for (const t of tokens) {
    if (out && t.x - prevRight > 1) out += ' ';
    out += t.str;
    prevRight = t.right;
  }
  return out.replace(/\s+/g, ' ').trim();
}

export function pagesText(pages: PdfPage[]): string {
  return pages.map((p) => p.lines.map((l) => l.text).join('\n')).join('\n\f\n');
}
