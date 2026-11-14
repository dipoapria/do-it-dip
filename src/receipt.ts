// Turns the text OCR read from a receipt photo into: purchased items with their prices, the total, the date and
// how it was paid. Everything else on a receipt (shop name, address, tax ids, codes, cashier, footer) is left out.
//
// OCR makes mistakes, so the numbers are cross-checked the way a person would:
//   items − discounts + service/tax = TOTAL = cash − change   (or = the card/QRIS amount)
// When the TOTAL line is misread, the other sources outvote it; the result says how sure it is.
import { addDays } from './format.ts';
import { amountsIn, findDate } from './money-text.ts';

export interface ReceiptItem { name: string; amount: number; qty?: number }
export type Confidence = 'high' | 'medium' | 'low';
export interface ReceiptResult {
  /** Shop, only used to suggest a category (never shown as an item or note). */
  merchant: string;
  storeCat: { cat: string; sub: string } | null;
  total: number | null;
  subtotal: number | null;
  date: string | null;
  items: ReceiptItem[];
  /** How it was paid, as printed: 'cash', 'card', or an e-wallet keyword such as 'gopay'. */
  pay: string | null;
  /** high: items, total and payment agree; medium: total confirmed, items incomplete; low: unverified. */
  confidence: Confidence;
  lines: string[];
}

/* ---------------- text clean-up ---------------- */

