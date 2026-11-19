import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseLine, type ParseCtx } from '../src/parser.ts';
import { applyDict, DEFAULT_WALLETS, KW, kwBest, resolveSub } from '../src/model.ts';
import { buildHistory, histHit, noteTokens } from '../src/smart.ts';
import type { Tx } from '../src/model.ts';

const ctx: ParseCtx = {
  today: '2026-11-19',
  learned: {},
  wallets: DEFAULT_WALLETS.map((w) => ({ id: w.id, aliases: w.aliases })),
  defaults: { bank: 'bsb', cash: 'tunai' },
};
const cs = (t: string, c: ParseCtx = ctx) => { const p = parseLine(t, c); return p.cat + ' · ' + p.sub; };

test('bigger word list: snacks, meals, drinks and the longest word wins', () => {
  assert.equal(cs('pempek 18k bsb'), 'makan · Jajan');
  assert.equal(cs('martabak manis 30rb'), 'makan · Jajan');
  assert.equal(cs('nasi padang 25rb'), 'makan · Makan');
  assert.equal(cs('makan pindang patin 45rb'), 'makan · Makan');
  assert.equal(cs('es teh 5rb'), 'makan · Kopi & minuman');
  assert.equal(cs('air mineral 4rb'), 'belanja · Kebutuhan harian');
  assert.equal(cs('bayar pdam 80rb'), 'tagihan · Air');
  assert.equal(cs('sewa kos 1,2jt'), 'rumah · Sewa & kos');
  assert.equal(cs('upah tukang 150rb'), 'rumah · Perbaikan rumah');
  assert.equal(cs('tol 12rb'), 'transport · Tol & tiket');
  assert.equal(cs('potong rambut 25rb'), 'belanja · Perawatan diri');
  assert.equal(cs('gofood 40rb'), 'makan · Pesan antar');
});

test('income words and money-in words', () => {
  assert.equal(parseLine('freelance 750rb', ctx).type, 'in');
  assert.equal(cs('thr 3jt'), 'bonus · Bonus');
  assert.equal(cs('terima uang sewa 1jt'), 'masuk_lain · Lainnya');
});

test('kwBest picks the longest match across lists', () => {
  assert.equal(kwBest(' es kacang merah ', KW)?.word, 'es kacang merah');
});

test('removed words and moved subcategories change the word list', () => {
  applyDict({ 'makan|Jajan': 'makan|Camilan' }, ['pempek']);
  try {
    assert.equal(kwBest(' martabak ', KW)?.sub, 'Camilan');
    assert.equal(kwBest(' pempek ', KW), null);
  } finally { applyDict(); }
  assert.deepEqual(resolveSub({ 'a|x': 'a|y', 'a|y': 'b|z' }, 'a', 'x'), { cat: 'b', sub: 'z' });
});

const tx = (note: string, cat: string, sub: string, createdAt = 100): Tx => ({ id: note + createdAt + Math.random(), date: '2026-11-19', type: 'out', cat, sub, amount: 1000, wallet: 'tunai', to: null, note, book: 'pribadi', createdAt, updatedAt: createdAt });

test('history: a word saved twice or more in one subcategory is learned; older saves do not count', () => {
  const txs = [tx('Pempek', 'makan', 'Makan'), tx('Pempek kapal selam', 'makan', 'Makan'), tx('Pempek', 'makan', 'Jajan', 10), tx('Kopi', 'makan', 'Jajan')];
  const h = buildHistory(txs, 50);
  assert.deepEqual(h.pempek, { cat: 'makan', sub: 'Makan', n: 2 });
  assert.equal(h.kopi, undefined); // once is not a habit
  assert.deepEqual(buildHistory(txs, 0), {}); // learning not switched on
  // history beats the built-in list
  assert.equal(cs('pempek 20rb', { ...ctx, hist: h }), 'makan · Makan');
  assert.equal(parseLine('pempek 20rb', { ...ctx, hist: h }).hist?.n, 2);
  // what the user taught directly still wins
  assert.equal(cs('pempek 20rb', { ...ctx, hist: h, learned: { pempek: { cat: 'makan', sub: 'Pesan antar' } } }), 'makan · Pesan antar');
});

test('history: mixed habits need a clear majority; pairs of words beat single words', () => {
  const txs = [tx('Bakso', 'makan', 'Makan'), tx('Bakso', 'makan', 'Jajan'), tx('Bakso bakar', 'makan', 'Jajan'), tx('Bakso bakar', 'makan', 'Jajan')];
  const h = buildHistory(txs, 1);
  assert.equal(h.bakso?.sub, 'Jajan'); // 3 of 4
  assert.equal(histHit(' bakso bakar ', h)?.word, 'bakso bakar');
  assert.deepEqual(noteTokens('Beli nasi padang'), ['nasi', 'padang', 'nasi padang']);
});
