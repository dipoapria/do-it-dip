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

test('book keywords: Usaha and Freelance categories only inside their book', async () => {
  const { BOOK_KW, catsFor, OUT_CATS } = await import('../src/model.ts');
  const usaha = { ...ctx, kw: BOOK_KW.usaha }, free = { ...ctx, kw: BOOK_KW.freelance };
  let p = parseLine('jual kue 150rb tunai', usaha);
  assert.equal(p.type, 'in'); assert.equal(p.cat, 'penjualan');
  p = parseLine('beli bahan baku tepung 80rb', usaha);
  assert.equal(p.cat, 'modal'); assert.equal(p.type, 'out');
  p = parseLine('ongkir jne 25rb', usaha);
  assert.equal(p.cat, 'operasional');
  p = parseLine('dp proyek logo 1,5jt bsb', free);
  assert.equal(p.type, 'in'); assert.equal(p.cat, 'proyek'); assert.equal(p.sub, 'DP proyek'); assert.equal(p.amount, 1_500_000);
  p = parseLine('jual kue 150rb', ctx); // Pribadi: no book categories
  assert.equal(p.cat, 'masuk_lain');
  assert.ok(!OUT_CATS.includes('modal'));
  assert.deepEqual(catsFor('usaha', true).slice(0, 1), ['penjualan']);
  assert.equal(catsFor('pribadi', false).length, OUT_CATS.length);
});

test('housing, family, insurance categories; counts are not money; learned phrases', async () => {
  const { learnKey, highlightHTML } = await import('../src/parser.ts');
  const { applyCatEdits, CATS, OUT_CATS } = await import('../src/model.ts');
  let p = parseLine('sewa kos 3 bulan 2,25jt', ctx);
  assert.equal(p.amount, 2_250_000); assert.equal(p.cat, 'rumah'); assert.equal(p.sub, 'Sewa & kos');
  assert.equal(parseLine('bpjs 150rb', ctx).cat, 'asuransi');
  assert.equal(parseLine('pajak motor 250rb', ctx).sub, 'Pajak kendaraan');
  assert.equal(parseLine('kirim ibu 500rb bsb', ctx).cat, 'keluarga');
  assert.equal(parseLine('popok 85rb', ctx).sub, 'Kebutuhan bayi');
  assert.ok(!/h-amt[^>]*>3</.test(highlightHTML('sewa kos 3 bulan 2,25jt', ctx, null).html));
  assert.equal(learnKey('Sewa kos 3 bulan'), 'sewa kos');
  assert.equal(learnKey('Kopi'), 'kopi');
  const taught = { ...ctx, learned: { 'sewa mobil': { cat: 'transport', sub: 'Servis' }, sewa: { cat: 'tagihan', sub: 'Listrik' } } };
  assert.equal(parseLine('sewa mobil 300rb', taught).cat, 'transport'); // the phrase wins over the single word
  // user edits: rename, own subcategories, hide, and a category of their own
  applyCatEdits({ makan: { n: 'Makan', subs: ['Warteg', 'Kopi'] }, hiburan: { hidden: true }, 'c-hobi': { custom: true, n: 'Hobi', c: '#000', i: 'gem', subs: ['Mancing'] } });
  assert.equal(CATS.makan.n, 'Makan'); assert.deepEqual(CATS.makan.subs, ['Warteg', 'Kopi']);
  assert.ok(!OUT_CATS.includes('hiburan') && CATS.hiburan.hidden);
  assert.ok(OUT_CATS.includes('c-hobi') && CATS['c-hobi'].custom);
  applyCatEdits({});
  assert.equal(CATS.makan.n, 'Makan & Minum'); assert.ok(OUT_CATS.includes('hiburan') && !CATS['c-hobi']);
});
