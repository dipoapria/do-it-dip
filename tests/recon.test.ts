import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkWeek, logByMonth, movedSince, reconDue, streak, weekAnchor } from '../src/recon.ts';
import type { Tx } from '../src/model.ts';

// 2026-11-22 is a Sunday
const at = (s: string) => new Date(s);

test('weekly window: Sunday 18:00 until the end of Monday', () => {
  assert.equal(weekAnchor(at('2026-11-22T19:00')).key, '2026-11-22');
  assert.equal(weekAnchor(at('2026-11-22T17:59')).key, '2026-11-15');
  assert.equal(weekAnchor(at('2026-11-24T10:00')).key, '2026-11-22');
  assert.equal(reconDue(at('2026-11-22T17:00'), {}), null);
  assert.equal(reconDue(at('2026-11-22T18:00'), {}), '2026-11-22');
  assert.equal(reconDue(at('2026-11-23T23:30'), {}), '2026-11-22');
  assert.equal(reconDue(at('2026-11-24T00:01'), {}), null);
  assert.equal(reconDue(at('2026-11-26T20:00'), {}), null);
});

test('skipped this week, or already checked since Saturday morning: no offer', () => {
  assert.equal(reconDue(at('2026-11-22T20:00'), { reconSkip: '2026-11-22' }), null);
  assert.equal(reconDue(at('2026-11-22T20:00'), { reconSkip: '2026-11-15' }), '2026-11-22');
  assert.equal(reconDue(at('2026-11-22T20:00'), { reconAll: at('2026-11-21T09:00').getTime() }), null);
  assert.equal(reconDue(at('2026-11-22T20:00'), { reconAll: at('2026-11-19T21:00').getTime() }), '2026-11-22');
});

test('moved wallets and streak', () => {
  const t = (o: Partial<Tx>): Tx => ({ id: 'x', date: '2026-11-20', type: 'out', cat: 'makan', sub: 'Makan', amount: 1, wallet: 'bsb', to: null, note: '', book: 'pribadi', createdAt: 100, updatedAt: 100, ...o });
  const txs = [t({}), t({ wallet: 'spay', createdAt: 300, updatedAt: 300 }), t({ type: 'tf', wallet: 'bsb', to: 'dana', createdAt: 50, updatedAt: 400 })];
  assert.equal(movedSince(txs, 'bsb', 200), 1);
  assert.equal(movedSince(txs, 'dana', 200), 1);
  assert.equal(movedSince(txs, 'spay', 300), 0);
  const now = at('2026-11-22T20:00');
  assert.equal(streak(['2026-11-15', '2026-11-08', '2026-10-25'], now), 2); // this week not yet
  assert.equal(streak(['2026-11-22', '2026-11-15', '2026-11-08'], now), 3);
  assert.equal(streak([], now), 0);
});

test('history by month', () => {
  const g = logByMonth([
    { at: at('2026-11-22T20:00').getTime(), wallet: 'bsb', app: 10, real: 8, gap: -2, kind: 'adj' },
    { at: at('2026-11-15T20:00').getTime(), wallet: 'bsb', app: 10, real: 10, gap: 0, kind: 'same' },
    { at: at('2026-10-30T20:00').getTime(), wallet: 'spay', app: 5, real: 6, gap: 1, kind: 'adj' },
  ]);
  assert.deepEqual(g.map((x) => [x.mk, x.n, x.adjusted]), [['2026-11', 2, -2], ['2026-10', 1, 1]]);
});

test('which week a full check counts for', () => {
  assert.equal(checkWeek(at('2026-11-22T20:00')), '2026-11-22');
  assert.equal(checkWeek(at('2026-11-23T09:00')), '2026-11-22');
  assert.equal(checkWeek(at('2026-11-26T20:00')), null); // Thursday: logged, but not a week's check
  assert.equal(checkWeek(at('2026-11-28T10:00')), '2026-11-29'); // Saturday morning counts for the coming Sunday
});
