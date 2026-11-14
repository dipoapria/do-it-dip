import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fromAi } from '../src/ai-receipt.ts';

test('Gemini JSON becomes a receipt result; "high" only when the numbers add up', () => {
  const r = fromAi({
    items: [{ name: '001 INDOMIE GRG CB IJO JUMBO120g', qty: 1, price: 3900 }, { name: 'ROMA KELAPA 300GR', qty: 2, price: 18200 }, { name: 'TELUR AYAM NEGERI CURAH /KG', qty: 1.024, price: 26317 }],
    discount: 0, fees: 0, total: 48417, date: '2026-09-16', payment: 'cash', store: 'LOTTE Grosir',
  }, '2026-11-14', 'gemini-3.5-flash-lite');
  assert.deepEqual(r.items, [{ name: 'INDOMIE GRG CB IJO JUMBO120g', amount: 3900 }, { name: 'ROMA KELAPA 300GR', amount: 18200, qty: 2 }, { name: 'TELUR AYAM NEGERI CURAH /KG', amount: 26317 }]);
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
