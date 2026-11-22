import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fromAi } from '../src/ai-receipt.ts';

test('Gemini JSON becomes a receipt result; "high" only when the numbers add up', () => {
  const r = fromAi({
    items: [{ name: '001 INDOMIE GRG CB IJO JUMBO120g', qty: 1, price: 3900 }, { name: 'ROMA KELAPA 300GR', qty: 2, price: 18200 }, { name: 'TELUR AYAM NEGERI CURAH /KG', qty: 1.024, price: 26317 }],
    discount: 0, fees: 0, total: 48417, date: '2026-09-16', payment: 'cash', store: 'LOTTE Grosir',
  }, '2026-11-14', 'gemini-3.5-flash-lite');
  assert.deepEqual(r.items, [{ name: 'INDOMIE GRG CB IJO JUMBO120g', amount: 3900 }, { name: 'ROMA KELAPA 300GR', amount: 18200, qty: 2, unit: 9100 }, { name: 'TELUR AYAM NEGERI CURAH /KG', amount: 26317, qty: 1.024 }]);
  assert.equal(r.total, 48417);
  assert.equal(r.confidence, 'high');
  assert.equal(r.date, '2026-09-16');
  assert.equal(r.pay, 'cash');
  assert.equal(r.model, 'gemini-3.5-flash-lite');
});

test('Gemini JSON: fees and discounts count; mismatch is "medium"; bad dates are dropped', () => {
  const cafe = fromAi({ items: [{ name: 'Kopi Susu', price: 25000 }, { name: 'Croissant', price: 28000 }], discount: 3000, fees: 7500, total: 57500, date: '2027-01-01', store: 'Indomaret' }, '2026-11-14');
  assert.equal(cafe.confidence, 'high');
  assert.equal(cafe.date, null);
  assert.deepEqual(cafe.storeCat, { cat: 'belanja', sub: 'Kebutuhan harian' });
  const miss = fromAi({ items: [{ name: 'Teh', price: 5000 }], discount: 0, fees: 0, total: 9000 }, '2026-11-14');
  assert.equal(miss.confidence, 'medium');
  const none = fromAi({ items: [], discount: 0, fees: 0, total: null }, '2026-11-14');
  assert.equal(none.confidence, 'low');
});

test('Gemini JSON: the written-out name is used, the printed one kept alongside', () => {
  const r = fromAi({ items: [{ printed: 'INDOMIEGRGAYAM PGG JMB127G', name: 'Indomie Goreng Ayam Panggang Jumbo 127 g', qty: 1, price: 3900 }], discount: 0, fees: 0, total: 3900 }, '2026-11-14');
  assert.deepEqual(r.items, [{ name: 'Indomie Goreng Ayam Panggang Jumbo 127 g', amount: 3900, printed: 'INDOMIEGRGAYAM PGG JMB127G' }]);
  assert.match(r.lines[1], /INDOMIEGRGAYAM PGG JMB127G → Indomie Goreng Ayam Panggang Jumbo 127 g/);
});

test('per-piece price: printed unit kept, a unit given as the price becomes the line total', async () => {
  const { fromAi } = await import('../src/ai-receipt.ts');
  const r = fromAi({ items: [{ name: 'Indomie Goreng', qty: 5, unit: 3500, price: 17500 }, { name: 'Aqua 600 ml', qty: 3, unit: 3000, price: 3000 }, { name: 'Roti', qty: 2, price: 9000 }], total: 35500 }, '2026-11-22');
  assert.deepEqual(r.items.map((i) => [i.amount, i.qty, i.unit]), [[17500, 5, 3500], [9000, 3, 3000], [9000, 2, 4500]]);
});
