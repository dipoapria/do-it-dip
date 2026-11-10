// Turn the raw text that OCR read from a shopping receipt into: shop, total, date, item lines, payment hint.
import { addDays } from './format.ts';
import { amountsIn, findDate } from './money-text.ts';

export interface ReceiptItem { name: string; amount: number }
export interface ReceiptResult {
  merchant: string;
  /** Category suggested by a known store chain (e.g. Indomaret → Belanja), if any. */
  storeCat: { cat: string; sub: string } | null;
  total: number | null;
  date: string | null;
  items: ReceiptItem[];
  /** How it was paid, as printed: 'cash', 'card', or an e-wallet keyword such as 'gopay'. */
  pay: string | null;
  lines: string[];
}

// OCR often reads O as 0 in "TOTAL", so both are accepted.
const TOTAL = /\b(grand\s*t[o0]tal|t[o0]tal\s*(bayar|belanja|harga|pembayaran|tagihan|transaksi)|t[o0]tal|jumlah\s*bayar|jumlah|tagihan|amount\s*due|net\s*t[o0]tal)\b/i;
const NOT_TOTAL = /\b(sub\s*-?\s*t[o0]tal|t[o0]tal\s*(item|qty|disc|diskon|hemat|potongan|berat)|qty|kembali(an)?|change|tuna[i1lt!]|cash|debit|kredit|kartu|card|pp[nh]|pajak|tax|dpp|service|voucher|poin|point|harga\s*jual)\b/i;
/** Lines that are never purchased items: header, tax ids, footer, contact info. */
const NOT_ITEM = /\b(sub\s*-?\s*t[o0]tal|t[o0]tal|diskon|disc|hemat|potongan|voucher|jl|jln|jalan|telp|tel|hp|sms|wa|[ni]pwp|kec|kel|kota|kab|rt|rw|blok|ruko|www|http|kasir|cashier|struk|nota|receipt|layanan|konsumen|kontak|gratis|ongkir|belanja lebih|klik\w*|member|terima kasih|pt\b|tbk|gedung|menara|pp[nh]|dpp|harga\s*jual|tuna[i1lt!]|kembali|cash|change|debit|kartu)\b|@|\d{1,2}:\d{2}|\d+\/\d+\//i;
const PRIORITY = (l: string) => (/grand\s*t[o0]tal/i.test(l) ? 4 : /t[o0]tal\s*(bayar|belanja|pembayaran|tagihan|transaksi)|jumlah\s*bayar/i.test(l) ? 3 : /t[o0]tal/i.test(l) ? 2 : 1);

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
  [/\bgo-?pay\b/i, 'gopay'], [/\bovo\b/i, 'ovo'], [/\bdana\b/i, 'dana'], [/shopee\s*pay/i, 'shopeepay'], [/link\s*aja/i, 'linkaja'],
  [/\b(debit|kartu|card|edc|visa|master\s*card|flazz|bca|bri|bni|mandiri)\b/i, 'card'],
  [/\b(tuna[i1lt!]|cash)\b/i, 'cash'], // OCR often reads TUNAI as TUNAT / TUNA1
];

function titleCase(s: string): string {
  if (s !== s.toUpperCase()) return s;
  return s.toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase());
}
/** Receipts are printed in capitals; lowercase fragments on a mostly-uppercase line are OCR noise from the background. */
function dropNoise(line: string): string {
  const letters = line.replace(/[^A-Za-z]/g, ''), upper = line.replace(/[^A-Z]/g, '');
  const tokens = line.split(' ').filter((t) => /[\p{L}\p{N}]/u.test(t));
  if (letters.length < 4 || upper.length / letters.length < 0.7) return tokens.join(' ');
  return tokens.map((t) => t.replace(/[a-z]/g, '')).filter((t) => /[\p{L}\p{N}]/u.test(t)).join(' ');
}
/** "VIT AIR MINERAL 19 L 1 21500 21,500" → name "VIT AIR MINERAL 19 L", amount 21500 (the last number). */
function splitItem(line: string): ReceiptItem | null {
  const tokens = dropNoise(line).split(' ');
  let i = tokens.length;
  while (i > 0 && /^[x@]?[\d.,]+$/i.test(tokens[i - 1])) i--;
  if (i === tokens.length) return null;
  const nums = amountsIn(tokens.slice(i).join(' ')), name = tokens.slice(0, i).join(' ').replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N})]+$/gu, '');
  if (!nums.length || (name.match(/\p{L}/gu) || []).length < 3) return null;
  return { name, amount: nums[nums.length - 1].value };
}

export function parseReceipt(text: string, today: string): ReceiptResult {
  const lines = text.split(/\r?\n/).map((l) => l.replace(/\s+/g, ' ').trim()).filter((l) => l.length > 1);
  const all = lines.join('\n');

  // Total: the best "TOTAL" line; payment and change lines never count.
  let total: number | null = null, best = 0, totalIdx = -1;
  lines.forEach((l, i) => {
    if (!TOTAL.test(l) || NOT_TOTAL.test(l)) return;
    let am = amountsIn(l).filter((a) => a.value > 0);
    if (!am.length && lines[i + 1]) am = amountsIn(lines[i + 1]).filter((a) => a.value > 0);
    if (!am.length) return;
    const p = PRIORITY(l);
    if (p >= best) { best = p; total = am[am.length - 1].value; totalIdx = i; }
  });

  // Items: lines before the total that end in a price, minus header/tax/footer lines.
  const end = totalIdx >= 0 ? totalIdx : lines.findIndex((l) => NOT_TOTAL.test(l) && amountsIn(l).length);
  let items: ReceiptItem[] = [];
  lines.slice(0, end >= 0 ? end : lines.length).forEach((l) => {
    if (NOT_ITEM.test(l) || TOTAL.test(l) || findDate(l, 2000)) return;
    const it = splitItem(l);
    if (it && it.amount >= 100) items.push(it);
  });
  if (total) items = items.filter((it) => it.amount <= total!);

  if (total === null) {
    // No readable TOTAL line: the item sum, else the largest amount that is not a payment/change/tax line.
    const sum = items.reduce((s, it) => s + it.amount, 0);
    if (sum) total = sum;
    else {
      let max = 0;
      lines.forEach((l) => { if (NOT_TOTAL.test(l) || NOT_ITEM.test(l) || findDate(l, 2000)) return; for (const a of amountsIn(l)) if (a.value > max && a.value < 100_000_000) max = a.value; });
      total = max || null;
    }
  }

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
    for (const l of lines.slice(0, 6)) {
      const clean = dropNoise(l), letters = (clean.match(/[a-z]/gi) || []).length;
      if (letters >= 3 && letters / clean.length > 0.6 && !NOT_ITEM.test(clean)) { merchant = titleCase(clean.replace(/[^\w &'.-]/g, '').trim()); break; }
    }
  }

  const pay = PAY.find(([re]) => re.test(all))?.[1] ?? null;
  return { merchant, storeCat, total, date, items, pay, lines };
}