/** Fix what OCR typically does to numbers: "12: 500" → "12.500", "388-900" → "388.900", "2l.5OO" → "21.500". */
export function normalizeLine(raw: string): string {
  let s = raw.replace(/[|¦]/g, ' ').replace(/[“”"«»]/g, ' ').replace(/(\d)[€©®°](?=\s|$)/g, '$10').replace(/\s+/g, ' ').trim();
  // letters inside number-looking tokens
  s = s.split(' ').map((t) => {
    if (!/\d/.test(t) || (t.match(/\d/g) || []).length < 2) return t;
    const core = t.replace(/^[-(]/, '').replace(/[)]$/, '');
    if (/^[\dOoIlSB.,]+$/.test(core) && /[OoIlSB]/.test(core) && (core.match(/\d/g) || []).length >= core.replace(/[.,]/g, '').length * 0.6)
      return t.replace(/[Oo]/g, '0').replace(/[Il]/g, '1').replace(/S/g, '5').replace(/B/g, '8');
    return t;
  }).join(' ');
  s = s.replace(/(\d{1,3})\s?[:;]\s?(\d{3})(?!\d)/g, '$1.$2');             // 12: 500 → 12.500
  s = s.replace(/(^|[^\d/.-])(\d{1,3})-(\d{3})(?![\d/-])/g, '$1$2.$3');     // 388-900 → 388.900 (not dates/codes)
  s = s.replace(/(\d{1,3})[.,] (\d{3})(?!\d)/g, '$1.$2');                   // 21. 500 → 21.500
  s = s.replace(/\b(rp\.?:?)\s*(\d{1,3}) (\d{3})(?!\d)/gi, '$1 $2.$3');     // Rp. 182 580 → Rp. 182.580
  return s;
}

/** Receipts are printed in capitals; lowercase fragments on a mostly-uppercase line are OCR noise from the background. */
function dropNoise(line: string): string {
  const letters = line.replace(/[^A-Za-z]/g, ''), upper = line.replace(/[^A-Z]/g, '');
  const tokens = line.split(' ').filter((t) => /[\p{L}\p{N}@]/u.test(t));
  if (letters.length < 4 || upper.length / letters.length < 0.7) return tokens.join(' ');
  return tokens.map((t) => t.replace(/[a-z]/g, '')).filter((t) => /[\p{L}\p{N}@]/u.test(t)).join(' ');
}

/* ---------------- fuzzy keywords ---------------- */

function lev(a: string, b: string): number {
  if (Math.abs(a.length - b.length) > 2) return 9;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[b.length];
}
/** Words of a line in capitals, with digits OCR put into words turned back into letters (T0TAL, TUNA1). */
function words(line: string): string[] {
  return line.toUpperCase().split(/[^A-Z0-9]+/).filter((w) => /[A-Z]/.test(w))
    .map((w) => w.replace(/0/g, 'O').replace(/1/g, 'I').replace(/5/g, 'S').replace(/8/g, 'B').replace(/[^A-Z]/g, ''))
    .filter(Boolean);
}
// Short keywords: only a substituted letter counts as a match (TUNAT ≈ TUNAI), so SUSU never matches SUSUK;
// long keywords may also lose or gain a letter.
const near = (w: string, k: string) => w === k || (k.length >= 5 && w.length === k.length && lev(w, k) <= 1) || (k.length >= 8 && lev(w, k) <= 2);
/** Does the line contain one of the keys (multi-word keys may also be written joined: "SUB TOTAL" / "SUBTOTAL")? */
function has(ws: string[], keys: string[], fuzzy = true): boolean {
  const eq = fuzzy ? near : (w: string, k: string) => w === k;
  for (const k of keys) {
    const parts = k.split(' ');
    if (parts.length === 1) { if (ws.some((w) => eq(w, k))) return true; continue; }
    const joined = parts.join('');
    if (ws.some((w) => eq(w, joined))) return true;
    for (let i = 0; i + parts.length <= ws.length; i++) if (parts.every((p, j) => eq(ws[i + j], p))) return true;
  }
  return false;
}

/**
 * Summary keywords start their line on real receipts ("Total", "Tunai", "Debit Mandiri"); only the first word is
 * checked (the second when the first is 1–2 letters of OCR noise), and two-word keys against the first two words.
 * That keeps item names such as "ROTI BAKAR" (≈ BAYAR) from being read as summary lines.
 */
function leads(ws: string[], keys: string[]): boolean {
  const f = ws.length > 1 && ws[0].length <= 2 ? 1 : 0, one = ws.slice(f, f + 1), two = ws.slice(f, f + 2);
  const test = (fuzzy: boolean) => keys.some((k) => (k.includes(' ') ? has(two, [k], fuzzy) || (two.length === 2 && has([two.join('')], [k.replace(/ /g, '')], fuzzy)) : has(one, [k], fuzzy)));
  if (test(false)) return true;
  // A misspelt keyword ("TUNAT", "T0TAL") only counts on a short line: "TOMAT MERAH 12.500" and "BAYAM HIJAU IKAT"
  // are items, even though TOMAT ≈ TOTAL and BAYAM ≈ BAYAR.
  return ws.length - f <= 2 && test(true);
}

const K = {
  total: ['TOTAL', 'GRAND TOTAL', 'TOTAL BELANJA', 'TOTAL BAYAR', 'TOTAL HARGA', 'JUMLAH', 'TAGIHAN', 'NETTO', 'AMOUNT'],
  notTotal: ['SUB', 'SUBTOTAL', 'ITEM', 'ITEMS', 'QTY', 'DISKON', 'DISC', 'HEMAT', 'POTONGAN', 'BERAT', 'KEMBALI', 'KEMBALIAN', 'TUNAI', 'CASH', 'DPP', 'PPN', 'POIN', 'POINT'],
  subtotal: ['SUBTOTAL', 'SUB TOTAL'],
  cash: ['TUNAI', 'CASH', 'BAYAR', 'DIBAYAR', 'UANG', 'PEMBAYARAN'],
  card: ['DEBIT', 'DEBET', 'KREDIT', 'CARD', 'QRIS', 'KARTU DEBIT', 'KARTU KREDIT', 'GOPAY', 'OVO', 'DANA', 'SHOPEEPAY', 'LINKAJA', 'EDC', 'FLAZZ', 'BRIZZI', 'EMONEY', 'TRANSFER'],
  change: ['KEMBALI', 'KEMBALIAN', 'CHANGE'],
  fee: ['SERVICE', 'SERVIS', 'SVC', 'PB1', 'PBI', 'PAJAK', 'TAX', 'PPN', 'ONGKIR', 'PACKAGING', 'BUNGKUS'],
  discount: ['DISC', 'DISKON', 'DISCOUNT', 'POTONGAN', 'HEMAT', 'PROMO', 'VOUCHER', 'TOTAL DISKON', 'TOTAL DISC', 'TOTAL POTONGAN', 'TOTAL HEMAT', 'ANDA HEMAT'],
  count: ['TOTAL ITEM', 'JUMLAH ITEM', 'QTY', 'TOTAL QTY', 'ITEM'],
  junk: ['NPWP', 'JL', 'JLN', 'JALAN', 'TELP', 'TLP', 'TELEPON', 'HP', 'KASIR', 'KSR', 'CASHIER', 'BON', 'INV', 'INVOICE', 'MEJA', 'TABLE', 'WIFI', 'PASS',
    'PASSWORD', 'FOLLOW', 'INSTAGRAM', 'TERIMA', 'KASIH', 'THANK', 'KRITIK', 'SARAN', 'SMS', 'WA', 'WHATSAPP', 'KONTAK', 'LAYANAN', 'KONSUMEN', 'APOTEKER',
    'SIA', 'SHIFT', 'OPERATOR', 'PULAU', 'POMPA', 'WAKTU', 'TRANS', 'BARANG', 'DITUKAR', 'DIKEMBALIKAN', 'WWW', 'HTTP', 'TBK', 'TOWER',
    'KEC', 'KEL', 'KOTA', 'KAB', 'RT', 'RW', 'BLOK', 'RUKO', 'GEDUNG', 'NOTA', 'STRUK', 'RECEIPT', 'MEMBER', 'POIN', 'POINT', 'TGL', 'TANGGAL', 'JAM',
    'POS', 'TRX', 'DPP', 'SELAMAT', 'KUNJUNGAN', 'SPBU', 'REF', 'NO', 'TRANSAKSI', 'ORDER', 'SALDO', 'PELANGGAN', 'CUSTOMER', 'TERMINAL', 'MID', 'TID', 'APPR',
    'HARGA JUAL', 'SEMOGA', 'SEMBUH', 'PT', 'CV', 'GRATIS', 'KLIK', 'DOWNLOAD', 'APLIKASI', 'NOMOR', 'NIK', 'ALAMAT', 'KARTU'],
};

/* ---------------- line analysis ---------------- */

type Kind = 'item' | 'name' | 'qty' | 'discount' | 'subtotal' | 'total' | 'fee' | 'cash' | 'card' | 'change' | 'count' | 'junk' | 'amount' | 'other';
interface Line { raw: string; text: string; ws: string[]; kind: Kind; amount: number | null; item?: ReceiptItem & { unit?: number } }

const isDateish = (l: string) => /\d{1,2}[./-]\d{1,2}[./-]\d{2,4}|\d{1,2}:\d{2}/.test(l);
/** Money values on a line, ignoring phone numbers, NPWP, codes and dates. */
function moneyOf(l: string): number[] {
  const clean = l.replace(/\b\d{1,2}[./-]\d{1,2}[./-]\d{2,4}\b/g, ' ').replace(/\b\d{1,2}[:.]\d{2}(:\d{2})?\b(?![.,]\d)/g, ' ').replace(/\b0\d{7,}\b/g, ' ').replace(/\d+(\/\d+)+/g, ' ');
  return amountsIn(clean).map((a) => a.value).filter((v) => v !== 0 && Math.abs(v) < 100_000_000);
}
const letterCount = (s: string) => (s.match(/\p{L}/gu) || []).length;
/** Same number of digits and exactly one differs (a typical OCR misread: 12.090 for 12.000). */
function oneDigitOff(a: number, b: number): boolean {
  const x = String(a), y = String(b);
  if (x.length !== y.length || x === y) return false;
  let d = 0; for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) d++;
  return d === 1;
}

/** "NAME [qty] [x|@] [unit] total" or "qty NAME total" → item; null when the line is not an item. */
function parseItem(text: string): (ReceiptItem & { unit?: number }) | null {
  const t = dropNoise(text);
  const toks = t.split(' ');
  const num = (s: string) => /^-?\(?[\d.,]+\)?-?$/.test(s);
  // OCR noise after the price from the paper edge or a shadow: "13,900 MB", "12.500 Sg.", "85.000 H3 Ai"
  for (let n = 0; n < 2 && toks.length > 2; n++) {
    const last = toks[toks.length - 1].replace(/[^\p{L}\p{N}]/gu, '');
    if (last.length <= 3 && /\p{L}/u.test(last) && toks.slice(0, -1).some(num)) toks.pop(); else break;
  }
  // walk from the right over the numeric tail: total, optional unit, optional x/@, optional qty
  let i = toks.length;
  const tail: string[] = [];
  while (i > 0 && (num(toks[i - 1]) || /^[x×@X]$/.test(toks[i - 1]) || /^\d+[xX×@]$/.test(toks[i - 1]) || /^[xX×@]\d/.test(toks[i - 1]))) tail.unshift(toks[--i]);
  if (!tail.length) return null;
  const tailText = tail.join(' ');
  const am = amountsIn(tailText).map((a) => a.value).filter((v) => v > 0);
  if (!am.length) return null;
  const amount = am[am.length - 1];
  if (amount < 100) return null;
  let qty: number | undefined, unit: number | undefined;
  let nameToks = toks.slice(0, i);
  const qx = tailText.match(/(?:^|\s)(\d{1,3})\s*[xX×@]\s*([\d.,]+)/);
  if (qx) { qty = Number(qx[1]); unit = amountsIn(qx[2])[0]?.value ?? (Number(qx[2].replace(/[.,]/g, '')) || undefined); }
  else {
    // tail = [name-number…, qty, unit, total]: the money tokens are at the end, a small integer before them is the qty,
    // anything before the qty belongs to the name ("TELUR AYAM NEGERI 10 1 27500 27,500")
    const moneyIdx = tail.map((x, j) => (amountsIn(x).some((a) => a.value >= 100) ? j : -1)).filter((j) => j >= 0);
    const firstMoney = moneyIdx.length >= 2 ? moneyIdx[moneyIdx.length - 2] : moneyIdx[moneyIdx.length - 1];
    if (moneyIdx.length >= 2) unit = amountsIn(tail[firstMoney])[0].value;
    // the qty is the small number whose product with the unit price gives the line total ("1 8 12.000 12.000":
    // the "8" is a misread "@"); otherwise the one nearest the unit price
    let qIdx = -1;
    for (let j = firstMoney - 1; j >= 0; j--) if (/^\d{1,3}$/.test(tail[j]) && unit && Number(tail[j]) * unit === amount) { qIdx = j; break; }
    if (qIdx < 0) for (let j = firstMoney - 1; j >= 0; j--) if (/^\d{1,3}$/.test(tail[j])) { qIdx = j; break; }
    // "1 8 12.000": a lone 8 right before the unit, after a qty, is a misread "@"
    if (qIdx >= 1 && tail[qIdx] === '8' && /^\d{1,3}$/.test(tail[qIdx - 1])) qIdx--;
    if (qIdx >= 0) { qty = Number(tail[qIdx]); nameToks = nameToks.concat(tail.slice(0, qIdx)); }
    else nameToks = nameToks.concat(tail.slice(0, Math.max(0, firstMoney)));
  }
  // leading quantity: "2 Roti Bakar Coklat 44.000"
  if (qty === undefined && nameToks.length > 1 && /^\d{1,2}$/.test(nameToks[0]) && /\p{L}/u.test(nameToks[1])) { qty = Number(nameToks[0]); nameToks = nameToks.slice(1); }
  const name = nameToks.join(' ').replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N})]+$/gu, '').replace(/^\d{6,}\s+/, '').trim();
  if (letterCount(name) < 3) return null;
  return { name, amount, qty, unit };
}

