// Recurring transactions (salary, instalments, subscriptions): pure schedule logic, no storage or UI.
import type { Tx, TxType } from './model.ts';

export type Every = 'month' | 'week';

export interface Rule {
  id: string;
  type: TxType;
  amount: number;
  cat: string | null;
  sub: string | null;
  wallet: string;
  to: string | null;
  note: string;
  book: string;
  every: Every;
  /** Day of month 1–31 (clamped to the month's last day) or weekday 0–6 (Sunday = 0). */
  day: number;
  /** true = record by itself when due; false = ask on Beranda first (amount may differ, e.g. electricity). */
  auto: boolean;
  /** Last date that was handled (recorded or skipped), YYYY-MM-DD. Nothing on or before it is due again. */
  last: string;
  active: boolean;
  createdAt: number;
}

const pad = (n: number) => String(n).padStart(2, '0');
const iso = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;
const parse = (s: string) => { const [y, m, d] = s.split('-').map(Number); return { y, m, d }; };
const lastDay = (y: number, m: number) => new Date(y, m, 0).getDate();
function addDays(s: string, n: number): string {
  const { y, m, d } = parse(s), t = new Date(y, m - 1, d + n);
  return iso(t.getFullYear(), t.getMonth() + 1, t.getDate());
}
const weekday = (s: string) => { const { y, m, d } = parse(s); return new Date(y, m - 1, d).getDay(); };

/** Occurrence date of a monthly rule in a given month (day clamped, e.g. 31 → 28/29 Feb). */
export function monthlyDate(y: number, m: number, day: number): string {
  return iso(y, m, Math.min(day, lastDay(y, m)));
}

/** The first occurrence strictly after `after`. */
export function nextAfter(rule: Pick<Rule, 'every' | 'day'>, after: string): string {
  if (rule.every === 'week') {
    const diff = (rule.day - weekday(after) + 7) % 7 || 7;
    return addDays(after, diff);
  }
  let { y, m } = parse(after);
  for (let i = 0; i < 3; i++) {
    const c = monthlyDate(y, m, rule.day);
    if (c > after) return c;
    m++; if (m > 12) { m = 1; y++; }
  }
  return monthlyDate(y, m, rule.day);
}

/** Dates due up to and including `today`, oldest first (capped so a long absence can't flood the book). */
export function dueDates(rule: Rule, today: string, cap = 36): string[] {
  if (!rule.active) return [];
  const out: string[] = [];
  let d = nextAfter(rule, rule.last);
  while (d <= today && out.length < cap) { out.push(d); d = nextAfter(rule, d); }
  return out;
}

/** Deterministic id, so the same occurrence is never recorded twice (also across synced devices). */
export const occurrenceId = (ruleId: string, date: string) => `r-${ruleId}-${date}`;

/** The transaction for one occurrence. */
export function occurrenceTx(rule: Rule, date: string, now: number, amount = rule.amount): Tx {
  return {
    id: occurrenceId(rule.id, date), date, type: rule.type, cat: rule.cat, sub: rule.sub, amount,
    wallet: rule.wallet, to: rule.to, note: rule.note, book: rule.book, rec: rule.id, createdAt: now, updatedAt: now,
  };
}

/** A new rule repeating an existing transaction from its own date onward. */
export function ruleFromTx(t: Tx, id: string, every: Every, now: number): Rule {
  return {
    id, type: t.type, amount: t.amount, cat: t.cat, sub: t.sub, wallet: t.wallet, to: t.to, note: t.note, book: t.book,
    every, day: every === 'week' ? weekday(t.date) : parse(t.date).d, auto: t.type === 'in' || t.type === 'tf',
    last: t.date, active: true, createdAt: now,
  };
}

export const HARI_LONG = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
/** "Tiap tanggal 25", "Tiap akhir bulan", "Tiap Jumat". */
export function scheduleLabel(rule: Pick<Rule, 'every' | 'day'>): string {
  if (rule.every === 'week') return 'Tiap ' + HARI_LONG[rule.day];
  return rule.day >= 31 ? 'Tiap akhir bulan' : 'Tiap tanggal ' + rule.day;
}
