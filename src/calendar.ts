// Month calendar: pure data for the calendar views (phone Rekap, laptop). No storage or UI.
import type { Tx } from './model.ts';
import type { Rule } from './recurring.ts';
import { monthlyDate } from './recurring.ts';

const pad = (n: number) => String(n).padStart(2, '0');
const lastDay = (y: number, m: number) => new Date(y, m, 0).getDate();

/** Weeks of a month, Monday first; `null` for the blanks before the 1st and after the last day. */
export function monthGrid(mk: string): (string | null)[][] {
  const y = Number(mk.slice(0, 4)), m = Number(mk.slice(5, 7)), n = lastDay(y, m);
  const lead = (new Date(y, m - 1, 1).getDay() + 6) % 7; // Monday = 0
  const cells: (string | null)[] = Array(lead).fill(null);
  for (let d = 1; d <= n; d++) cells.push(`${mk}-${pad(d)}`);
  while (cells.length % 7) cells.push(null);
  const weeks: (string | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

export interface DayTotal { inc: number; out: number; n: number; /** fixed expenses within out */ fixed: number }
/**
 * Money in and out per day of a month. Same rules as the monthly recap: transfers (including debt and investment
 * moves) are neither income nor expense, but they still count as a record of that day.
 */
export function dayTotals(txs: Tx[], mk: string): Record<string, DayTotal> {
  const out: Record<string, DayTotal> = {};
  for (const t of txs) {
    if (!t.date.startsWith(mk)) continue;
    const d = (out[t.date] ||= { inc: 0, out: 0, n: 0, fixed: 0 });
    d.n++;
    if (t.type === 'in') d.inc += t.amount;
    else if (t.type === 'out' && t.cat) { d.out += t.amount; if (t.fixed) d.fixed += t.amount; }
  }
  return out;
}

/** The day with the most spending, fixed expenses left out (null if nothing else was spent). */
export function topDay(totals: Record<string, DayTotal>): string | null {
  let best: string | null = null, v = 0;
  for (const [d, x] of Object.entries(totals)) if (x.out - x.fixed > v) { v = x.out - x.fixed; best = d; }
  return best;
}

/** Days of the month on which an active recurring schedule falls, with the schedules' notes. */
export function ruleDays(rules: Rule[], mk: string): Record<string, string[]> {
  const y = Number(mk.slice(0, 4)), m = Number(mk.slice(5, 7)), n = lastDay(y, m), out: Record<string, string[]> = {};
  const add = (d: string, note: string) => (out[d] ||= []).push(note);
  for (const r of rules) {
    if (!r.active) continue;
    if (r.every === 'month') add(monthlyDate(y, m, r.day), r.note);
    else for (let d = 1; d <= n; d++) if (new Date(y, m - 1, d).getDay() === r.day) add(`${mk}-${pad(d)}`, r.note);
  }
  return out;
}

/** Compact money for a calendar cell: 18000 → "18rb", 1250000 → "1,3jt", 750 → "750". */
export function cellAmt(n: number): string {
  const a = Math.abs(n);
  if (a >= 1e9) return trim(a / 1e9) + 'M';
  if (a >= 1e6) return trim(a / 1e6) + 'jt';
  if (a >= 1e3) return Math.round(a / 1e3) + 'rb';
  return String(Math.round(a));
}
const trim = (v: number) => (v >= 10 ? String(Math.round(v)) : v.toFixed(1).replace(/\.0$/, '').replace('.', ','));
