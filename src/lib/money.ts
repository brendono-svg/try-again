const nzd = new Intl.NumberFormat('en-NZ', { style: 'currency', currency: 'NZD' });
const nzd0 = new Intl.NumberFormat('en-NZ', { style: 'currency', currency: 'NZD', maximumFractionDigits: 0 });

export function fmt(n: number): string {
  return nzd.format(n);
}

export function fmt0(n: number): string {
  return nzd0.format(Math.round(n));
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Money as printed on statements: "1,234.56", "$1,234.56", "-12.00", "12.00-", "(12.00)", "12.00 CR". */
export const MONEY_RE = /^\(?-?\$?\s?\d{1,3}(?:,\d{3})*(?:\.\d{2})\)?-?$|^\(?-?\$?\s?\d+\.\d{2}\)?-?$/;

export function parseMoney(s: string): number | undefined {
  const t = s.trim().replace(/\s+(CR|DR|OD)$/i, '');
  if (!MONEY_RE.test(t)) return undefined;
  const neg = /^\(|^-|-$|\)$/.test(t) || /^-\$/.test(t);
  const n = Number(t.replace(/[()$,\s-]/g, ''));
  if (!Number.isFinite(n)) return undefined;
  const v = neg ? -n : n;
  if (/\s(DR|OD)$/i.test(s.trim())) return -Math.abs(v);
  return v;
}

/** Loose parse for CSV cells ("1234.5", "-$12", "12.00 CR"). */
export function parseAmountCell(s: string): number | undefined {
  if (s == null) return undefined;
  const raw = String(s).trim();
  if (!raw) return undefined;
  const cr = /\bCR$/i.test(raw);
  const dr = /\bDR$/i.test(raw);
  const neg = /^\(.*\)$/.test(raw) || /^-|-$/.test(raw.replace(/\s*(CR|DR)$/i, ''));
  const n = Number(raw.replace(/\s*(CR|DR)$/i, '').replace(/[()$,\s-]/g, ''));
  if (!Number.isFinite(n)) return undefined;
  if (cr) return Math.abs(n);
  if (dr) return -Math.abs(n);
  return neg ? -n : n;
}
