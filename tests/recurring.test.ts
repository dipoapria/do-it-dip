import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dueDates, nextAfter, occurrenceTx, ruleFromTx, scheduleLabel, type Rule } from '../src/recurring.ts';
import { buildSheets, toXlsx } from '../src/excel.ts';
import type { Tx, Wallet } from '../src/model.ts';

const tx = (o: Partial<Tx>): Tx => ({ id: 'x', date: '2026-01-25', type: 'in', cat: 'gaji', sub: 'Gaji bulanan', amount: 5_000_000, wallet: 'bsb', to: null, note: 'Gaji', book: 'pribadi', createdAt: 1, updatedAt: 1, ...o });

test('monthly rule clamps to the end of short months and keeps its day afterwards', () => {
  const r = { every: 'month' as const, day: 31 };
  assert.equal(nextAfter(r, '2026-01-31'), '2026-02-28');
  assert.equal(nextAfter(r, '2026-02-28'), '2026-03-31');
  assert.equal(nextAfter(r, '2028-01-31'), '2028-02-29');
  assert.equal(nextAfter({ every: 'month', day: 25 }, '2026-12-25'), '2027-01-25');
  assert.equal(nextAfter({ every: 'month', day: 25 }, '2026-12-10'), '2026-12-25');
});

test('weekly rule lands on the same weekday', () => {
  // 2026-11-14 is a Saturday (6); Friday = 5
  assert.equal(nextAfter({ every: 'week', day: 5 }, '2026-11-14'), '2026-11-20');
  assert.equal(nextAfter({ every: 'week', day: 6 }, '2026-11-14'), '2026-11-21');
});

test('ruleFromTx starts after the transaction, and dueDates lists missed occurrences', () => {
  const r: Rule = ruleFromTx(tx({}), 'g1', 'month', 0);
  assert.equal(r.day, 25);
  assert.equal(r.auto, true);
  assert.deepEqual(dueDates(r, '2026-01-30'), []);
  assert.deepEqual(dueDates(r, '2026-04-25'), ['2026-02-25', '2026-03-25', '2026-04-25']);
  assert.deepEqual(dueDates({ ...r, active: false }, '2026-04-25'), []);
  assert.equal(dueDates(r, '2035-01-01').length, 36);
  const out = ruleFromTx(tx({ type: 'out', cat: 'tagihan', sub: 'Listrik' }), 'l1', 'month', 0);
  assert.equal(out.auto, false);
});

test('occurrence transactions have a fixed id per rule and date', () => {
  const r = ruleFromTx(tx({}), 'g1', 'month', 0);
  const a = occurrenceTx(r, '2026-02-25', 5), b = occurrenceTx(r, '2026-02-25', 9, 5_200_000);
  assert.equal(a.id, b.id);
  assert.equal(a.rec, 'g1');
  assert.equal(b.amount, 5_200_000);
  assert.equal(scheduleLabel(r), 'Tiap tanggal 25');
  assert.equal(scheduleLabel({ every: 'month', day: 31 }), 'Tiap akhir bulan');
  assert.equal(scheduleLabel({ every: 'week', day: 1 }), 'Tiap Senin');
});

const W: Wallet[] = [
  { id: 'bsb', name: 'Bank Sumsel Babel', short: 'BSB', group: 'Bank', color: '#000', init: 100_000, order: 0, aliases: [], book: 'pribadi' },
  { id: 'tunai', name: 'Tunai', short: 'Rp', group: 'Tunai', color: '#000', init: 0, order: 1, aliases: [], book: 'pribadi' },
];
const TXS: Tx[] = [
  tx({ id: '1', date: '2026-10-25' }),
  tx({ id: '2', date: '2026-10-26', type: 'out', cat: 'makan', sub: 'Kopi & minuman', amount: 18_000, wallet: 'tunai', note: 'kopi' }),
  tx({ id: '3', date: '2026-11-02', type: 'out', cat: 'makan', sub: 'Kopi & minuman', amount: 22_000, wallet: 'tunai', note: 'kopi' }),
  tx({ id: '4', date: '2026-11-03', type: 'tf', cat: null, sub: null, amount: 200_000, wallet: 'bsb', to: 'tunai', note: 'tarik tunai' }),
  tx({ id: '5', date: '2026-12-01', type: 'out', cat: 'belanja', sub: 'Pakaian', amount: 1, note: 'outside period' }),
];

test('Excel sheets cover the period with totals, months and categories', () => {
  const sh = buildSheets(TXS, W, { from: '2026-10-01', to: '2026-11-30', label: 'Okt–Nov 2026' }, () => 0, 'Dipo');
  assert.deepEqual(sh.map((s) => s.sheet), ['Ringkasan', 'Transaksi', 'Per kategori']);
  const [sum, txs, cat] = sh;
  const find = (rows: typeof sum.data, label: string) => rows.find((r) => r[0]?.value === label);
  assert.equal(find(sum.data, 'Pemasukan')?.[1]?.value, 5_000_000);
  assert.equal(find(sum.data, 'Pengeluaran')?.[1]?.value, 40_000);
  assert.equal(find(sum.data, 'Selisih')?.[1]?.value, 4_960_000);
  assert.ok(find(sum.data, 'Oktober 2026') && find(sum.data, 'November 2026'));
  assert.equal(txs.data.length, 1 + 4 + 1); // header, 4 rows in period, total
  assert.equal(txs.data[4][6]?.value, 'Tunai'); // transfer destination
  assert.equal(txs.data[5][9]?.value, 200_000);
  const kopi = cat.data.find((r) => r[2]?.value === 'Kopi & minuman');
  assert.equal(kopi?.[3]?.value, 2);
  assert.equal(kopi?.[4]?.value, 40_000);
});

test('Excel file is written as a real xlsx (zip) blob', async () => {
  const blob = await toXlsx(buildSheets(TXS, W, { from: '2026-10-01', to: '2026-11-30', label: 'x' }, () => 1000));
  const head = new Uint8Array(await blob.arrayBuffer()).slice(0, 2);
  assert.equal(String.fromCharCode(...head), 'PK');
  assert.ok(blob.size > 3000);
});
