// Shared bills ("Bayar bersama"): one receipt, several people. Works out what is mine and what is my partner's,
// piece by piece, with shared items divided between the people at the table and tax / service / discount spread
// either in proportion to what each bought or equally per person. Pure functions (tested in Node).

export interface SplitLine {
  name: string;
  /** Line total as printed (all pieces). */
  amount: number;
  qty?: number;
  /** Price of one piece, when known. */
  unit?: number;
  /** Pieces that are mine / my partner's (for a single piece: 0 or 1). Everything else belongs to friends. */
  me: number;
  pa: number;
  /** Shared by the table: divided equally among `n` people (default: everyone), mine/partner's when ticked. */
  shared?: boolean;
  shMe?: boolean;
  shPa?: boolean;
  n?: number;
}
export type ExtraMode = 'prop' | 'equal';
export interface SplitItem { name: string; amount: number; qty?: number }
export interface SplitResult {
  sub: number; extra: number;
  meSub: number; paSub: number;
  me: number; pa: number; friends: number;
  meItems: SplitItem[]; paItems: SplitItem[];
}

const pieces = (l: SplitLine) => (l.qty && l.qty > 1 && Number.isInteger(l.qty) ? l.qty : 1);
/** Price of one piece: as printed when it fits the line total, else line total ÷ pieces. */
export function unitPrice(l: SplitLine): number {
  const q = pieces(l);
  if (l.unit && Math.abs(l.unit * q - l.amount) <= Math.max(2, l.amount * 0.02)) return l.unit;
  return l.amount / q;
}
/** One person's part of a line. */
export function lineShare(l: SplitLine, who: 'me' | 'pa', people: number): number {
  if (l.shared) return (who === 'me' ? l.shMe : l.shPa) ? l.amount / Math.max(1, l.n || people) : 0;
  const q = pieces(l), p = Math.max(0, Math.min(q, who === 'me' ? l.me : l.pa));
  return p >= q ? l.amount : p * unitPrice(l);
}
function itemsOf(lines: SplitLine[], who: 'me' | 'pa', people: number): SplitItem[] {
  const out: SplitItem[] = [];
  for (const l of lines) {
    const v = lineShare(l, who, people); if (!(v > 0)) continue;
    const q = pieces(l), p = who === 'me' ? l.me : l.pa;
    if (l.shared) out.push({ name: `${l.name} (bagi ${Math.max(1, l.n || people)})`, amount: Math.round(v) });
    else if (q > 1 && p < q) out.push({ name: l.name, amount: Math.round(v), ...(p > 1 ? { qty: p } : {}) });
    else out.push({ name: l.name, amount: Math.round(v), ...(q > 1 ? { qty: q } : {}) });
  }
  return out;
}
/**
 * Split a receipt. `total` is what was paid; the difference with the line totals is tax, service and fees minus
 * discounts, spread in proportion to each person's lines ('prop') or equally over the `people` at the table
 * ('equal', only for people who have something on the bill).
 */
export function splitBill(lines: SplitLine[], total: number, people: number, mode: ExtraMode): SplitResult {
  const n = Math.max(1, Math.round(people || 1));
  const sub = lines.reduce((s, l) => s + (l.amount || 0), 0), extra = (total || sub) - sub;
  const meSub = lines.reduce((s, l) => s + lineShare(l, 'me', n), 0), paSub = lines.reduce((s, l) => s + lineShare(l, 'pa', n), 0);
  const part = (x: number) => (!x ? 0 : mode === 'equal' ? extra / n : sub ? (extra * x) / sub : 0);
  const me = Math.round(meSub + part(meSub)), pa = Math.round(paSub + part(paSub));
  return { sub, extra, meSub: Math.round(meSub), paSub: Math.round(paSub), me, pa, friends: Math.max(0, (total || sub) - me - pa), meItems: itemsOf(lines, 'me', n), paItems: itemsOf(lines, 'pa', n) };
}

/** "bagi 3", "dibagi 4", "patungan 3 orang", "ber-3", "bertiga": how many people share a sentence's amount. */
export const SPLIT_RE = /\b(?:(?:di)?bagi|patungan|split|share)\s*(?:ber\s*-?\s*)?(\d{1,2})(?:\s*orang)?\b|\bber\s*-?\s*(\d{1,2})\b|\b(berdua|bertiga|berempat|berlima|berenam|bertujuh)\b/;
const WORDS: Record<string, number> = { berdua: 2, bertiga: 3, berempat: 4, berlima: 5, berenam: 6, bertujuh: 7 };
export function splitCount(m: RegExpMatchArray): number {
  const n = m[1] ? Number(m[1]) : m[2] ? Number(m[2]) : WORDS[m[3]] || 0;
  return n >= 2 && n <= 30 ? n : 0;
}
