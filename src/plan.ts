// Savings goals and debts: pure maths, no storage or UI.
//
// Goals are envelopes: money set aside stays in its wallet, the goal only remembers how much of the
// total balance is reserved for it.
//
// Debts move money through a pseudo wallet "debt:<id>" (as transfers), so borrowing is not income and
// repaying a cash loan is not an expense. A debt with no cash involved (bought on credit, paylater, a
// service someone still owes you) is the exception: its payments are real expenses / income.
import type { Tx } from './model.ts';

export interface GoalEntry { date: string; amount: number; note?: string }
export interface Goal {
  id: string;
  name: string;
  icon: string;          // lucide icon name
  color: string;
  target: number;
  deadline: string;      // YYYY-MM-DD or ''
  log: GoalEntry[];      // + set aside, − taken back
  done: boolean;
  createdAt: number;
}

export type DebtKind = 'utang' | 'piutang'; // utang = I owe; piutang = someone owes me
export interface Debt {
  id: string;
  kind: DebtKind;
  name: string;          // person or lender, e.g. "Budi", "Kredit motor"
  amount: number;        // principal
  date: string;
  due: string;           // YYYY-MM-DD or ''
  monthly: number;       // agreed instalment per month, 0 = none
  /** Wallet the borrowed money went into / the lent money came from, or '' when no cash moved. */
  wallet: string;
  note: string;
  createdAt: number;
}

export const debtWallet = (id: string) => 'debt:' + id;
export const isDebtWallet = (w: string | null | undefined) => !!w && w.startsWith('debt:');

/* ---------------- goals ---------------- */
export const goalSaved = (g: Goal) => Math.max(0, g.log.reduce((s, e) => s + e.amount, 0));
export const goalLeft = (g: Goal) => Math.max(0, g.target - goalSaved(g));
export const goalPct = (g: Goal) => (g.target ? Math.min(1, goalSaved(g) / g.target) : 0);

/** Whole months from today until the deadline, counting the current month (min 1); 0 without deadline. */
export function monthsLeft(deadline: string, today: string): number {
  if (!deadline) return 0;
  const [y1, m1] = today.split('-').map(Number), [y2, m2] = deadline.split('-').map(Number);
  return Math.max(1, (y2 - y1) * 12 + (m2 - m1) + (deadline.slice(8) >= today.slice(8) ? 1 : 0));
}
/** Amount to set aside per month to reach the goal on time (0 when reached or without deadline). */
export function monthlyNeed(g: Goal, today: string): number {
  const left = goalLeft(g), n = monthsLeft(g.deadline, today);
  return left && n ? Math.ceil(left / n / 1000) * 1000 : 0;
}
/** Months until reached at the average pace of the last 3 months of entries, or null if no pace. */
export function etaMonths(g: Goal, today: string): number | null {
  const [y, m] = today.split('-').map(Number), from = new Date(y, m - 4, 1);
  const since = `${from.getFullYear()}-${String(from.getMonth() + 1).padStart(2, '0')}-01`;
  const pace = g.log.filter((e) => e.date >= since).reduce((s, e) => s + e.amount, 0) / 3;
  if (pace <= 0) return null;
  return Math.ceil(goalLeft(g) / pace);
}
export const allocated = (goals: Goal[]) => goals.filter((g) => !g.done).reduce((s, g) => s + goalSaved(g), 0);

/* ---------------- debts ---------------- */
/** Payments made (utang) or received (piutang): every linked transaction except the opening one. */
export function debtPaid(d: Debt, txs: Tx[]): number {
  return txs.filter((t) => t.debt === d.id && !t.debtInit).reduce((s, t) => s + t.amount, 0);
}
export const debtLeft = (d: Debt, txs: Tx[]) => Math.max(0, d.amount - debtPaid(d, txs));
export const debtDone = (d: Debt, txs: Tx[]) => debtLeft(d, txs) === 0;

/** The opening transaction when cash moved, else null. */
export function openingTx(d: Debt): Omit<Tx, 'id' | 'createdAt' | 'updatedAt'> | null {
  if (!d.wallet) return null;
  const pw = debtWallet(d.id), borrow = d.kind === 'utang';
  return {
    date: d.date, type: 'tf', cat: null, sub: null, amount: d.amount,
    wallet: borrow ? pw : d.wallet, to: borrow ? d.wallet : pw,
    note: borrow ? `Pinjam dari ${d.name}` : `Pinjamkan ke ${d.name}`, book: 'pribadi', debt: d.id, debtInit: true,
  };
}
/** A payment (utang) or a repayment received (piutang) through `wallet`. */
export function paymentTx(d: Debt, amount: number, wallet: string, date: string): Omit<Tx, 'id' | 'createdAt' | 'updatedAt'> {
  const pay = d.kind === 'utang', base = { date, amount, book: 'pribadi', debt: d.id, note: pay ? `Bayar ${d.name}` : `Terima dari ${d.name}` };
  if (d.wallet) { // cash loan: just moves money back
    const pw = debtWallet(d.id);
    return { ...base, type: 'tf', cat: null, sub: null, wallet: pay ? wallet : pw, to: pay ? pw : wallet };
  }
  return pay
    ? { ...base, type: 'out', cat: 'tagihan', sub: 'Cicilan & paylater', wallet, to: null }
    : { ...base, type: 'in', cat: 'masuk_lain', sub: 'Lainnya', wallet, to: null };
}

export interface NetWorth { cash: number; receivable: number; owed: number; net: number }
export function netWorth(cash: number, debts: Debt[], txs: Tx[]): NetWorth {
  let receivable = 0, owed = 0;
  for (const d of debts) { const left = debtLeft(d, txs); if (d.kind === 'piutang') receivable += left; else owed += left; }
  return { cash, receivable, owed, net: cash + receivable - owed };
}

/** Monthly instalments still running (utang with a monthly amount and something left to pay). */
export function monthlyInstalments(debts: Debt[], txs: Tx[]): number {
  return debts.filter((d) => d.kind === 'utang' && d.monthly > 0 && debtLeft(d, txs) > 0).reduce((s, d) => s + Math.min(d.monthly, debtLeft(d, txs)), 0);
}
/** Debt service ratio: instalments ÷ monthly income. Planners usually advise ≤ 30%. */
export function dsr(instalments: number, income: number): number | null {
  return income > 0 ? instalments / income : null;
}
