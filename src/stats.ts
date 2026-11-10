// Aggregations used by Beranda and Rekap.
import type { Tx, Wallet } from './model.ts';
import { addMonths } from './format.ts';

export interface MonthStats {
  inc: number; out: number; n: number;
  byCat: Record<string, number>; bySub: Record<string, number>; byDay: Record<string, number>;
}

export function stats(txs: Tx[], mk: string, maxDay = 0): MonthStats {
  const st: MonthStats = { inc: 0, out: 0, n: 0, byCat: {}, bySub: {}, byDay: {} };
  for (const t of txs) {
    if (!t.date.startsWith(mk)) continue;
    if (maxDay && Number(t.date.slice(8)) > maxDay) continue;
    if (t.type === 'in') st.inc += t.amount;
    if (t.type === 'out' && t.cat) {
      st.out += t.amount; st.n++;
      st.byCat[t.cat] = (st.byCat[t.cat] || 0) + t.amount;
      const sk = t.cat + '|' + t.sub;
      st.bySub[sk] = (st.bySub[sk] || 0) + t.amount;
      st.byDay[t.date] = (st.byDay[t.date] || 0) + t.amount;
    }
  }
  return st;
}

/** Months from the oldest transaction (or this month) up to this month, oldest first. */
export function monthList(txs: Tx[], today: string): string[] {
  const cur = today.slice(0, 7);
  let first = cur;
  for (const t of txs) { const mk = t.date.slice(0, 7); if (mk < first) first = mk; }
  const out: string[] = [];
  for (let mk = first; mk <= cur && out.length < 240; mk = addMonths(mk, 1)) out.push(mk);
  return out;
}

export function balance(txs: Tx[], w: Wallet): number {
  let b = w.init;
  for (const t of txs) {
    if (t.type === 'in' && t.wallet === w.id) b += t.amount;
    else if (t.type === 'out' && t.wallet === w.id) b -= t.amount;
    else if (t.type === 'tf') { if (t.wallet === w.id) b -= t.amount; if (t.to === w.id) b += t.amount; }
  }
  return b;
}
