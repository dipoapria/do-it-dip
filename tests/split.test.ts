import { test } from 'node:test';
import assert from 'node:assert/strict';
import { splitBill, unitPrice, type SplitLine } from '../src/split.ts';
import { parseLine, type ParseCtx } from '../src/parser.ts';
import { DEFAULT_WALLETS } from '../src/model.ts';

const L = (o: Partial<SplitLine>): SplitLine => ({ name: 'x', amount: 0, me: 0, pa: 0, ...o });

test('pieces: 2 of 5 Indomie are mine', () => {
  const r = splitBill([L({ name: 'Indomie Goreng', amount: 17500, qty: 5, me: 2 })], 17500, 2, 'prop');
  assert.equal(r.me, 7000);
  assert.equal(r.friends, 10500);
  assert.deepEqual(r.meItems, [{ name: 'Indomie Goreng', amount: 7000, qty: 2 }]);
});

test('unit price: printed when it fits, else line ÷ pieces', () => {
  assert.equal(unitPrice(L({ amount: 17500, qty: 5, unit: 3500 })), 3500);
  assert.equal(unitPrice(L({ amount: 17500, qty: 5, unit: 17500 })), 3500); // AI put the line total in unit
  assert.equal(unitPrice(L({ amount: 9000, qty: 3 })), 3000);
});

test('mine, partner, friends and a shared pizza; tax spread in proportion or equally', () => {
  const lines = [
    L({ name: 'Nasi Goreng', amount: 30000, me: 1 }),
    L({ name: 'Mie Goreng', amount: 25000, pa: 1 }),
    L({ name: 'Ayam Bakar', amount: 45000 }),
    L({ name: 'Pizza Besar', amount: 90000, shared: true, shMe: true, shPa: true }),
  ];
  // subtotal 190.000, total 209.000 (10% tax − nothing) → extra 19.000; 3 people at the table
  const p = splitBill(lines, 209000, 3, 'prop');
  assert.equal(p.meSub, 60000); // 30.000 + 90.000/3
  assert.equal(p.paSub, 55000);
  assert.equal(p.me, 66000); // + 19.000 × 60/190
  assert.equal(p.pa, 60500);
  assert.equal(p.friends, 209000 - 66000 - 60500);
  assert.deepEqual(p.meItems.map((i) => i.name), ['Nasi Goreng', 'Pizza Besar (bagi 3)']);
  const e = splitBill(lines, 209000, 3, 'equal');
  assert.equal(e.me, 60000 + Math.round(19000 / 3));
});

test('discounts lower the shares; nothing marked = nothing owed', () => {
  const r = splitBill([L({ amount: 50000, me: 1 }), L({ amount: 50000 })], 90000, 2, 'prop');
  assert.equal(r.me, 45000);
  assert.equal(splitBill([L({ amount: 50000 })], 50000, 2, 'prop').me, 0);
});

test('sentences: "bagi 3", "patungan 90rb ber-3", "bertiga"', () => {
  const ctx: ParseCtx = { today: '2026-11-22', learned: {}, wallets: DEFAULT_WALLETS.map((w) => ({ id: w.id, aliases: w.aliases })), defaults: { bank: 'bsb', cash: 'tunai' } };
  const a = parseLine('makan bareng 300rb bagi 3', ctx);
  assert.equal(a.amount, 100000);
  assert.deepEqual(a.split, { n: 3, total: 300000 });
  assert.equal(a.cat, 'makan');
  assert.equal(parseLine('patungan 90rb ber-3 gopay', ctx).amount, 30000);
  assert.equal(parseLine('pizza 150rb bertiga', ctx).amount, 50000);
  assert.equal(parseLine('bensin 40rb', ctx).split, undefined);
  assert.equal(parseLine('topup dana 100rb dari bsb bagi 2', ctx).split, undefined); // transfers are never split
});
