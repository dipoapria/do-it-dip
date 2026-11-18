import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cellAmt, dayTotals, monthGrid, ruleDays, topDay } from '../src/calendar.ts';
import type { Tx } from '../src/model.ts';
import type { Rule } from '../src/recurring.ts';

test('month grid starts on Monday and pads both ends', () => {
  const g = monthGrid('2026-11'); // 1 Nov 2026 is a Sunday
  assert.equal(g[0].slice(0, 6).every((c) => c === null), true);
  assert.equal(g[0][6], '2026-11-01');
  assert.equal(g.at(-1)!.filter(Boolean).at(-1), '2026-11-30');
  assert.ok(g.every((w) => w.length === 7));
  assert.equal(monthGrid('2027-02')[0][0], '2027-02-01'); // a Monday
});

let n = 0;
const tx = (o: Partial<Tx>): Tx => ({ id: 't' + ++n, date: '2026-11-03', type: 'out', cat: 'makan', sub: 'Kopi', amount: 0, wallet: 'w', to: null, note: '', book: 'pribadi', createdAt: n, updatedAt: n, ...o });

test('day totals: transfers are records but neither income nor expense', () => {
  const t = dayTotals([
    tx({ amount: 18_000 }), tx({ amount: 35_000 }),
    tx({ type: 'in', cat: 'gaji', amount: 5_000_000 }),
    tx({ type: 'tf', cat: null, amount: 1_000_000, to: 'x' }),
    tx({ date: '2026-11-04', amount: 900_000 }),
    tx({ date: '2026-10-31', amount: 1 }),
  ], '2026-11');
  assert.deepEqual(t['2026-11-03'], { inc: 5_000_000, out: 53_000, n: 4, fixed: 0 });
  assert.equal(t['2026-10-31'], undefined);
  assert.equal(topDay(t), '2026-11-04');
  assert.equal(topDay({}), null);
});

const rule = (o: Partial<Rule>): Rule => ({ id: 'r', type: 'out', amount: 1, cat: 'rumah', sub: 'Sewa & kos', wallet: 'w', to: null, note: 'Kos', book: 'pribadi', every: 'month', day: 31, auto: true, last: '', active: true, createdAt: 0, ...o });

test('recurring days: monthly clamps to the last day, weekly hits every weekday, paused ones are skipped', () => {
  const d = ruleDays([rule({}), rule({ note: 'Arisan', every: 'week', day: 5 }), rule({ note: 'Off', day: 2, active: false })], '2026-11');
  assert.deepEqual(d['2026-11-30'], ['Kos']);
  assert.deepEqual(Object.keys(d).filter((k) => d[k].includes('Arisan')), ['2026-11-06', '2026-11-13', '2026-11-20', '2026-11-27']);
  assert.equal(d['2026-11-02'], undefined);
});

test('compact cell amounts', () => {
  assert.equal(cellAmt(18_000), '18rb');
  assert.equal(cellAmt(1_250_000), '1,3jt');
  assert.equal(cellAmt(12_400_000), '12jt');
  assert.equal(cellAmt(2_000_000), '2jt');
  assert.equal(cellAmt(750), '750');
});

test('fixed expenses: kept in totals, left out of the most-spent day', () => {
  const t = dayTotals([tx({ date: '2026-11-01', amount: 700_000, fixed: true, cat: 'rumah' }), tx({ date: '2026-11-05', amount: 90_000 })], '2026-11');
  assert.deepEqual(t['2026-11-01'], { inc: 0, out: 700_000, n: 1, fixed: 700_000 });
  assert.equal(topDay(t), '2026-11-05');
  assert.equal(topDay(dayTotals([tx({ amount: 700_000, fixed: true })], '2026-11')), null);
});

test('fixed in stats, recurring schedules and phrase memory', async () => {
  const { stats } = await import('../src/stats.ts');
  const s = stats([tx({ date: '2026-11-01', amount: 700_000, fixed: true, cat: 'rumah' }), tx({ date: '2026-11-01', amount: 20_000 })], '2026-11');
  assert.equal(s.out, 720_000); assert.equal(s.fixed, 700_000);
  assert.deepEqual(s.byDayFlex, { '2026-11-01': 20_000 }); assert.deepEqual(s.byCatFlex, { makan: 20_000 });
  assert.equal(s.byCat.rumah, 700_000);
  const { occurrenceTx, ruleFromTx } = await import('../src/recurring.ts');
  assert.equal(occurrenceTx(rule({ fixed: true }), '2026-11-30', 0).fixed, true);
  assert.equal(occurrenceTx(rule({}), '2026-11-30', 0).fixed, undefined);
  assert.equal(ruleFromTx(tx({ fixed: true }), 'x', 'month', 0).fixed, true);
  const { fixedMatch } = await import('../src/parser.ts');
  assert.equal(fixedMatch('Sewa kos 3 bulan', ['sewa kos']), true);
  assert.equal(fixedMatch('Sewa mobil', ['sewa kos']), false);
  assert.equal(fixedMatch('Kosmetik', ['kos']), false);
  assert.equal(fixedMatch('Bayar BPJS', ['bpjs']), true);
});
