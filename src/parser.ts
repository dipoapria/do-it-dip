// Natural-language transaction parser (Bahasa Indonesia) + live highlighting of recognised words.
import { addDays, pad, esc } from './format.ts';
import { CATS, KW, KW_IN, type TxType } from './model.ts';

export interface WalletAlias { id: string; aliases: string[] }
export interface ParseCtx {
  today: string;
  learned: Record<string, { cat: string; sub: string }>;
  wallets: WalletAlias[];
  defaults: { bank: string; cash: string };
}
export interface Parsed {
  raw: string; amount: number; assumed: boolean; type: TxType;
  cat: string | null; sub: string | null; wallet: string; to: string | null;
  date: string; note: string; learned: boolean;
}

const reEsc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
export function walletSource(w: WalletAlias): string {
  const alts = w.aliases.filter(Boolean).slice().sort((a, b) => b.length - a.length).map((a) => reEsc(a.toLowerCase()).replace(/\s+/g, ' ?'));
  return '\\b(' + alts.join('|') + ')\\b';
}

export const DATE_RE = /\b(\d{1,2} ?hari (yang )?lalu|kemarin|kemaren|kmrn|kmarin|(tgl|tanggal) ?\d{1,2}|hari ini|tadi( pagi| siang| sore| malam)?|barusan)\b/;
export const AMT_RE = /(?:rp\.? ?)?(\d+(?:[.,]\d+)*) ?(ribu|rbu|rb|k|juta|jt|jeti)?(?![a-z0-9])/;
const STOP = /\b(pakai|pake|pakek|via|lewat|dari|ke|dengan|dgn|bayar|byr|buat|untuk|utk|beli|masuk|sebesar|seharga|harga|di|rp|transfer|tf|topup|top up|isi saldo|isi|saldo|tarik|pindah|uang|duit)\b/g;
const TF_WORDS = /\b(transfer|tf|pindah|top ?up|topup|isi saldo|isi|tarik tunai|tarik|nabung|tabungan)\b/;
const TF_ONE = /\b(top ?up|topup|isi|tarik|nabung|tabungan)\b/;

function decNum(s: string): number {
  return /^\d+[.,]\d{1,2}$/.test(s) ? parseFloat(s.replace(',', '.')) : parseFloat(s.replace(/[.,]/g, ''));
}
const blank = (t: string, idx: number, len: number) => t.slice(0, idx) + ' '.repeat(len) + t.slice(idx + len);

