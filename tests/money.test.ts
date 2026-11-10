import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseAmount, findDate, cellDate } from '../src/money-text.ts';
import { parseReceipt } from '../src/receipt.ts';
import { parseCSV, rowsToStatement, linesToStatement, guessRow } from '../src/statement.ts';
import { DEFAULT_WALLETS } from '../src/model.ts';

test('parseAmount handles Indonesian and English separators', () => {
  assert.equal(parseAmount('87.400'), 87400);
  assert.equal(parseAmount('Rp 87.400,00'), 87400);
  assert.equal(parseAmount('1,250,000.50'), 1250000);
  assert.equal(parseAmount('1.250.000,50'), 1250000);
  assert.equal(parseAmount('35000'), 35000);
  assert.equal(parseAmount('-35.000'), -35000);
  assert.equal(parseAmount('12,5'), null);
  assert.equal(parseAmount('abc'), null);
});

test('findDate reads common receipt and statement formats', () => {
  assert.equal(findDate('10.11.2026 08:42', 2026)?.date, '2026-11-10');
  assert.equal(findDate('Tgl 05/11/26', 2026)?.date, '2026-11-05');
  assert.equal(findDate('09 Nov 2026 TRSF', 2026)?.date, '2026-11-09');
  assert.equal(findDate('06/11 QRIS', 2026)?.date, '2026-11-06');
  assert.equal(cellDate(46335, 2026), '2026-11-09'); // Excel serial date
});

test('receipt: shop, total (not cash/change), date and items', () => {
  const text = `INDOMARET
Jl. Sudirman No. 12 Palembang
NPWP 01.234.567.8-901.000
SUSU UHT 1L        13.000
ROTI TAWAR         16.500
SABUN MANDI        12.900
SUBTOTAL           42.400
TOTAL              42.400
TUNAI              50.000
KEMBALI             7.600
10.11.2026 08:42`;
  const r = parseReceipt(text, '2026-11-10');
  assert.equal(r.merchant, 'Indomaret');
  assert.equal(r.total, 42400);
  assert.equal(r.date, '2026-11-10');
  assert.deepEqual(r.items.map((i) => i.amount), [13000, 16500, 12900]);
});

test('receipt: OCR noise (T0TAL) and no total keyword fallback', () => {
  assert.equal(parseReceipt('KEDAI KOPI\nKopi susu 22.000\nT0TAL BAYAR Rp 22.000\nCASH 50.000', '2026-11-10').total, 22000);
  assert.equal(parseReceipt('WARUNG BU TINI\nNasi 15.000\nTeh 5.000\n20.000', '2026-11-10').total, 20000);
});

const ctx = { source: 'bsb', learned: {}, wallets: DEFAULT_WALLETS.map((w) => ({ id: w.id, aliases: w.aliases, group: w.group })) };

test('CSV with separate debit/credit columns', () => {
  const csv = `Tanggal;Keterangan;Debet;Kredit;Saldo
06/11/2026;QRIS INDOMARET PLG;87.500,00;;1.162.500,00
07/11/2026;TARIK TUNAI ATM PALEMBANG;300.000,00;;862.500,00
09/11/2026;TRSF MASUK HONOR KEGIATAN;;350.000,00;1.212.500,00`;
  const rows = rowsToStatement(parseCSV(csv), 2026);
  assert.equal(rows.length, 3);
  assert.deepEqual(rows.map((r) => [r.date, r.amount, r.type]), [['2026-11-06', 87500, 'out'], ['2026-11-07', 300000, 'out'], ['2026-11-09', 350000, 'in']]);
  const g = rows.map((r) => guessRow(r, ctx));
  assert.equal(g[0].cat, 'belanja');
  assert.equal(g[1].type, 'tf'); assert.equal(g[1].to, 'tunai');
  assert.equal(g[2].cat, 'bonus');
});

test('CSV with one amount column and DB/CR marker', () => {
  const csv = `Date,Description,Amount,DB/CR,Balance
2026-11-05,BIFAST KE DANA 0812XXXX,100000.00,DB,2900000.00
2026-11-09,BUNGA TABUNGAN,4210.00,CR,2904210.00`;
  const rows = rowsToStatement(parseCSV(csv), 2026);
  assert.deepEqual(rows.map((r) => [r.amount, r.type]), [[100000, 'out'], [4210, 'in']]);
  const g = guessRow(rows[0], { ...ctx, source: 'permata' });
  assert.equal(g.type, 'tf'); assert.equal(g.to, 'dana');
  assert.equal(guessRow(rows[1], ctx).sub, 'Bunga');
});

test('Permata-style card layout: date headers, amount on its own line, no balance column', () => {
  // Same structure as a PermataMobile X "Mutasi Transaksi" PDF; names, account and reference numbers are made up.
  const lines = [
    'Mutasi Transaksi', 'November 2026', 'RDN', '0000-1111-2222',
    '10 November 2026',
    'PB KE KREDITUR DIRECT DEBET PEB 1234567890 DCMS', 'Rp 1,250,000.00', '08:20:17 AAA IPS DEBET IPS DEBET 0800000000000001',
    '09 November 2026',
    'PB KE KREDITUR DIRECT DEBET PEB 1234567890 DCMS', 'Rp 101.00', '15:00:57 AAA IPS DEBET IPS DEBET 0800000000000002',
    'PB DARI PT CONTOH SEKURITAS DCMS 08:29:29 AAA', 'Rp 350,000.00', 'IPS CREDIT IPS CREDIT 0800000000000003',
    'Halaman/Page 1 / 1',
    'PT Bank Contoh, Tbk. berizin dan diawasi oleh Otoritas Jasa Keuangan dan Bank Indonesia',
  ];
  const rows = linesToStatement(lines, 2026);
  assert.deepEqual(rows.map((r) => [r.date, r.amount, r.type]), [['2026-11-10', 1250000, 'out'], ['2026-11-09', 101, 'out'], ['2026-11-09', 350000, 'in']]);
  assert.doesNotMatch(rows[2].desc, /berizin|Halaman/);
  const g = guessRow(rows[2], { ...ctx, source: 'permata' });
  assert.equal(g.type, 'in');
  assert.equal(g.note, 'Pb Dari Pt Contoh Sekuritas Credit');
});

test('PDF-style lines: wrapped descriptions and sign from running balance', () => {
  const lines = [
    'MUTASI REKENING  Periode 01/11/2026 - 10/11/2026',
    'Tanggal Keterangan Mutasi Saldo',
    '01/11 SALDO AWAL 1.250.000,00',
    '01/11 TRSF E-BANKING CR 5.200.000,00 6.450.000,00',
    'GAJI NOVEMBER',
    '03/11 PLN PREPAID 200.000,00 6.250.000,00',
    '5321 7788 9900',
    '06/11 QRIS KEDAI KOPI 22.000,00 6.228.000,00',
    'Halaman 1 dari 1',
  ];
  const rows = linesToStatement(lines, 2026);
  assert.equal(rows.length, 3);
  assert.deepEqual(rows.map((r) => [r.date, r.amount, r.type]), [['2026-11-01', 5200000, 'in'], ['2026-11-03', 200000, 'out'], ['2026-11-06', 22000, 'out']]);
  assert.match(rows[0].desc, /GAJI NOVEMBER/);
  assert.equal(guessRow(rows[0], ctx).cat, 'gaji');
  assert.equal(guessRow(rows[1], ctx).cat, 'tagihan');
});