function classify(raw: string): Line {
  const text = normalizeLine(raw), ws = words(text), money = moneyOf(text);
  const amount = money.length ? money[money.length - 1] : null;
  const L: Line = { raw, text, ws, kind: 'other', amount };
  const neg = /(^|\s)-\s?\(?\d|\(\d[\d.,]*\)/.test(text);
  const email = /\S@\S+\.\S|@[a-z]/i.test(text);
  // Summary keywords start their line on real receipts ("Total", "Tunai", "Kartu Debit"); looking only at the first
  // two words keeps item names such as "ROTI BAKAR" (≈ BAYAR) from being read as summary lines.
  const lead = (keys: string[]) => leads(ws, keys);
  if (lead(K.subtotal)) L.kind = 'subtotal';
  else if (lead(K.count) && !has(ws, ['BELANJA', 'BAYAR', 'HARGA'])) L.kind = 'count';
  else if (lead(K.total) && !has(ws, K.notTotal)) L.kind = 'total';
  else if (lead(K.discount)) L.kind = 'discount';
  else if (lead(K.change)) L.kind = 'change';
  else if (lead(K.fee) || (/\d\s?%/.test(text) && ws.length <= 3)) L.kind = 'fee';
  else if (lead(K.cash)) L.kind = 'cash';
  else if (lead(K.card)) L.kind = 'card';
  else if (email || has(ws, K.junk, false) || (isDateish(text) && !/[xX@]\s*[\d]/.test(text))) L.kind = 'junk';
  else if (neg && amount !== null && ws.length <= 2) L.kind = 'discount';
  else {
    const it = parseItem(text);
    if (it) { L.kind = 'item'; L.item = it; }
    else {
      // the second line of a two-line item, with OCR crumbs at either end: "MW 4x 15.500 62.000 P"
      const core = text.split(' ').filter((t, j, a) => !((j === 0 || j === a.length - 1) && /^[^\d]{1,3}$/.test(t) && !/^[xX×@]$/.test(t))).join(' ');
      if (amount !== null && letterCount(core.replace(/\b[xX]\b/g, '')) === 0 && /^\s*\d{1,3}\s*[xX×@]/.test(core)) L.kind = 'qty';
      else if (amount !== null && letterCount(text) <= 1) L.kind = /[xX×@]/.test(text) ? 'qty' : 'amount';
      else if (/^\s*\d{1,3}\s*[xX×@]\s*[\d.,]+/.test(core)) L.kind = 'qty';
      else if (letterCount(text) >= 3 && amount === null) L.kind = 'name';
    }
  }
  if (L.kind === 'discount' && L.amount !== null) L.amount = Math.abs(L.amount);
  return L;
}

/* ---------------- shops, payment ---------------- */

/** Known chains: matched loosely because OCR mangles logos and headers (INDOMARCO, ALFARIA…). */
const STORES: [RegExp, string, string, string][] = [
  [/indomar(et|co)|indomaret/i, 'Indomaret', 'belanja', 'Kebutuhan harian'],
  [/alfamidi/i, 'Alfamidi', 'belanja', 'Kebutuhan harian'],
  [/alfamart|alfaria/i, 'Alfamart', 'belanja', 'Kebutuhan harian'],
  [/superindo|lion super/i, 'Superindo', 'belanja', 'Kebutuhan harian'],
  [/hypermart|matahari putra/i, 'Hypermart', 'belanja', 'Kebutuhan harian'],
  [/transmart|carrefour/i, 'Transmart', 'belanja', 'Kebutuhan harian'],
  [/lotte\s*mart/i, 'Lotte Mart', 'belanja', 'Kebutuhan harian'],
  [/circle\s*k/i, 'Circle K', 'belanja', 'Kebutuhan harian'],
  [/lawson/i, 'Lawson', 'belanja', 'Kebutuhan harian'],
  [/family\s*mart/i, 'FamilyMart', 'belanja', 'Kebutuhan harian'],
  [/guardian|watsons/i, 'Watsons/Guardian', 'belanja', 'Kebutuhan harian'],
  [/kimia\s*farma|apotek|k-?24|century/i, 'Apotek', 'kesehatan', 'Obat'],
  [/pertamina|spbu|shell|vivo energy|bp akr/i, 'SPBU', 'transport', 'Bensin'],
  [/starbucks|kopi kenangan|janji jiwa|fore coffee|tomoro|point coffee/i, 'Kedai kopi', 'makan', 'Kopi & minuman'],
  [/\bkfc\b|mc\s?donald|richeese|burger king|hokben|solaria|pizza hut/i, 'Restoran', 'makan', 'Makan siang'],
  [/gramedia/i, 'Gramedia', 'pendidikan', 'Buku'],
];
const PAY: [RegExp, string][] = [
  [/\bgo-?pay\b/i, 'gopay'], [/\bovo\b/i, 'ovo'], [/\bdana\b/i, 'dana'], [/shopee\s*pay/i, 'shopeepay'], [/link\s*aja/i, 'linkaja'], [/\bqris\b/i, 'qris'],
  [/\b(debit|kartu|card|edc|visa|master\s*card|flazz|bca|bri|bni|mandiri)\b/i, 'card'],
  [/\b(tuna[i1lt!]|cash)\b/i, 'cash'], // OCR often reads TUNAI as TUNAT / TUNA1
];
function titleCase(s: string): string {
  if (s !== s.toUpperCase()) return s;
  return s.toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase());
}