export function parseLine(raw: string, ctx: ParseCtx): Parsed {
  const { today } = ctx;
  let t = ' ' + raw.toLowerCase().replace(/\s+/g, ' ').trim() + ' ';
  const r: Parsed = { raw, amount: 0, assumed: false, type: 'out', cat: null, sub: null, wallet: ctx.defaults.cash, to: null, date: today, note: '', learned: false };

  let m: RegExpMatchArray | null;
  if ((m = t.match(/\b(\d{1,2}) ?hari (yang )?lalu\b/))) { r.date = addDays(today, -Number(m[1])); t = t.replace(m[0], ' '); }
  else if ((m = t.match(/\b(kemarin|kemaren|kmrn|kmarin)\b/))) { r.date = addDays(today, -1); t = t.replace(m[0], ' '); }
  else if ((m = t.match(/\b(tgl|tanggal) ?(\d{1,2})\b/))) {
    const d = Math.max(1, Math.min(Number(m[2]), 31));
    r.date = today.slice(0, 8) + pad(d);
    if (r.date > today) r.date = today;
    t = t.replace(m[0], ' ');
  }
  t = t.replace(/\b(tadi|barusan|td|hari ini)( pagi| siang| sore| malam)?\b/g, ' ');

  const found: { k: string; idx: number; from: boolean; to: boolean }[] = [];
  for (const w of ctx.wallets) {
    const mm = t.match(new RegExp(walletSource(w)));
    if (mm && mm.index !== undefined) {
      const idx = mm.index, before = t.slice(Math.max(0, idx - 6), idx);
      found.push({ k: w.id, idx, from: /dari $/.test(before), to: /\bke $/.test(before) });
      t = blank(t, idx, mm[0].length);
    }
  }
  found.sort((a, b) => a.idx - b.idx);

  const re = new RegExp(AMT_RE.source, 'g');
  let best: { v: number; score: number; assumed: boolean; s: string; idx: number } | null = null;
  let mm2: RegExpExecArray | null;
  while ((mm2 = re.exec(t))) {
    const num = mm2[1], suf = mm2[2] || '';
    let v: number, assumed = false;
    if (/^(rb|ribu|rbu|k)$/.test(suf)) v = decNum(num) * 1e3;
    else if (suf) v = decNum(num) * 1e6;
    else {
      v = /[.,]\d{3}$/.test(num) || /^\d+$/.test(num) ? parseFloat(num.replace(/[.,]/g, '')) : decNum(num);
      if (v < 1000) { v *= 1000; assumed = true; }
    }
    const score = (suf ? 3 : 0) + (/rp/.test(mm2[0]) ? 2 : 0) + (!assumed ? 1 : 0);
    if (!best || score > best.score || (score === best.score && v > best.v)) best = { v, score, assumed, s: mm2[0], idx: mm2.index };
  }
  if (best) { r.amount = Math.round(best.v); r.assumed = best.assumed; t = blank(t, best.idx, best.s.length); }

  if (TF_WORDS.test(t) && (found.length >= 2 || (found.length === 1 && TF_ONE.test(t)))) {
    r.type = 'tf';
    let from = found.find((f) => f.from), to = found.find((f) => f.to);
    if (found.length >= 2) { from = from || found.find((f) => f !== to); to = to || found.find((f) => f !== from); }
    else { const f = found[0]; if (f.from) { from = f; to = undefined; } else { to = f; from = undefined; } }
    r.to = to ? to.k : ctx.defaults.cash;
    r.wallet = from ? from.k : ctx.defaults.bank;
    if (r.wallet === r.to) {
      const other = ctx.wallets.find((w) => w.id !== r.wallet);
      r.to = other ? other.id : r.to;
    }
    // The UI turns 'Transfer' into a friendly note with wallet names ("Isi saldo GoPay").
    r.note = /\btarik\b/.test(raw.toLowerCase()) ? 'Tarik tunai' : /\b(nabung|tabungan)\b/.test(raw.toLowerCase()) ? 'Tabungan' : 'Transfer';
    return r;
  }
  if (found.length) r.wallet = found[0].k;

  const words = t.match(/[a-z]+/g) || [];
  let hit: { cat: string; sub: string } | null = null;
  for (const w of words) { if (ctx.learned[w]) { hit = { ...ctx.learned[w] }; r.learned = true; break; } }
  if (!hit) for (const [rx, c, s] of KW_IN) if (rx.test(t)) { hit = { cat: c, sub: s }; break; }
  if (!hit && /\b(terima|dapat|dapet|diterima|pemasukan|jual|masuk)\b/.test(t)) hit = { cat: 'masuk_lain', sub: 'Lainnya' };
  if (!hit) for (const [rx, c, s] of KW) if (rx.test(t)) { hit = { cat: c, sub: s }; break; }
  if (!hit) hit = { cat: 'lain', sub: 'Lainnya' };
  r.cat = hit.cat; r.sub = hit.sub; r.type = CATS[r.cat]?.inc ? 'in' : 'out';
  if (!found.length) r.wallet = r.type === 'in' ? ctx.defaults.bank : ctx.defaults.cash;
  const note = t.replace(STOP, ' ').replace(/[^a-z0-9&\- ]/g, ' ').replace(/\s+/g, ' ').trim();
  r.note = note ? note.charAt(0).toUpperCase() + note.slice(1) : (r.sub || '');
  return r;
}

export function parseText(text: string, ctx: ParseCtx): Parsed[] {
  return text.split(/\n|;/).map((s) => s.trim()).filter(Boolean).map((line) => parseLine(line, ctx));
}

/** HTML for the layer behind the textarea: recognised words wrapped in <mark>. `prev` lets new marks flash once. */
export function highlightHTML(text: string, ctx: ParseCtx, prev: Set<string> | null): { html: string; seen: Set<string> } {
  const ranges: { s: number; e: number; cls: string; pri: number }[] = [];
  const add = (src: string, cls: string, pri: number) => {
    const re = new RegExp(src, 'gi');
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) {
      if (!m[0].length) { re.lastIndex++; continue; }
      let s = m.index, e = s + m[0].length;
      while (text[s] === ' ' && s < e) s++;
      while (text[e - 1] === ' ' && e > s) e--;
      if (e > s) ranges.push({ s, e, cls, pri });
    }
  };
  add(DATE_RE.source, 'h-date', 5);
  ctx.wallets.forEach((w) => add(walletSource(w), 'h-wal', 4));
  add(AMT_RE.source, 'h-amt', 3);
  KW_IN.concat(KW).forEach(([re]) => add(re.source, 'h-cat', 2));
  Object.keys(ctx.learned).forEach((w) => add('\\b' + reEsc(w) + '\\b', 'h-cat', 2));
  ranges.sort((a, b) => b.pri - a.pri || a.s - b.s);
  const taken: typeof ranges = [];
  for (const r of ranges) {
    if (r.cls === 'h-amt' && !/\d/.test(text.slice(r.s, r.e))) continue;
    if (!taken.some((x) => r.s < x.e && r.e > x.s)) taken.push(r);
  }
  taken.sort((a, b) => a.s - b.s);
  const seen = new Set<string>();
  let out = '', i = 0;
  for (const r of taken) {
    const word = text.slice(r.s, r.e), key = r.cls + ':' + word.toLowerCase();
    seen.add(key);
    out += esc(text.slice(i, r.s)) + `<mark class="${r.cls}${prev && !prev.has(key) ? ' nw' : ''}">${esc(word)}</mark>`;
    i = r.e;
  }
  return { html: out + esc(text.slice(i)) + '\n', seen };
}
