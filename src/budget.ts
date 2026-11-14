// Monthly spending budgets per expense category: pure maths, no storage or UI.
import { daysIn } from './format.ts';

export type Budgets = Record<string, number>; // category key → monthly limit (rupiah)
export type Level = 0 | 1 | 2;                 // 0 fine, 1 ≥ 80% used, 2 over the limit

export interface BudgetLine {
  cat: string; limit: number; spent: number; left: number;
  used: number;      // spent ÷ limit
  pace: number;      // share of the month that has passed (1 for past months)
  ahead: boolean;    // spending faster than the month is passing
  perDay: number;    // what is left per remaining day (current month only)
  level: Level;
}
export interface BudgetSummary { lines: BudgetLine[]; limit: number; spent: number; left: number; used: number; perDay: number; pace: number }

export const WARN_AT = 0.8;
export const levelOf = (spent: number, limit: number): Level => (spent > limit ? 2 : spent >= limit * WARN_AT ? 1 : 0);

/** Share of month `mk` that has passed on `today` (counting today), 1 for past months, 0 for future ones. */
export function monthPace(mk: string, today: string): number {
  const cur = today.slice(0, 7);
  if (mk < cur) return 1;
  if (mk > cur) return 0;
  return Number(today.slice(8)) / daysIn(mk);
}

export function budgetSummary(budgets: Budgets, byCat: Record<string, number>, mk: string, today: string): BudgetSummary {
  const pace = monthPace(mk, today), daysLeft = mk === today.slice(0, 7) ? daysIn(mk) - Number(today.slice(8)) + 1 : 0;
  const lines: BudgetLine[] = Object.entries(budgets).filter(([, v]) => v > 0).map(([cat, limit]) => {
    const spent = byCat[cat] || 0, left = limit - spent, used = spent / limit;
    return { cat, limit, spent, left, used, pace, ahead: pace < 1 && used > pace + 0.1, perDay: daysLeft && left > 0 ? left / daysLeft : 0, level: levelOf(spent, limit) };
  }).sort((a, b) => b.used - a.used);
  const limit = lines.reduce((s, l) => s + l.limit, 0), spent = lines.reduce((s, l) => s + l.spent, 0), left = limit - spent;
  return { lines, limit, spent, left, used: limit ? spent / limit : 0, perDay: daysLeft && left > 0 ? left / daysLeft : 0, pace };
}

/** Starting point from history: average of the last full months, rounded up to Rp50.000. */
export function suggestBudgets(monthsByCat: Record<string, number>[]): Budgets {
  const n = monthsByCat.length; if (!n) return {};
  const sum: Record<string, number> = {};
  for (const m of monthsByCat) for (const [k, v] of Object.entries(m)) sum[k] = (sum[k] || 0) + v;
  return Object.fromEntries(Object.entries(sum).map(([k, v]) => [k, Math.ceil(v / n / 50_000) * 50_000]).filter(([, v]) => (v as number) > 0));
}

/** Categories whose level went up compared with what was already announced. */
export function newAlerts(prev: Record<string, Level>, lines: BudgetLine[]): BudgetLine[] {
  return lines.filter((l) => l.level > (prev[l.cat] ?? 0));
}
