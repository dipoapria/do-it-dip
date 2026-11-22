// Weekly balance check ("Cocokkan saldo"): when to offer it, which wallets moved, and the streak of finished weeks.
// Pure functions (tested in Node); the screens are in app.ts.
import type { Tx } from './model.ts';

const pad = (n: number) => String(n).padStart(2, '0');
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** Offer from Sunday 18:00 … */
export const OFFER_HOUR = 18;
/** … until the end of Monday (30 hours). */
export const OFFER_SPAN_H = 30;

/** The latest Sunday 18:00 at or before `now`: its date (the week's key) and time. */
export function weekAnchor(now: Date): { key: string; start: number } {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate(), OFFER_HOUR, 0, 0, 0);
  d.setDate(d.getDate() - d.getDay()); // back to Sunday
  if (d.getTime() > now.getTime()) d.setDate(d.getDate() - 7);
  return { key: ymd(d), start: d.getTime() };
}

export interface ReconState { reconSkip?: string; reconAll?: number }
/**
 * The week key when the weekly offer should show now, else null: inside the Sunday-evening window, not skipped this
 * week, and no full check done since Saturday morning (a check made just before counts for the week).
 */
export function reconDue(now: Date, s: ReconState): string | null {
  const { key, start } = weekAnchor(now);
  if (now.getTime() >= start + OFFER_SPAN_H * 3600e3) return null;
  if (s.reconSkip === key) return null;
  if ((s.reconAll || 0) >= start - 36 * 3600e3) return null;
  return key;
}

/**
 * The week a full check made now counts for: inside the Sunday-evening window that week, from Saturday morning the
 * coming Sunday; otherwise none (a mid-week check is still logged, it just does not finish a week).
 */
export function checkWeek(now: Date): string | null {
  const a = weekAnchor(now);
  if (now.getTime() < a.start + OFFER_SPAN_H * 3600e3) return a.key;
  const next = new Date(a.start); next.setDate(next.getDate() + 7);
  return now.getTime() >= next.getTime() - 36 * 3600e3 ? ymd(next) : null;
}

/** Transactions touching a wallet that were saved or changed after `since` (ms). */
export function movedSince(txs: Tx[], wallet: string, since: number): number {
  return txs.filter((t) => (t.wallet === wallet || t.to === wallet) && Math.max(t.createdAt || 0, t.updatedAt || 0) > since).length;
}

/** Weeks in a row (ending with the latest finished week) whose weekly check was finished. */
export function streak(weeks: string[], now: Date): number {
  const done = new Set(weeks);
  const d = new Date(weekAnchor(now).start);
  if (!done.has(ymd(d))) d.setDate(d.getDate() - 7); // this week not done (yet): count up to last week
  let n = 0;
  while (done.has(ymd(d))) { n++; d.setDate(d.getDate() - 7); }
  return n;
}

export interface ReconEntry { at: number; wallet: string; app: number; real: number; gap: number; kind: 'same' | 'adj' | 'found' }
/** Checks grouped by month (newest first) with the total gap that had to be adjusted. */
export function logByMonth(log: ReconEntry[]): { mk: string; n: number; adjusted: number; items: ReconEntry[] }[] {
  const g = new Map<string, ReconEntry[]>();
  for (const e of [...log].sort((a, b) => b.at - a.at)) { const mk = ymd(new Date(e.at)).slice(0, 7); g.set(mk, [...(g.get(mk) || []), e]); }
  return [...g.entries()].map(([mk, items]) => ({ mk, n: items.length, adjusted: items.filter((x) => x.kind === 'adj').reduce((s, x) => s + x.gap, 0), items }));
}
