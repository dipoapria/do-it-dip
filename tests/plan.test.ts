import { test } from 'node:test';
import assert from 'node:assert/strict';
import { debtLeft, debtPaid, dsr, etaMonths, goalLeft, goalPct, monthlyInstalments, monthlyNeed, monthsLeft, netWorth, openingTx, paymentTx, type Debt, type Goal } from '../src/plan.ts';
import { balance, stats } from '../src/stats.ts';
import type { Tx, Wallet } from '../src/model.ts';

const goal = (o: Partial<Goal> = {}): Goal => ({ id: 'g', name: 'Dana darurat', icon: 'shield-check', color: '#000', target: 12_000_000, deadline: '', log: [], done: false, createdAt: 0, ...o });

test('goal progress, months left and monthly need', () => {
  const g = goal({ deadline: '2027-10-31', log: [{ date: '2026-09-01', amount: 2_000_000 }, { date: '2026-10-01', amount: 1_000_000 }, { date: '2026-10-15', amount: -500_000 }] });
  assert.equal(goalLeft(g), 9_500_000);
  assert.equal(Math.round(goalPct(g) * 1000), 208);
  assert.equal(monthsLeft('2027-10-31', '2026-11-14'), 12); // Nov 2026 … Oct 2027
  assert.equal(monthsLeft('2026-11-10', '2026-11-14'), 1);  // already passed this month → still 1
  assert.equal(monthlyNeed(g, '2026-11-14'), 792_000);      // 9.5 jt / 12, rounded up to Rp1.000
  assert.equal(monthlyNeed(goal(), '2026-11-14'), 0);       // no deadline
  assert.equal(etaMonths(g, '2026-11-14'), 12);             // pace 2.5 jt / 3 months
  assert.equal(etaMonths(goal(), '2026-11-14'), null);
});

const W: Wallet = { id: 'bsb', name: 'BSB', short: 'B', group: 'Bank', color: '', init: 1_000_000, order: 0, aliases: [], book: 'pribadi' };
const debt = (o: Partial<Debt> = {}): Debt => ({ id: 'd1', kind: 'utang', name: 'Budi', amount: 3_000_000, date: '2026-10-01', due: '', monthly: 500_000, wallet: 'bsb', note: '', createdAt: 0, ...o });
const asTx = (t: Omit<Tx, 'id' | 'createdAt' | 'updatedAt'>, id: string): Tx => ({ ...t, id, createdAt: 0, updatedAt: 0 });

test('a cash loan moves money without counting as income or expense', () => {
  const d = debt();
  const txs = [asTx(openingTx(d)!, 'a'), asTx(paymentTx(d, 500_000, 'bsb', '2026-11-01'), 'b')];
  assert.equal(balance(txs, W), 1_000_000 + 3_000_000 - 500_000);
  const st = stats(txs, '2026-11');
  assert.equal(st.inc, 0); assert.equal(st.out, 0);
  assert.equal(debtPaid(d, txs), 500_000);
  assert.equal(debtLeft(d, txs), 2_500_000);
});

test('credit purchases: payments are expenses; services owed: receipts are income', () => {
  const kredit = debt({ id: 'k', name: 'Kredit motor', wallet: '', amount: 18_000_000, monthly: 900_000 });
  assert.equal(openingTx(kredit), null);
  const pay = paymentTx(kredit, 900_000, 'bsb', '2026-11-05');
  assert.equal(pay.type, 'out'); assert.equal(pay.cat, 'tagihan');
  const jasa = debt({ id: 'j', kind: 'piutang', name: 'Klien', wallet: '', amount: 2_000_000 });
  const rec = paymentTx(jasa, 2_000_000, 'bsb', '2026-11-06');
  assert.equal(rec.type, 'in');
  const txs = [asTx(pay, 'p'), asTx(rec, 'r')];
  const st = stats(txs, '2026-11');
  assert.equal(st.out, 900_000); assert.equal(st.inc, 2_000_000);
  assert.equal(debtLeft(jasa, txs), 0);
});

test('lending money out and getting it back', () => {
  const d = debt({ id: 'l', kind: 'piutang', name: 'Andi', amount: 400_000 });
  const txs = [asTx(openingTx(d)!, 'a'), asTx(paymentTx(d, 150_000, 'bsb', '2026-11-02'), 'b')];
  assert.equal(balance(txs, W), 1_000_000 - 400_000 + 150_000);
  assert.equal(debtLeft(d, txs), 250_000);
});

test('net worth and instalment ratio', () => {
  const debts = [debt(), debt({ id: 'k', wallet: '', amount: 18_000_000, monthly: 900_000 }), debt({ id: 'l', kind: 'piutang', amount: 400_000, monthly: 0 })];
  const nw = netWorth(10_000_000, debts, []);
  assert.deepEqual(nw, { cash: 10_000_000, receivable: 400_000, owed: 21_000_000, net: -10_600_000 });
  assert.equal(monthlyInstalments(debts, []), 1_400_000);
  assert.equal(dsr(1_400_000, 5_000_000), 0.28);
  assert.equal(dsr(1, 0), null);
});
