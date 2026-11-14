import { test } from 'node:test';
import assert from 'node:assert/strict';
import { budgetSummary, levelOf, monthPace, newAlerts, suggestBudgets } from '../src/budget.ts';

test('month pace', () => {
  assert.equal(monthPace('2026-11', '2026-11-15'), 0.5);
  assert.equal(monthPace('2026-10', '2026-11-15'), 1);
  assert.equal(monthPace('2026-12', '2026-11-15'), 0);
});

test('levels: fine, warn at 80%, over above the limit', () => {
  assert.equal(levelOf(790_000, 1_000_000), 0);
  assert.equal(levelOf(800_000, 1_000_000), 1);
  assert.equal(levelOf(1_000_000, 1_000_000), 1);
  assert.equal(levelOf(1_000_001, 1_000_000), 2);
});

test('summary per category with pace and money left per day', () => {
  const s = budgetSummary({ makan: 1_500_000, transport: 600_000, hiburan: 0 }, { makan: 1_050_000, transport: 100_000, belanja: 999 }, '2026-11', '2026-11-15');
  assert.deepEqual(s.lines.map((l) => l.cat), ['makan', 'transport']); // sorted by use, zero limits ignored
  const makan = s.lines[0];
  assert.equal(makan.left, 450_000);
  assert.equal(makan.ahead, true);       // 70% used at 50% of the month
  assert.equal(makan.perDay, 28_125);    // 450 rb over 16 days (15–30 Nov)
  assert.equal(s.limit, 2_100_000);
  assert.equal(s.spent, 1_150_000);
  const past = budgetSummary({ makan: 1_000_000 }, { makan: 1_200_000 }, '2026-10', '2026-11-15');
  assert.equal(past.lines[0].level, 2);
  assert.equal(past.lines[0].perDay, 0);
});

test('suggestions round the 3-month average up to Rp50.000', () => {
  assert.deepEqual(suggestBudgets([{ makan: 1_200_000, transport: 300_000 }, { makan: 1_000_000 }, { makan: 1_100_000, transport: 330_000 }]), { makan: 1_100_000, transport: 250_000 });
  assert.deepEqual(suggestBudgets([]), {});
});

test('alerts only when a category reaches a higher level', () => {
  const s = budgetSummary({ makan: 1_000_000, transport: 500_000 }, { makan: 850_000, transport: 600_000 }, '2026-11', '2026-11-20');
  assert.deepEqual(newAlerts({}, s.lines).map((l) => l.cat), ['transport', 'makan']);
  assert.deepEqual(newAlerts({ makan: 1, transport: 2 }, s.lines), []);
  assert.deepEqual(newAlerts({ makan: 1, transport: 1 }, s.lines).map((l) => l.cat), ['transport']);
});
