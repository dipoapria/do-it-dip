import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseLine, type ParseCtx } from '../src/parser.ts';
import { DEFAULT_WALLETS, feeSub, type Tx } from '../src/model.ts';
import { feeSummary, foldFees } from '../src/fees.ts';
import { guessRow } from '../src/statement.ts';

const ctx: ParseCtx = {
  today: '2026-11-22',
  learned: {},
  wallets: DEFAULT_WALLETS.map((w) => ({ id: w.id, aliases: w.aliases })),
  defaults: { bank: 'bsb', cash: 'tunai' },
};

test('admin fee written in a transfer sentence', () => {
  const p = parseLine('topup spay 50rb dari bsb admin 2,5rb', ctx);
  assert.equal(p.type, 'tf');
  assert.equal(p.amount, 50000);
  assert.equal(p.fee, 2500);
  assert.equal(p.wallet, 'bsb');
  assert.equal(p.to, 'spay');
  assert.equal(parseLine('tf 50rb bsb ke permata biaya 2500', ctx).fee, 2500);
  assert.equal(parseLine('isi dana 100rb dari permata + admin 1rb', ctx).fee, 1000);
  assert.equal(parseLine('topup gopay 20rb dari bsb fee 500', ctx).fee, 500);
  assert.equal(parseLine('topup gopay 20rb dari bsb admin 3', ctx).fee, 3000);
  assert.equal(parseLine('topup gopay 20rb dari bsb', ctx).fee, undefined);
});

test('"admin" alone is an expense, not a fee; other lines ignore a fee', () => {
  const p = parseLine('admin bank 15rb', ctx);
  assert.equal(p.amount, 15000);
  assert.equal(p.type, 'out');
  assert.equal(p.cat, 'biaya');
  assert.equal(p.fee, undefined);
  const q = parseLine('token listrik 200rb admin 3rb', ctx);
  assert.equal(q.amount, 200000);
  assert.equal(q.fee, undefined);
});

test('fee subcategory follows the receiving wallet', () => {
  assert.equal(feeSub('E-wallet'), 'Biaya top up');
  assert.equal(feeSub('Tunai'), 'Tarik tunai');
  assert.equal(feeSub('Bank'), 'Biaya transfer');
});

const tx = (o: Partial<Tx>): Tx => ({ id: Math.random().toString(36), date: '2026-11-10', type: 'out', cat: null, sub: null, amount: 0, wallet: 'bsb', to: null, note: '', book: 'pribadi', createdAt: 1, updatedAt: 1, ...o });

test('fee summary per month and per route; fee rows fold into their transfer', () => {
  const t1 = tx({ id: 't1', type: 'tf', amount: 50000, wallet: 'bsb', to: 'spay' });
  const t2 = tx({ id: 't2', type: 'tf', amount: 20000, wallet: 'bsb', to: 'spay', date: '2026-11-12' });
  const t3 = tx({ id: 't3', type: 'tf', amount: 100000, wallet: 'permata', to: 'dana' });
  const fees = [tx({ cat: 'biaya', sub: 'Biaya top up', amount: 2500, feeOf: 't1' }), tx({ cat: 'biaya', sub: 'Biaya top up', amount: 2500, feeOf: 't2', date: '2026-11-12' }), tx({ cat: 'biaya', sub: 'Biaya top up', amount: 1000, feeOf: 't3' }), tx({ cat: 'biaya', sub: 'Admin bulanan', amount: 10000 }), tx({ cat: 'biaya', sub: 'Biaya lain', amount: 6500, date: '2026-10-30' })];
  const all = [t1, t2, t3, ...fees];
  const s = feeSummary(all, '2026-11');
  assert.equal(s.total, 16000);
  assert.equal(s.n, 4);
  assert.equal(s.fromTransfers, 3);
  assert.deepEqual(s.routes[0], { from: 'bsb', to: 'spay', total: 5000, n: 2 });
  assert.equal(feeSummary(all, '2026').total, 22500);
  // in a list with the transfer the fee row is hidden; without it (e.g. the category list) it stays
  assert.equal(foldFees(all).length, 5);
  assert.equal(foldFees(fees).length, 5);
});

test('statement: transfer fee lines go to Biaya & admin', () => {
  const g = (desc: string) => guessRow({ date: '2026-11-10', desc, amount: 2500, type: 'out' } as never, { learned: {}, wallets: [], source: 'bsb' } as never);
  assert.equal(g('BIAYA TRANSFER BI-FAST').sub, 'Biaya transfer');
  assert.equal(g('BIAYA ADM BULANAN').sub, 'Admin bulanan');
  assert.equal(g('BIAYA ADM BULANAN').cat, 'biaya');
});
