// Categories per receipt item: one receipt from a supermarket can hold daily needs, snacks and medicine.
// The receipt is saved as one transaction per category (tied together by `rcpt`); tax, service and discounts are
// spread over the parts in proportion, so the parts add up to the receipt total. Pure functions (tested in Node).
import type { Tx } from './model.ts';
import { HIST_MIN, HIST_SHARE, noteTokens, type HistHit } from './smart.ts';

export interface CatItem { name: string; amount: number; qty?: number; cat: string; sub: string }
export interface CatGroup { cat: string; sub: string; items: CatItem[]; base: number; amount: number }

/** Items grouped by category and subcategory, each group's share of `total` (largest group first). */
export function groupByCat(items: CatItem[], total: number): CatGroup[] {
  const map = new Map<string, CatGroup>();
  for (const it of items) {
    if (!(it.amount > 0)) continue;
    const k = it.cat + '|' + it.sub, g = map.get(k) || { cat: it.cat, sub: it.sub, items: [], base: 0, amount: 0 };
    g.items.push(it); g.base += it.amount; map.set(k, g);
  }
  const groups = [...map.values()].sort((a, b) => b.base - a.base);
  const sum = groups.reduce((s, g) => s + g.base, 0), tot = total > 0 ? total : sum;
  for (const g of groups) g.amount = sum ? Math.round((g.base * tot) / sum) : 0;
  // rounding: the largest part takes the last rupiah so the parts add up exactly
  if (groups.length) groups[0].amount += tot - groups.reduce((s, g) => s + g.amount, 0);
  return groups;
}

const UNIT = /^(\d+([.,]\d+)?|gr|g|gram|kg|ml|l|ltr|liter|pcs|pc|isi|x|btl|botol|pck|pack|pak|sachet|sch|bks|box|dus|cup|can|kaleng|pouch|refill|rf|jumbo|besar|kecil|mini)$/;
/** A product's remembered key: its first three meaningful words, without sizes ("Indomie Goreng Ayam 127 gr" → "indomie goreng ayam"). */
export function itemKey(name: string): string {
  const ws = (name.toLowerCase().replace(/\(.*?\)/g, ' ').match(/[a-z0-9]+(?:[.,][0-9]+)?/g) || []).filter((w) => !UNIT.test(w) && !/^\d/.test(w) && w.length >= 2);
  return ws.slice(0, 3).join(' ');
}

/** What products of receipts split by category taught: words of product names that keep landing in one subcategory. */
export function buildItemHistory(txs: Tx[], since: number): Record<string, HistHit> {
  const out: Record<string, HistHit> = {};
  if (!since) return out;
  const counts: Record<string, Record<string, number>> = {};
  for (const t of txs) {
    if (!t.rcpt || !t.items?.length || !t.cat || !t.sub || (t.createdAt || 0) < since) continue;
    const key = t.cat + '|' + t.sub;
    for (const it of t.items) for (const w of noteTokens(it.name)) (counts[w] ||= {})[key] = (counts[w][key] || 0) + 1;
  }
  for (const [w, c] of Object.entries(counts)) {
    let best = '', n = 0, all = 0;
    for (const [k, v] of Object.entries(c)) { all += v; if (v > n) { n = v; best = k; } }
    if (n >= HIST_MIN && n / all >= HIST_SHARE) { const p = best.indexOf('|'); out[w] = { cat: best.slice(0, p), sub: best.slice(p + 1), n }; }
  }
  return out;
}

/** Receipt parts in a list shown as one row: the parts of a receipt collapse into the first one, with all parts attached. */
export function foldReceipts<T extends { id: string; rcpt?: string }>(list: T[]): (T & { parts?: T[] })[] {
  const byR = new Map<string, T[]>();
  for (const t of list) if (t.rcpt) byR.set(t.rcpt, [...(byR.get(t.rcpt) || []), t]);
  const seen = new Set<string>(), out: (T & { parts?: T[] })[] = [];
  for (const t of list) {
    const parts = t.rcpt ? byR.get(t.rcpt)! : null;
    if (!parts || parts.length < 2) { out.push(t); continue; }
    if (seen.has(t.rcpt!)) continue;
    seen.add(t.rcpt!); out.push({ ...t, parts });
  }
  return out;
}
