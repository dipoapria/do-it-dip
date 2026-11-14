import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseAmount, findDate, cellDate } from '../src/money-text.ts';
import { parseReceipt } from '../src/receipt.ts';
import { cleanText } from '../src/ocr.ts';
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

test('receipt: real Indomaret photo OCR text (address/NPWP/cashier anonymised)', () => {
  // Structure and OCR noise copied from Tesseract output of a real receipt photo (block mode).
  const text = `5. SP .
dk Sa n x
mn 1 PT INDOMARCOPRISMATAMA na
SP DOMARE TE DUA Kesan B i
Ti PANTAI INDAH KAPUK ea
HI IPWP:001.111 222 3-444.000
| NEW Oa CONTOH, RAYA :
JL CONTOH RT.OO2, KEL CONTOH
KEC CONTOH KOTA CONTOH, 10000
ik 26.10.26-13:12/4.5.3/TMXY-123456/KASIR/02
ia VIT AIR MINERAL 19 Lo 1 21500 21,500
3 TOTAL BELANJA : 21,500
a TUNAI : 50,000
KEMBALI : 28,500
PPN : DPP- 17,755 PPNz 2,131
HARGA JUAL : 19,359
2 KK AYANAN KONSUMEN
SMS WAO811.1500,: LP 15005 .
KONTAK @IND OMA ET On aro OMA`;
  const r = parseReceipt(text, '2026-11-10');
  assert.equal(r.total, 21500);
  assert.equal(r.date, '2026-10-26');
  assert.equal(r.merchant, 'Indomaret');
  assert.deepEqual(r.storeCat, { cat: 'belanja', sub: 'Kebutuhan harian' });
  assert.deepEqual(r.items, [{ name: 'VIT AIR MINERAL 19 L', amount: 21500 }]);
  assert.equal(r.pay, 'cash');
});

test('receipt: OCR misread TUNAT still means cash', () => {
  assert.equal(parseReceipt('TOKO\nTEH 5.000\nTOTAL 5.000\naa TUNAT : 10,000', '2026-11-10').pay, 'cash');
});

test('OCR clean-up drops low-confidence words at line edges only', () => {
  const w = (text: string, confidence: number) => ({ text, confidence });
  const data = { blocks: [{ paragraphs: [{ lines: [
    { words: [w('—', 14), w('VIT', 36), w('AIR', 93), w('MINERAL', 95), w('21,500', 95)] },
    { words: [w('ai', 9), w('TUNAI', 26), w(':', 84), w('50,000', 47)] },
    { words: [w('x', 10), w('y', 12)] },
  ] }] }] };
  assert.equal(cleanText(data), 'VIT AIR MINERAL 21,500\nTUNAI : 50,000\nx y');
});

