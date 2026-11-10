import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseLine, parseText, type ParseCtx } from '../src/parser.ts';
import { DEFAULT_WALLETS } from '../src/model.ts';

const ctx: ParseCtx = {
  today: '2026-11-10',
  learned: {},
  wallets: DEFAULT_WALLETS.map((w) => ({ id: w.id, aliases: w.aliases })),
  defaults: { bank: 'bsb', cash: 'tunai' },
};

test('amount, wallet, date and category from one sentence', () => {
  const p = parseLine('pempek 35rb gopay kemarin', ctx);
  assert.equal(p.amount, 35000);
  assert.equal(p.wallet, 'gopay');
  assert.equal(p.date, '2026-11-09');
  assert.equal(p.type, 'out');
  assert.equal(p.cat, 'makan');
  assert.equal(p.note, 'Pempek');
});

test('amount formats: 1,5jt / 87.500 / 2.5jt / bare number = thousands', () => {
  assert.equal(parseLine('servis motor 1,5jt', ctx).amount, 1500000);
  assert.equal(parseLine('belanja indomaret 87.500 spay', ctx).amount, 87500);
  assert.equal(parseLine('laptop 2.5jt', ctx).amount, 2500000);
  const p = parseLine('bakso 15', ctx);
  assert.equal(p.amount, 15000);
  assert.equal(p.assumed, true);
});

test('income goes to the main bank by default', () => {
  const p = parseLine('gaji 5,2jt', ctx);
  assert.equal(p.type, 'in');
  assert.equal(p.cat, 'gaji');
  assert.equal(p.wallet, 'bsb');
  assert.equal(p.amount, 5200000);
});

test('income into a named bank', () => {
  const p = parseLine('honor 350rb masuk bank sumsel', ctx);
  assert.equal(p.type, 'in');
  assert.equal(p.wallet, 'bsb');
  assert.equal(p.cat, 'bonus');
});

test('top up is a transfer between wallets', () => {
  const p = parseLine('topup dana 100rb dari permata', ctx);
  assert.equal(p.type, 'tf');
  assert.equal(p.wallet, 'permata');
  assert.equal(p.to, 'dana');
  assert.equal(p.amount, 100000);
});

test('tarik tunai moves money from the main bank to cash', () => {
  const p = parseLine('tarik tunai 300rb', ctx);
  assert.equal(p.type, 'tf');
  assert.equal(p.wallet, 'bsb');
  assert.equal(p.to, 'tunai');
});

test('learned words override the dictionary', () => {
  const p = parseLine('warung bu tini 20rb', { ...ctx, learned: { tini: { cat: 'sosial', sub: 'Arisan' } } });
  assert.equal(p.cat, 'sosial');
  assert.equal(p.learned, true);
});

test('several lines become several transactions; missing amount stays 0', () => {
  const ps = parseText('kopi 18rb\nparkir 2rb tunai\nbeli sesuatu', ctx);
  assert.equal(ps.length, 3);
  assert.equal(ps[1].cat, 'transport');
  assert.equal(ps[2].amount, 0);
});

test('tanggal N in the future is clamped to today', () => {
  assert.equal(parseLine('arisan 200rb tgl 25', ctx).date, '2026-11-10');
  assert.equal(parseLine('arisan 200rb tgl 3', ctx).date, '2026-11-03');
});
