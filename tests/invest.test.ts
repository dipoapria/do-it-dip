import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buyTx, incomeTx, portfolio, position, sellTx, unitsLabel, type Asset } from '../src/invest.ts';
import { balance, stats } from '../src/stats.ts';
import type { Tx, Wallet } from '../src/model.ts';

const bbca: Asset = { id: 'a1', type: 'saham', name: 'BBCA', code: 'BBCA', price: 6000, priceAt: '', createdAt: 0 };
const W: Wallet = { id: 'pmt', name: 'Permata', short: 'P', group: 'Bank', color: '', init: 10_000_000, order: 0, aliases: [], book: 'pribadi' };
let n = 0;
const tx = (t: Omit<Tx, 'id' | 'createdAt' | 'updatedAt'>): Tx => ({ ...t, id: 't' + ++n, createdAt: n, updatedAt: n });

test('buying moves money into the asset without counting as an expense', () => {
  const txs = [tx(buyTx(bbca, 200, 5000, 1500, 'pmt', '2026-10-01'))]; // 2 lot @ 5.000 + fee
  assert.equal(balance(txs, W), 10_000_000 - 1_001_500);
  assert.equal(stats(txs, '2026-10').out, 0);
  const p = position(bbca, txs);
  assert.equal(p.units, 200);
  assert.equal(p.cost, 1_001_500);
  assert.equal(p.value, 1_200_000);
  assert.equal(p.gain, 198_500);
  assert.equal(unitsLabel(bbca, p.units), '2 lot');
});

test('average cost, partial sale, realised profit and dividends', () => {
  const txs = [
    tx(buyTx(bbca, 200, 5000, 0, 'pmt', '2026-09-01')),   // 1.000.000
    tx(buyTx(bbca, 200, 7000, 0, 'pmt', '2026-09-15')),   // 1.400.000 → avg 6.000
    tx(sellTx(bbca, 100, 8000, 2000, 'pmt', '2026-10-01')), // proceeds 798.000, cost 600.000
    tx(incomeTx(bbca, 50_000, 'pmt', '2026-10-10')),
  ];
  const p = position(bbca, txs);
  assert.equal(p.units, 300);
  assert.equal(p.avg, 6000);
  assert.equal(p.cost, 1_800_000);
  assert.equal(p.realized, 198_000);
  assert.equal(p.income, 50_000);
  assert.equal(p.gain, 0); // price 6.000 = average
  assert.equal(balance(txs, W), 10_000_000 - 2_400_000 + 798_000 + 50_000);
  assert.equal(stats(txs, '2026-10').inc, 50_000); // only the dividend is income
  const all = portfolio([bbca], txs);
  assert.equal(all.value, 1_800_000);
});

test('holdings owned before the app do not touch any wallet; selling everything closes the position', () => {
  const emas: Asset = { id: 'g', type: 'emas', name: 'Emas Antam', code: '', price: 1_500_000, priceAt: '', createdAt: 0 };
  const txs = [tx(buyTx(emas, 2.5, 1_200_000, 0, '', '2025-01-01'))];
  assert.equal(balance(txs, W), 10_000_000);
  assert.equal(position(emas, txs).gain, 750_000);
  assert.equal(unitsLabel(emas, 2.5), '2,5 gram');
  txs.push(tx(sellTx(emas, 2.5, 1_500_000, 0, 'pmt', '2026-11-01')));
  const p = position(emas, txs);
  assert.equal(p.units, 0); assert.equal(p.cost, 0); assert.equal(p.realized, 750_000);
  assert.equal(balance(txs, W), 10_000_000 + 3_750_000);
});

test('Indonesian number input: decimals with a comma, thousands with dots', async () => {
  const { parseDec } = await import('../src/invest.ts');
  assert.equal(parseDec('1.523,45'), 1523.45);
  assert.equal(parseDec('152,3456'), 152.3456);
  assert.equal(parseDec('5.600'), 5600);
  assert.equal(parseDec('5600'), 5600);
  assert.equal(parseDec('0.5'), 0.5);
  assert.equal(parseDec(''), 0);
});