/* ---------------- main ---------------- */

export function parseReceipt(text: string, today: string): ReceiptResult {
  const rawLines = text.split(/\r?\n/).map((l) => l.replace(/\s+/g, ' ').trim()).filter((l) => l.length > 1);
  const all = rawLines.join('\n');
  const L = rawLines.map(classify);

  // Fuel receipts: "Nama Produk : PERTALITE" … "Total Harga : Rp. 102.500"
  const fuel = L.find((l) => /produk|jenis\s*bbm|\bbbm\b|grade/i.test(l.text) && /:\s*\S/.test(l.text));
  if (fuel && /pertamina|spbu|shell|vivo|bp\b|liter/i.test(all)) {
    const name = fuel.text.split(':').slice(1).join(':').replace(/[^\p{L}\p{N} ]/gu, ' ').replace(/\s+/g, ' ').trim();
    const totalLine = L.find((l) => /total|jumlah|harga\s*total/i.test(l.text) && !/liter/i.test(l.text) && l.amount);
    const total = totalLine?.amount ?? null;
    // confirmed by the cash line, or by price per litre × litres (within 2%)
    const cashLine = L.find((l) => /cash|tunai|bayar/i.test(l.text) && l.amount);
    const perL = L.find((l) => /harga\s*\/?\s*liter/i.test(l.text))?.amount ?? null;
    const volM = L.find((l) => /volume|liter\s*:/i.test(l.text) && !/harga/i.test(l.text))?.text.match(/(\d+)[.,](\d{1,3})\s*$/);
    const litres = volM ? Number(volM[1] + '.' + volM[2]) : 0;
    const ok = total !== null && (cashLine?.amount === total || (perL !== null && litres > 0 && Math.abs(perL * litres - total) <= total * 0.02));
    return finish({ items: total && letterCount(name) >= 3 ? [{ name, amount: total }] : [], total, subtotal: total, confidence: !total ? 'low' : ok ? 'high' : 'medium' }, L, rawLines, all, today);
  }

  // The summary starts at the first subtotal/total/payment line that follows at least one item.
  const firstItem = L.findIndex((l) => l.kind === 'item' || l.kind === 'name');
  let sumStart = L.findIndex((l, i) => i > firstItem && ['subtotal', 'total', 'cash', 'card', 'change', 'count'].includes(l.kind));
  if (sumStart < 0) sumStart = L.length;

  // Items, joining two-line items ("GULA PASIR 1KG" / "2 x 16.000   32.000") and collecting item discounts.
  const items: ReceiptItem[] = [];
  const units: (number | undefined)[] = [];
  const used = new Set<number>();
  const promoted: number[] = []; // amounts of total lines OCR made look like an item ('JTAL 37.000')
  let itemDisc = 0;
  for (let i = 0; i < sumStart; i++) {
    const l = L[i], next = L[i + 1];
    const nextIsQty = next && i + 1 < sumStart && (next.kind === 'qty' || (next.kind === 'amount' && l.kind === 'name'));
    if ((l.kind === 'name' || (l.kind === 'item' && nextIsQty && (l.item!.amount < 1000 || /^\s*\d{1,3}\s*[xX×@]/.test(next.text)))) && nextIsQty && next.amount) {
      const name = (l.kind === 'item' ? dropNoise(l.text) : dropNoise(l.text)).replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N})]+$/gu, '');
      if (letterCount(name) >= 3 && !has(l.ws, K.junk)) {
        const q = next.text.match(/(\d{1,3})\s*[xX×@]\s*([\d.,]+)/);
        const money = moneyOf(next.text);
        items.push({ name, amount: next.amount, qty: q ? Number(q[1]) : undefined });
        units.push(q ? (amountsIn(q[2])[0]?.value ?? (money.length >= 2 ? money[money.length - 2] : undefined)) : undefined);
        used.add(i + 1); i++; continue;
      }
    }
    if (l.kind === 'item' && l.item) {
      const w = l.item.name.toUpperCase().replace(/[^A-Z]/g, '');
      if (!/\s/.test(l.item.name.trim()) && w.length <= 6 && ['TOTAL', 'JUMLAH', 'SUBTOTAL'].some((k) => lev(w, k) <= 2) && i >= sumStart - 2) { l.kind = 'total'; promoted.push(l.item.amount); continue; }
      items.push({ name: l.item.name, amount: l.item.amount, qty: l.item.qty }); units.push(l.item.unit);
    }
    else if (l.kind === 'discount' && l.amount && items.length) itemDisc += l.amount;
  }

  // Summary values
  const after = L.slice(sumStart);
  const pick = (kind: Kind) => after.filter((l) => l.kind === kind && l.amount !== null && l.amount > 0).map((l) => l.amount!);
  const totals = pick('total').concat(promoted), subs = pick('subtotal'), cash = pick('cash'), change = after.filter((l) => l.kind === 'change' && l.amount !== null).map((l) => l.amount!), cards = pick('card');
  const totalIdx = after.findIndex((l) => l.kind === 'total' && l.amount);
  const subIdx = after.findIndex((l) => l.kind === 'subtotal');
  // service/tax added between subtotal and total (or before total without a subtotal); later ones are informational
  const fees = after.filter((l, i) => l.kind === 'fee' && l.amount && i < (totalIdx >= 0 ? totalIdx : after.length) && i > subIdx && !/dpp|harga\s*jual|termasuk|incl/i.test(l.text)).reduce((s, l) => s + l.amount!, 0);
  const totDiscLine = after.find((l, i) => l.kind === 'discount' && l.amount && (totalIdx < 0 || i < totalIdx));
  const discount = totDiscLine?.amount ?? itemDisc;
  // a lone amount right after the items with no keyword ("Nasi 15.000 / Teh 5.000 / 20.000")
  const lone = L.find((l, i) => i >= Math.max(0, sumStart - 1) && !used.has(i) && l.kind === 'amount' && l.amount)?.amount;

  const payTotals = [...(cash.length && change.length ? [cash[0] - change[0]] : []), ...cards, ...(cash.length && !change.length ? cash : [])].filter((v) => v > 0);
  const anchors = [...totals, ...payTotals, ...(subs.length ? [subs[0] - discount + fees] : [])];
  // an "item" larger than anything the summary says was paid is a misread header number (NPWP, phone, code)
  if (anchors.length) { const cap = Math.max(...anchors) + discount; for (let k = items.length - 1; k >= 0; k--) if (items[k].amount > cap) { items.splice(k, 1); units.splice(k, 1); } }

  // Repair item prices with qty × unit (OCR misread a digit of a line total): when that makes the sums agree with
  // the summary, or when the printed amount is "odd" (not a multiple of 100) and qty × unit differs in one digit.
  const sumItems = () => items.reduce((s, it) => s + it.amount, 0);
  const expected = () => sumItems() - discount + fees;
  items.forEach((it, k) => {
    const u = units[k], want = u ? u * (it.qty ?? 1) : 0;
    if (want && it.amount % 100 !== 0 && want % 100 === 0 && oneDigitOff(it.amount, want)) it.amount = want;
  });
  // Zeros read as 8/9/6/3 ("63.080", "12.588"): shop prices are nearly always whole hundreds. Rounding the odd
  // prices down to the hundred is kept when it makes the items add up to the summary.
  const oddFix = (v: number) => (v >= 1000 && v % 100 !== 0 && /[0-35689]{2}$/.test(String(v)) ? Math.floor(v / 100) * 100 : v);
  if (anchors.length && !anchors.includes(expected()) && fees === 0) {
    const saved = items.map((it) => it.amount);
    items.forEach((it, k) => { const u = units[k], q = it.qty ?? 1; it.amount = u && (u * q) % 100 === 0 && oneDigitOff(it.amount, u * q) ? u * q : oddFix(it.amount); });
    if (!anchors.includes(expected())) saved.forEach((v, k) => (items[k].amount = v));
  }
  if (anchors.length && !anchors.includes(expected())) {
    const fixable = items.map((it, k) => (units[k] && units[k]! * (it.qty ?? 1) !== it.amount ? k : -1)).filter((k) => k >= 0);
    const saved = items.map((it) => it.amount);
    fixable.forEach((k) => (items[k].amount = units[k]! * (items[k].qty ?? 1)));
    if (!anchors.includes(expected())) saved.forEach((v, k) => (items[k].amount = v));
  }
  if (anchors.length && !anchors.includes(expected())) {
    for (let k = 0; k < items.length; k++) {
      const u = units[k], q = items[k].qty ?? 1;
      if (!u || u * q === items[k].amount) continue;
      const old = items[k].amount; items[k].amount = u * q;
      if (anchors.includes(expected())) break;
      items[k].amount = old;
    }
  }

  // Choose the total. The summary (TOTAL line, cash − change, card amount, subtotal) is what was really paid; the
  // items' sum only counts when it agrees with one of those, because items can be missed or misread.
  const exp = expected();
  const src: [number, number][] = [
    ...totals.map((v, i): [number, number] => [v, i === 0 ? 3 : 1.5]),
    ...payTotals.map((v): [number, number] => [v, 2]),
    ...(subs.length ? [[subs[0] - discount + fees, 1.5] as [number, number]] : []),
    ...(lone ? [[lone, 1] as [number, number]] : []),
  ].filter(([v]) => v > 0);
  const votes = new Map<number, number>();
  const add = (v: number, w: number) => votes.set(v, (votes.get(v) || 0) + w);
  src.forEach(([v, w]) => add(v, w));
  if (items.length && votes.has(exp)) add(exp, 2.5);
  // an anchor one digit away from a round items' sum is that sum misread ("133.090" for 133.000)
  if (items.length && exp % 100 === 0) for (const [v, w] of src) if (v !== exp && v % 100 !== 0 && oneDigitOff(v, exp)) add(exp, w * 0.9);
  let total: number | null = null, best = 0;
  for (const [v, w] of votes) if (w > best || (w === best && total !== null && v < total)) { best = w; total = v; }
  if (total === null && items.length) total = exp; // nothing in the summary was readable

  // Items that are really the total, payment or a header number never stay in the list.
  let finalItems = items.filter((it) => it.amount > 0 && (total === null || it.amount <= total + discount));
  if (total !== null && finalItems.length > 1) finalItems = finalItems.filter((it) => !(it.amount === total && finalItems.length > 1 && sumItems() - it.amount === total));

  const fsum = finalItems.reduce((s, it) => s + it.amount, 0);
  const sources = total === null ? 0 : src.filter(([v]) => v === total).length + (src.some(([v]) => v !== total && oneDigitOff(v, total!)) ? 1 : 0);
  const itemsMatch = total !== null && finalItems.length > 0 && (fsum - discount + fees === total || (subs.length > 0 && fsum === subs[0]));
  // retail totals are whole hundreds; an odd one without tax/service is likely a misread
  const plausible = total !== null && (total % 100 === 0 || fees > 0)
    // tax/service lines whose amounts were not read: the subtotal is not what was paid
    && !(after.some((l) => l.kind === 'fee' && !l.amount && !/dpp|harga\s*jual/i.test(l.text)) && fees === 0 && subs.includes(total));
  const confidence: Confidence = itemsMatch && sources >= 1 && plausible ? 'high' : total !== null && (sources >= 2 || (sources >= 1 && finalItems.length > 0)) ? 'medium' : 'low';
  return finish({ items: finalItems, total, subtotal: subs[0] ?? null, confidence }, L, rawLines, all, today);
}

