// Turn the raw text that OCR read from a shopping receipt into: shop name, total, date and item lines.
import { amountsIn, findDate } from './money-text.ts';

export interface ReceiptResult {
  merchant: string;
  total: number | null;
  date: string | null;
  items: { name: string; amount: number }[];
  lines: string[];
}

// OCR often reads O as 0 in "TOTAL", so both are accepted.
const TOTAL = /\b(grand\s*t[o0]tal|t[o0]tal\s*(bayar|belanja|harga|pembayaran|tagihan|transaksi)|t[o0]tal|jumlah\s*bayar|jumlah|tagihan|amount\s*due|net\s*t[o0]tal)\b/i;
const NOT_TOTAL = /\b(sub\s*-?\s*t[o0]tal|t[o0]tal\s*(item|qty|disc|diskon|hemat|potongan|berat)|qty|kembali(an)?|change|tunai|cash|debit|kredit|kartu|card|ppn|pajak|tax|dpp|service|voucher|poin|point)\b/i;
const ADDRESS = /\b(jl|jln|jalan|telp|tel|hp|wa|npwp|kec|kel|kota|kab|rt|rw|blok|ruko|no\.?\s*\d|www|http|\.com|kasir|cashier|struk|nota|receipt)\b/i;
const PRIORITY = (l: string) => (/grand\s*t[o0]tal/i.test(l) ? 4 : /t[o0]tal\s*(bayar|belanja|pembayaran|tagihan|transaksi)|jumlah\s*bayar/i.test(l) ? 3 : /t[o0]tal/i.test(l) ? 2 : 1);

function titleCase(s: string): string {
  if (s !== s.toUpperCase()) return s;
  return s.toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase());
}

export function parseReceipt(text: string, today: string): ReceiptResult {
  const lines = text.split(/\r?\n/).map((l) => l.replace(/\s+/g, ' ').trim()).filter((l) => l.length > 1);

  let merchant = '';
  for (const l of lines.slice(0, 6)) {
    const letters = (l.match(/[a-z]/gi) || []).length;
    if (letters >= 3 && letters / l.length > 0.55 && !ADDRESS.test(l)) { merchant = titleCase(l.replace(/[^\w &'.-]/g, '').trim()); break; }
  }

  let total: number | null = null, best = 0, totalIdx = -1;
  lines.forEach((l, i) => {
    if (!TOTAL.test(l) || NOT_TOTAL.test(l)) return;
    let am = amountsIn(l).filter((a) => a.value > 0);
    if (!am.length && lines[i + 1]) am = amountsIn(lines[i + 1]).filter((a) => a.value > 0);
    if (!am.length) return;
    const p = PRIORITY(l);
    if (p >= best) { best = p; total = am[am.length - 1].value; totalIdx = i; }
  });
  if (total === null) {
    // No readable TOTAL line: take the largest amount that is not a payment/change line.
    let max = 0;
    lines.forEach((l) => { if (NOT_TOTAL.test(l) || findDate(l, 2000)) return; for (const a of amountsIn(l)) if (a.value > max && a.value < 100_000_000) max = a.value; });
    total = max || null;
  }

  const year = Number(today.slice(0, 4));
  let date = findDate(text, year)?.date ?? null;
  if (date && (date > today || date < `${year - 1}${today.slice(4)}`)) date = null;

  const items: { name: string; amount: number }[] = [];
  lines.forEach((l, i) => {
    if (totalIdx >= 0 && i >= totalIdx) return;
    if (TOTAL.test(l) || NOT_TOTAL.test(l) || ADDRESS.test(l)) return;
    const am = amountsIn(l);
    if (!am.length) return;
    const last = am[am.length - 1], name = l.slice(0, am[0].index).replace(/[^\p{L}\p{N} &/.,'-]/gu, '').trim();
    if ((name.match(/\p{L}/gu) || []).length >= 2 && last.value > 0) items.push({ name: titleCase(name), amount: last.value });
  });

  return { merchant, total, date, items, lines };
}
