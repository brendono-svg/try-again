export const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
  january: 1, february: 2, march: 3, april: 4, june: 6, july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
};

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

export function iso(y: number, m: number, d: number): string {
  return `${y}-${pad(m)}-${pad(d)}`;
}

export function validDate(y: number, m: number, d: number): boolean {
  if (m < 1 || m > 12 || d < 1 || d > 31 || y < 1900 || y > 2200) return false;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCMonth() === m - 1;
}

function toUTC(isoDate: string): number {
  const [y, m, d] = isoDate.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

export function daysBetween(a: string, b: string): number {
  return Math.round((toUTC(b) - toUTC(a)) / 86400000);
}

export function addDays(isoDate: string, n: number): string {
  const dt = new Date(toUTC(isoDate) + n * 86400000);
  return iso(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
}

export function fullYear(y: number): number {
  return y < 100 ? 2000 + y : y;
}

/**
 * Parse a full date in any of the common NZ statement formats:
 * "16 September 2021", "16 Sep 21", "16/09/2021", "2021/09/16", "2021-09-16", "20210916".
 * NZ ordering (day first) is assumed for numeric dates.
 */
export function parseFullDate(s: string): string | undefined {
  s = s.trim();
  let m = s.match(/^(\d{1,2})(?:st|nd|rd|th)?[\s\-/.]+([A-Za-z]{3,9})\.?,?[\s\-/.]+(\d{2,4})\b/);
  if (m) {
    const mon = MONTHS[m[2].toLowerCase()];
    const y = fullYear(Number(m[3]));
    if (mon && validDate(y, mon, Number(m[1]))) return iso(y, mon, Number(m[1]));
  }
  m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})\b/);
  if (m && validDate(+m[1], +m[2], +m[3])) return iso(+m[1], +m[2], +m[3]);
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})\b/);
  if (m) {
    const y = fullYear(+m[3]);
    if (validDate(y, +m[2], +m[1])) return iso(y, +m[2], +m[1]);
  }
  m = s.match(/^(\d{4})(\d{2})(\d{2})\b/);
  if (m && validDate(+m[1], +m[2], +m[3])) return iso(+m[1], +m[2], +m[3]);
  return undefined;
}

/** Find every full date mentioned anywhere in a block of text. */
export function findDates(text: string): string[] {
  const out: string[] = [];
  const re = /\b(\d{1,2}(?:st|nd|rd|th)?[\s\-/.]+[A-Za-z]{3,9}\.?,?[\s\-/.]+\d{4}|\d{1,2}[/.-]\d{1,2}[/.-]\d{4}|\d{4}[/-]\d{1,2}[/-]\d{1,2})\b/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const d = parseFullDate(m[1]);
    if (d) out.push(d);
  }
  return out;
}

export interface PartialDate {
  day: number;
  month: number;
  year?: number;
  /** Number of characters consumed from the start of the string. */
  length: number;
}

/** Parse a date at the very start of a statement line, where the year is often missing ("19 Jul"). */
export function parseLeadingDate(s: string): PartialDate | undefined {
  let m = s.match(/^(\d{1,2})[\s\-/.]?([A-Za-z]{3,9})\.?(?:[\s\-/.](\d{4}|\d{2}(?![\d:.])(?!\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b)))?(?=\s|$)/i);
  if (m) {
    const month = MONTHS[m[2].toLowerCase()];
    const day = Number(m[1]);
    if (month && day >= 1 && day <= 31) {
      return { day, month, year: m[3] ? fullYear(Number(m[3])) : undefined, length: m[0].length };
    }
  }
  m = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?=\s|$)/);
  if (m) return { year: +m[1], month: +m[2], day: +m[3], length: m[0].length };
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2,4}))?(?=\s|$)/);
  if (m && +m[2] >= 1 && +m[2] <= 12 && +m[1] >= 1 && +m[1] <= 31) {
    return { day: +m[1], month: +m[2], year: m[3] ? fullYear(+m[3]) : undefined, length: m[0].length };
  }
  return undefined;
}

/**
 * Resolve a partial date against the statement end date: statements list
 * "19 Jul" without a year, so pick the latest year that doesn't land after the
 * statement end (allowing a week's grace for processing dates).
 */
export function resolveDate(p: PartialDate, periodEnd?: string): string | undefined {
  if (p.year) return validDate(p.year, p.month, p.day) ? iso(p.year, p.month, p.day) : undefined;
  const endYear = periodEnd ? Number(periodEnd.slice(0, 4)) : new Date().getFullYear();
  let candidate = iso(endYear, p.month, p.day);
  if (periodEnd && daysBetween(periodEnd, candidate) > 7) candidate = iso(endYear - 1, p.month, p.day);
  const [y, m, d] = candidate.split('-').map(Number);
  return validDate(y, m, d) ? candidate : undefined;
}

export function monthKey(isoDate: string): string {
  return isoDate.slice(0, 7);
}

export function monthLabel(key: string, withYear = true): string {
  const [y, m] = key.split('-').map(Number);
  return withYear ? `${MONTH_NAMES[m - 1]} ${String(y).slice(2)}` : MONTH_NAMES[m - 1];
}

export function formatDate(isoDate: string): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  return `${d} ${MONTH_NAMES[m - 1]} ${y}`;
}

export function monthRange(from: string, to: string): string[] {
  const out: string[] = [];
  let [y, m] = from.split('-').map(Number);
  const [ty, tm] = to.split('-').map(Number);
  while (y < ty || (y === ty && m <= tm)) {
    out.push(`${y}-${pad(m)}`);
    m++;
    if (m > 12) { m = 1; y++; }
  }
  return out;
}

export function todayIso(): string {
  const d = new Date();
  return iso(d.getFullYear(), d.getMonth() + 1, d.getDate());
}