function finish(core: { items: ReceiptItem[]; total: number | null; subtotal: number | null; confidence: Confidence }, L: Line[], lines: string[], all: string, today: string): ReceiptResult {
  // Date: prefer one printed next to a time (receipt header "26.10.26-13:12"), within the last ~13 months.
  const year = Number(today.slice(0, 4)), oldest = addDays(today, -400);
  let date: string | null = null, dateScore = -1;
  lines.forEach((l) => {
    for (const y of [year, year - 1]) {
      const d = findDate(l, y); if (!d || d.date > today || d.date < oldest) continue;
      const score = (/\d{1,2}:\d{2}/.test(l) ? 3 : 0) + (/^\d{1,2}[./-]\d{1,2}[./-]\d{2,4}$/.test(d.raw) ? 1 : 0);
      if (score > dateScore) { dateScore = score; date = d.date; }
      break;
    }
  });
  let merchant = '', storeCat: ReceiptResult['storeCat'] = null;
  const store = STORES.find(([re]) => re.test(all));
  if (store) { merchant = store[1]; storeCat = { cat: store[2], sub: store[3] }; }
  else {
    for (const l of L.slice(0, 5)) {
      const clean = dropNoise(l.text), letters = (clean.match(/[a-z]/gi) || []).length;
      if (letters >= 3 && letters / clean.length > 0.6 && l.kind !== 'junk' && l.amount === null) { merchant = titleCase(clean.replace(/[^\w &'.-]/g, '').trim()); break; }
    }
  }
  const pay = PAY.find(([re]) => re.test(all))?.[1] ?? null;
  const items = core.items.map((it) => ({ name: it.name, amount: it.amount, ...(it.qty && it.qty > 1 ? { qty: it.qty } : {}) }));
  return { merchant, storeCat, total: core.total, subtotal: core.subtotal, date, items, pay, confidence: core.confidence, lines };
}
