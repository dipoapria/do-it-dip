// Shared helpers for reading rupiah amounts and dates out of free text (receipts, bank statements).
import { pad } from './format.ts';

/**
 * Parse an Indonesian-formatted amount: "87.400", "87,400", "Rp 87.400,00", "1.250.000,50", "-35.000", "35000".
 * Returns whole rupiah (decimals dropped) or null when the token is not a money amount.
 */
export function parseAmount(tok: string): number | null {
  let s = tok.replace(/rp\.?/i, '').replace(/\s/g, '').trim();
  let neg = false;
  if (/^-|-$|^\(.*\)$/.test(s)) { neg = true; s = s.replace(/[()-]/g, ''); }
  if (!/^\d[\d.,]*$/.test(s)) return null;
  // A two-digit decimal part is dropped: "1.250.000,50", "1,250,000.50", "87.400,00", "1234.50", "35.00".
  const m = s.match(/^(\d{1,3}(?:([.,])\d{3})+|\d+)([.,])(\d{2})$/);
  if (m) {
    if (m[2] && m[2] !== m[3]) s = m[1];
    else if (!m[2] && (m[1].length >= 4 || Number(m[4]) === 0)) s = m[1];
    else if (!m[2]) return null; // "87,40" is ambiguous
  }
  if (!/^\d{1,3}(?:([.,])\d{3})*$|^\d+$/.test(s)) return null;
  const n = Number(s.replace(/[.,]/g, ''));
  return Number.isFinite(n) ? (neg ? -n : n) : null;
}

/** All money-looking tokens on a line, left to right. */
export const AMOUNT_TOKEN = /(?:rp\.?\s?)?-?\(?\d{1,3}(?:[.,]\d{3})+(?:[.,]\d{2})?\)?-?|(?:rp\.?\s?)\d{4,}(?:[.,]\d{2})?|\b\d{4,}(?:[.,]\d{2})?\b/gi;
export function amountsIn(line: string): { value: number; index: number; raw: string }[] {
  const out: { value: number; index: number; raw: string }[] = [];
  const re = new RegExp(AMOUNT_TOKEN.source, 'gi');
  let m: RegExpExecArray | null;
  while ((m = re.exec(line))) {
    const v = parseAmount(m[0]);
    if (v !== null) out.push({ value: v, index: m.index, raw: m[0] });
  }
  return out;
}

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, mei: 5, may: 5, jun: 6, jul: 7, agu: 8, agt: 8, aug: 8, sep: 9, okt: 10, oct: 10, nov: 11, des: 12, dec: 12,
};
function mkDate(y: number, m: number, d: number): string | null {
  if (y < 100) y += 2000;
  if (m < 1 || m > 12 || d < 1 || d > 31 || y < 2000 || y > 2100) return null;
  return `${y}-${pad(m)}-${pad(d)}`;
}
/** Matches a date anywhere in a string; `fallbackYear` is used for "dd/mm" without a year. */
export const DATE_TOKEN = /\b(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})\b|\b(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})\b|\b(\d{1,2})[\s-]([a-z]{3})[a-z]*[\s-](\d{2,4})\b|\b(\d{1,2})[/-](\d{1,2})\b(?![-/.]\d)/i;
export function findDate(text: string, fallbackYear: number): { date: string; index: number; raw: string } | null {
  const re = new RegExp(DATE_TOKEN.source, 'gi');
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    let d: string | null = null;
    if (m[1]) d = mkDate(+m[1], +m[2], +m[3]);
    else if (m[4]) d = mkDate(+m[6], +m[5], +m[4]);
    else if (m[7]) { const mo = MONTHS[m[8].toLowerCase().slice(0, 3)]; if (mo) d = mkDate(+m[9], mo, +m[7]); }
    else if (m[10]) d = mkDate(fallbackYear, +m[11], +m[10]);
    if (d) return { date: d, index: m.index, raw: m[0] };
  }
  return null;
}
/** Date from a spreadsheet cell: Date object, Excel serial number or text. */
export function cellDate(v: unknown, fallbackYear: number): string | null {
  if (v instanceof Date && !isNaN(v.getTime())) return mkDate(v.getFullYear(), v.getMonth() + 1, v.getDate());
  if (typeof v === 'number' && v > 30000 && v < 80000) { const d = new Date(Math.round((v - 25569) * 864e5)); return mkDate(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()); }
  if (typeof v === 'string') return findDate(v, fallbackYear)?.date ?? null;
  return null;
}