test('receipt: date next to a time wins over other number patterns', () => {
  const r = parseReceipt('TOKO MAJU\nNO 05.09.26 REF\nKopi 18.000\nTOTAL 18.000\n03/11/2026 19:40', '2026-11-10');
  assert.equal(r.date, '2026-11-03');
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

test('receipt: arithmetic outvotes a misread TOTAL; service/tax lines are not items', () => {
  const kel = parseReceipt(`TOKO BERKAH JAYA
31/10/2026 14:50 Ksr : FAJAR
BAYGON AEROSOL 600ML
1 x 388-900 38.900
ABC SAMBAL ASLI 335
1 x 12: 500 12.500
TELUR AYAM NEGERI 10
1 x 27.500 27.500
Subtotal 78.900
Total 718.900
Bayar 100.000
Kembali 21.100`, '2026-11-10');
  assert.equal(kel.total, 78900);
  assert.deepEqual(kel.items.map((i) => [i.name, i.amount]), [['BAYGON AEROSOL 600ML', 38900], ['ABC SAMBAL ASLI 335', 12500], ['TELUR AYAM NEGERI 10', 27500]]);
  assert.equal(kel.confidence, 'high');
  const kafe = parseReceipt(`KEDAI SENJA
1 Kopi Susu Gula Aren 25.000
2 Roti Bakar Coklat 44.000
1 Air Mineral 6.000
Subtotal 75.000
Service 5% 3.750
PB1 10% 7.875
TOTAL 86.625
QRIS 86.625`, '2026-11-10');
  assert.deepEqual(kafe.items.map((i) => i.name), ['Kopi Susu Gula Aren', 'Roti Bakar Coklat', 'Air Mineral']);
  assert.equal(kafe.items[1].qty, 2);
  assert.equal(kafe.total, 86625);
  assert.equal(kafe.confidence, 'high');
});

test('receipt: a reading that cannot be verified is never "high"', () => {
  const r = parseReceipt('ALFA ee\nKeritikea ON VW 2006\nzz', '2026-11-10');
  assert.notEqual(r.confidence, 'high');
  const roti = parseReceipt(`BAKERY MANDIRI
ROTI ABON SAPI 1 8 12.000 12.090
BROWNIES PANGGANG 1 @ 55.000 55.000
JUMLAH 67.090
DIBAYAR 70.000
KEMBALI 3.000`, '2026-11-10');
  assert.equal(roti.items[0].amount, 12000);
  assert.equal(roti.total, 67000);
});

test('receipt: item names that look like keywords (TOMAT ≈ TOTAL, BAYAM ≈ BAYAR) stay items', () => {
  const r = parseReceipt(`SUPERINDO
BAYAM HIJAU IKAT 6.500
DISC -1.000
TOMAT MERAH 12.500
SUNLIGHT NIPIS 755
MW 4x 15.500 62.000 P
SUB TOTAL 81.000
TOTAL DISKON -1.000
TOTAL 80.000
TUNAI 100.000
KEMBALI 20.000`, '2026-11-10');
  assert.deepEqual(r.items.map((i) => [i.name, i.amount]), [['BAYAM HIJAU IKAT', 6500], ['TOMAT MERAH', 12500], ['SUNLIGHT NIPIS 755', 62000]]);
  assert.equal(r.total, 80000);
  assert.equal(r.confidence, 'high');
});

test('receipt: zeros misread as 8/9 are repaired when the items then add up', () => {
  const r = parseReceipt(`HYPERMART
SOSIS SO NICE 360G
2 X 31.500 63.080
TOMAT MERAH 12.588
YOGHURT CIMORY 250 12.968
SUB TOTAL 88.400
TOTAL 88.400
DEBIT MANDIRI 88.400`, '2026-11-10');
  assert.deepEqual(r.items.map((i) => i.amount), [63000, 12500, 12900]);
  assert.equal(r.confidence, 'high');
});

test('receipt: confidence is not "high" when the total is unproven', () => {
  const ap = parseReceipt(`APOTEK BUNDA
TADINE SOL 15ML 2
JTAL 37.000
TUNAI 40.000
KEMBALI 3.000`, '2026-11-10');
  assert.equal(ap.total, 37000);
  assert.equal(ap.items.length, 0);
  assert.notEqual(ap.confidence, 'high');
  const fuel = parseReceipt(`PERTAMINA
Nama Produk : DEXLITE
Harga/Liter : Rp. 13.250
Volume : (L) 2,26
Total Harga : Rp. 39.009
CASH : Rp. 38.000`, '2026-11-10');
  assert.equal(fuel.confidence, 'medium');
  const fuelOk = parseReceipt(`PERTAMINA
Nama Produk : PERTALITE
Harga/Liter : Rp. 10.000
Volume : (L) 10,25
Total Harga : Rp. 102.500
CASH : Rp. 105.000`, '2026-11-10');
  assert.equal(fuelOk.confidence, 'high');
  assert.equal(parseReceipt('TOKO\nTEH 5.000\nTOTAL 5.00€\nTUNAI 10.000\nKEMBALI 5.000', '2026-11-10').total, 5000);
});

test('receipt: numbered 3-line items (Lotte Grosir layout), weights in kg, no item numbers in names', () => {
  const text = `LOTTE Grosir
PT LOTTE SHOPPING INDONESIA
2026-09-16 20:37 POS:2105-0134
Nama Harga satuan Qty Harga Jual
001 INDOMIEGRGAYAM PGG JMB127G
0089686041767 3,900
1 3,900
002 INDOMIE GRG CB IJO JUMBO120g
0089686043860 3,900
1 3,900
003 INDOMIEGORENGJUMBO129G
0089686041705 3,900
1 3,900
004 ROMA KELAPA 300GR
8996001301142 9,100
2 18,200
005 HARPIC PWR TC ORIGINAL 200ML
8993560033040 14,000
1 14,000
006 SO KLIN LIQ KOREAN 525/510gr
8998866624336 10,900
1 10,900
007 GOLDA CAPPUCINO PET 200 ML
8998866202893 3,400
1 3,400
008 TELUR AYAM NEGERI CURAH /KG
2034120000006 25,700
1.024 26,317
SCode:20341270026317010247
TOTAL SUM 84,517
TOTAL HARUS DIBAYAR 84,517
CASH 84,517
Jumlah 100,000
KEMBALIAN 15,483
TOTAL_ITEM : 8 TOTAL_QTY : 9
Harga jual sudah termasuk PPN`;
  const r = parseReceipt(text, '2026-11-14');
  assert.deepEqual(r.items.map((i) => [i.name, i.amount]), [
    ['INDOMIEGRGAYAM PGG JMB127G', 3900], ['INDOMIE GRG CB IJO JUMBO120g', 3900], ['INDOMIEGORENGJUMBO129G', 3900], ['ROMA KELAPA 300GR', 18200],
    ['HARPIC PWR TC ORIGINAL 200ML', 14000], ['SO KLIN LIQ KOREAN 525/510gr', 10900], ['GOLDA CAPPUCINO PET 200 ML', 3400], ['TELUR AYAM NEGERI CURAH /KG', 26317],
  ]);
  assert.equal(r.items[3].qty, 2);
  assert.equal(r.total, 84517);
  assert.equal(r.date, '2026-09-16');
  assert.equal(r.confidence, 'high');
});

test('receipt: numbered items survive OCR noise (9 for 0 in the number, garbage after names)', () => {
  const r = parseReceipt(`Nama Harga satuan Qty Harga Jual
001 INDOMIE GRG
0089686043860 3,900
1 3,900
905 HARPIC PWR TC ORIGINAL 200ML |
| 8993560033040 , 14.000 14.000 Oi la
006 SO KLIN LIO KOREAN 525/510gr
8998866624336 10.900
1 10.900
TOTAL HARUS DIBAYAR 28,800
CASH 50,000
KEMBALIAN 21,200`, '2026-11-14');
  assert.deepEqual(r.items.map((i) => [i.name, i.amount, i.seq]), [['INDOMIE GRG', 3900, 1], ['HARPIC PWR TC ORIGINAL 200ML', 14000, 5], ['SO KLIN LIO KOREAN 525/510gr', 10900, 6]]);
  assert.equal(r.total, 28800);
  assert.equal(r.confidence, 'high');
});

test('receipt: self-contradicting line fixed by the payment; mangled fee labels between subtotal and total', () => {
  const roti = parseReceipt(`HOLLAND BAKERY
PIZZA MINI SOSIS 1 @ 13.000 13.000
BROWNIES PANGGANG 1 @ 55.000 55.800
ROTI ABON SAPI 1 @ 12.000 12.000
JUMLAH 80.800
DIBAYAR 100.000
KEMBALI 20.000`, '2026-11-10');
  assert.equal(roti.items[1].amount, 55000);
  assert.equal(roti.total, 80000);
  const kafe = parseReceipt(`KEDAI SENJA
1 Lemon Tea Ic 15.000
1 Americano Ice 22.000
3 Jus Alpukat 60.000
btotal 97.000
ervice 5$ 4.850
PEL 10X 10.185
TOTAL 132.035
TUNAI 112.035`, '2026-11-10');
  assert.equal(kafe.total, 112035);
  assert.equal(kafe.items.length, 3);
});
