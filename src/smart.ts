// Learning the category from the person's own history: words that keep ending up in the same subcategory.
// Only transactions saved from `since` on count (the moment this was switched on): older ones were mostly guessed by
// the built-in word list, so they would only teach it back to itself.
import type { Tx } from './model.ts';

export interface HistHit { cat: string; sub: string; n: number }

const SKIP = new Set(['yang', 'dan', 'dari', 'untuk', 'buat', 'beli', 'bayar', 'pakai', 'pake', 'sama', 'dengan', 'dgn', 'utk', 'via', 'lewat',
  'tadi', 'pagi', 'siang', 'sore', 'malam', 'hari', 'ini', 'itu', 'kemarin', 'bulan', 'minggu', 'tahun', 'rupiah', 'ribu', 'juta', 'masuk',
  'terima', 'dapat', 'dapet', 'transfer', 'isi', 'saldo', 'uang', 'duit', 'lagi', 'juga', 'aja', 'saja', 'nya', 'punya', 'lainnya', 'tunai']);

/** Meaningful words of a note, plus each pair of neighbouring words ("nasi padang"). */
export function noteTokens(note: string): string[] {
  const ws = (note.toLowerCase().match(/[a-z]+/g) || []).filter((w) => w.length >= 3 && !SKIP.has(w));
  const out = new Set(ws);
  for (let i = 0; i + 1 < ws.length; i++) out.add(ws[i] + ' ' + ws[i + 1]);
  return [...out];
}

/** Minimum times a word must have been saved in one subcategory, and the share of its uses that must agree. */
export const HIST_MIN = 2, HIST_SHARE = 0.6;

export function buildHistory(txs: Tx[], since: number): Record<string, HistHit> {
  const out: Record<string, HistHit> = {};
  if (!since) return out;
  const counts: Record<string, Record<string, number>> = {};
  for (const t of txs) {
    if (t.type === 'tf' || !t.cat || !t.sub || t.debt || t.inv || t.rec || t.feeOf || (t.createdAt || 0) < since) continue;
    const key = t.cat + '|' + t.sub;
    for (const w of noteTokens(t.note)) (counts[w] ||= {})[key] = (counts[w][key] || 0) + 1;
  }
  for (const [w, c] of Object.entries(counts)) {
    let best = '', n = 0, all = 0;
    for (const [k, v] of Object.entries(c)) { all += v; if (v > n) { n = v; best = k; } }
    if (n >= HIST_MIN && n / all >= HIST_SHARE) { const p = best.indexOf('|'); out[w] = { cat: best.slice(0, p), sub: best.slice(p + 1), n }; }
  }
  return out;
}

/** The history hit for a text: a remembered pair of words beats a single word, then the most-used one. */
export function histHit(text: string, hist: Record<string, HistHit> | undefined): (HistHit & { word: string }) | null {
  if (!hist) return null;
  let best: (HistHit & { word: string }) | null = null;
  for (const w of noteTokens(text)) {
    const h = hist[w]; if (!h) continue;
    const better = !best || (w.includes(' ') && !best.word.includes(' ')) || (w.includes(' ') === best.word.includes(' ') && h.n > best.n);
    if (better) best = { ...h, word: w };
  }
  return best;
}
