import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildItemHistory, foldReceipts, groupByCat, itemKey } from '../src/itemcats.ts';
import type { Tx } from '../src/model.ts';

test('items grouped by category; tax and discount spread in proportion; parts add up to the total', () => {
  const g = groupByCat([
    { name: 'Beras 5 kg', amount: 70000, cat: 'belanja', sub: 'Kebutuhan harian' },
    { name: 'Chitato', amount: 11000, cat: 'makan', sub: 'Jajan' },
    { name: 'Sabun', amount: 15000, cat: 'belanja', sub: 'Kebutuhan harian' },
    { name: 'Paracetamol', amount: 9000, cat: 'kesehatan', sub: 'Obat' },
  ], 100000); // 105.000 of products, 5.000 discount
  assert.deepEqual(g.map((x) => [x.cat, x.base, x.amount]), [['belanja', 85000, 80952], ['makan', 11000, 10476], ['kesehatan', 9000, 8571]].map(([c, b, a], i) => i === 0 ? [c, b, 100000 - 10476 - 8571] : [c, b, a]));
  assert.equal(g.reduce((s, x) => s + x.amount, 0), 100000);
  assert.equal(g[0].items.length, 2);
});

test('product keys leave out sizes and counts', () => {
  assert.equal(itemKey('Indomie Goreng Ayam Panggang Jumbo 127 gr'), 'indomie goreng ayam');
  assert.equal(itemKey('Aqua 600 ml (3 pcs)'), 'aqua');
  assert.equal(itemKey('Paracetamol 500mg Tab'), 'paracetamol 500mg tab'.replace(' 500mg', '').replace('tab', 'tab'));
});

const t = (o: Partial<Tx>): Tx => ({ id: Math.random().toString(36), date: '2026-11-22', type: 'out', cat: 'makan', sub: 'Jajan', amount: 1, wallet: 'tunai', to: null, note: '', book: 'pribadi', createdAt: 100, updatedAt: 100, ...o });

test('item history only from receipts split by category', () => {
  const txs = [
    t({ rcpt: 'r1', items: [{ name: 'Chitato Sapi Panggang', amount: 11000 }] }),
    t({ rcpt: 'r2', items: [{ name: 'Chitato Keju', amount: 11000 }] }),
    t({ cat: 'belanja', sub: 'Kebutuhan harian', items: [{ name: 'Chitato Keju', amount: 11000 }] }), // not split: does not teach
  ];
  const h = buildItemHistory(txs, 50);
  assert.deepEqual(h.chitato, { cat: 'makan', sub: 'Jajan', n: 2 });
});

test('receipt parts fold into one row', () => {
  const a = t({ id: 'a', rcpt: 'r' }), b = t({ id: 'b', rcpt: 'r' }), c = t({ id: 'c' }), d = t({ id: 'd', rcpt: 'solo' });
  const f = foldReceipts([a, c, b, d]);
  assert.deepEqual(f.map((x) => [x.id, x.parts?.length ?? 0]), [['a', 2], ['c', 0], ['d', 0]]);
});
