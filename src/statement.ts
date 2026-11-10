// Read bank statements (CSV / Excel rows or PDF text lines) into transactions, then guess categories.
import { amountsIn, cellDate, findDate, parseAmount } from './money-text.ts';
import { KW, KW_IN } from './model.ts';
import { walletSource, type WalletAlias } from './parser.ts';

export interface StmtRow { date: string; desc: string; amount: number; type: 'in' | 'out'; balance: number | null }

/* ---------------- CSV ---------------- */
export function parseCSV(text: string): string[][] {
  const first = text.split(/\r?\n/).slice(0, 5).join('\n');
  const delim = [',', ';', '\t', '|'].map((d) => ({ d, n: first.split(d).length })).sort((a, b) => b.n - a.n)[0].d;
  const rows: string[][] = []; let row: string[] = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; continue; }
    if (c === '"') q = true;
    else if (c === delim) { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.map((r) => r.map((c) => c.trim())).filter((r) => r.some(Boolean));
}

/* ---------------- tables (CSV / Excel) ---------------- */
const H = {
  date: /^(tgl|tanggal|date|tanggal transaksi|tgl transaksi|tgl\.? trans|posting date|transaction date|post date|tanggal posting)/,
  desc: /(keterangan|deskripsi|uraian|description|remark|berita|detail|transaksi|narasi|catatan)/,
  debit: /^(debit|debet|db|mutasi debet|mutasi debit|penarikan|withdrawal|keluar|uang keluar)$/,
  credit: /^(kredit|credit|cr|mutasi kredit|setoran|deposit|masuk|uang masuk)$/,
  amount: /^(mutasi|jumlah|nominal|amount|nilai|jumlah transaksi)$/,
  dc: /^(d\/k|db\/cr|cr\/db|d\/c|dk|tipe|jenis|type|dc)$/,
  balance: /^(saldo|balance|saldo akhir|running balance)$/,
};
const toNum = (v: unknown): number | null => {
  if (typeof v === 'number') return v;
  if (v == null) return null;
  const s = String(v).replace(/\b(cr|db|dr|d|k)\b/gi, '').trim();
  return s ? parseAmount(s) : null;
};
const sideOf = (v: unknown): 'in' | 'out' | null => {
  const s = String(v ?? '').toLowerCase();
  if (/\b(cr|k|kredit|credit|c)\b/.test(s)) return 'in';
  if (/\b(db|dr|d|debet|debit)\b/.test(s)) return 'out';
  return null;
};
export const IN_WORDS = /\b(trsf masuk|transfer masuk|setoran|setor|bunga|gaji|cr\b|kredit|refund|cashback|incoming|terima)\b/i;

export function rowsToStatement(rows: unknown[][], year: number): StmtRow[] {
  const norm = rows.map((r) => r.map((c) => (c instanceof Date ? c : c == null ? '' : typeof c === 'number' ? c : String(c).trim())));
  let hi = -1, map: Record<string, number> = {};
  for (let i = 0; i < Math.min(norm.length, 25); i++) {
    const m: Record<string, number> = {};
    norm[i].forEach((c, j) => { const s = String(c).toLowerCase().replace(/\s+/g, ' ').trim(); for (const [k, re] of Object.entries(H)) if (m[k] === undefined && re.test(s)) m[k] = j; });
    if (m.date !== undefined && (m.debit !== undefined || m.credit !== undefined || m.amount !== undefined)) { hi = i; map = m; break; }
  }
  const out: StmtRow[] = [];
  const data = hi >= 0 ? norm.slice(hi + 1) : norm;
  let prevBal: number | null = null;
  for (const r of data) {
    let date: string | null = null, desc = '', amount: number | null = null, type: 'in' | 'out' | null = null, bal: number | null = null;
    if (hi >= 0) {
      date = cellDate(r[map.date], year);
      desc = map.desc !== undefined ? String(r[map.desc] ?? '') : '';
      if (!desc) desc = r.filter((c, j) => typeof c === 'string' && j !== map.date && !/^[\d.,\s-]+$/.test(c)).sort((a, b) => String(b).length - String(a).length)[0] as string || '';
      if (map.balance !== undefined) bal = toNum(r[map.balance]);
      if (map.debit !== undefined || map.credit !== undefined) {
        const d = map.debit !== undefined ? toNum(r[map.debit]) : null, c = map.credit !== undefined ? toNum(r[map.credit]) : null;
        if (c && c > 0) { amount = c; type = 'in'; } else if (d && Math.abs(d) > 0) { amount = Math.abs(d); type = 'out'; }
      } else if (map.amount !== undefined) {
        const raw = r[map.amount], v = toNum(raw);
        if (v !== null) { amount = Math.abs(v); type = (map.dc !== undefined ? sideOf(r[map.dc]) : null) || sideOf(raw) || (v < 0 ? 'out' : null); }
      }
    } else {
      // No header row: date = first date-like cell, amounts = numeric cells.
      const di = r.findIndex((c) => cellDate(c, year)); if (di < 0) continue;
      date = cellDate(r[di], year);
      const nums = r.map((c, j) => ({ j, v: j === di ? null : toNum(c) })).filter((x) => x.v !== null && Math.abs(x.v as number) >= 100);
      if (!nums.length) continue;
      amount = Math.abs(nums[0].v as number); if (nums.length > 1) bal = nums[nums.length - 1].v;
      type = r.map(sideOf).find(Boolean) || ((nums[0].v as number) < 0 ? 'out' : null);
      desc = String(r.filter((c, j) => j !== di && typeof c === 'string' && !/^[\d.,\s-]+$/.test(c)).sort((a, b) => String(b).length - String(a).length)[0] || '');
    }
    if (!date || !amount) { if (bal !== null) prevBal = bal; continue; }
    if (!type && bal !== null && prevBal !== null) type = bal >= prevBal ? 'in' : 'out';
    if (!type) type = IN_WORDS.test(desc) ? 'in' : 'out';
    if (bal !== null) prevBal = bal;
    if (/saldo awal|opening balance|saldo akhir|closing balance/i.test(desc)) continue;
    out.push({ date, desc: desc.replace(/\s+/g, ' ').trim(), amount: Math.round(amount), type, balance: bal });
  }
  return out;
}

/* ---------------- PDF text lines ---------------- */
const JUNK = /\b(halaman|page \d|saldo awal|opening balance|saldo akhir|closing balance|total mutasi|total debet|total kredit|periode|period|no\.? rekening|account no|mata uang|currency|nama|alamat|tanggal cetak|printed|keterangan|description)\b/i;
/** Bank legal footers and contact lines printed on every page. */
const FOOTER = /\b(berizin|diawasi|otoritas jasa keuangan|lembaga penjamin|penjaminan|bank indonesia|tbk\b|call center|hubungi|www\.|\.com\b|tel \d|halo \w+ \d)/i;
const AMOUNT_ONLY =/^(?:[-+]\s?)?(?:rp\.?\s?)?[-+]?\d[\d.,]*(?:\s?(?:cr|db|dr|d|k))?$/i;
const isDateOnly = (line: string, year: number) => { const d = findDate(line, year); return !!d && line.replace(d.raw, '').replace(/[,\s]|^(senin|selasa|rabu|kamis|jumat|sabtu|minggu)/gi, '').length === 0; };
/** Which side a transaction is on, from its own words (for statements without a balance column). */
export function sideFromWords(text: string): 'in' | 'out' | null {
  const t = ' ' + text.toLowerCase() + ' ';
  const cr = /\b(credit|kredit|cr|masuk|incoming)\b/.test(t), db = /\b(debet|debit|db|dr|keluar|outgoing)\b/.test(t);
  if (cr && !db) return 'in';
  if (db && !cr) return 'out';
  if (/\b(pb|trf|trsf|transfer|bifast)\s+dari\b|\bdari\b/.test(t)) return 'in';
  if (/\b(pb|trf|trsf|transfer|bifast)\s+ke\b|\bke\b/.test(t)) return 'out';
  return null;
}

/**
 * "Card" layout used by app-generated statements (e.g. PermataMobile X): a date header line, then per transaction
 * one or more description lines with the amount on its own line in between. Each description line belongs to the
 * nearest amount line.
 */
function groupedLinesToStatement(lines: string[], year: number): StmtRow[] {
  const out: StmtRow[] = [];
  let date: string | null = null, group: string[] = [];
  const flush = () => {
    if (!date || !group.length) { group = []; return; }
    const day: string = date;
    const amountIdx = group.map((l, i) => (AMOUNT_ONLY.test(l) ? i : -1)).filter((i) => i >= 0);
    const descs: string[][] = amountIdx.map(() => []);
    group.forEach((l, i) => {
      if (AMOUNT_ONLY.test(l) || !amountIdx.length) return;
      let best = 0;
      amountIdx.forEach((a, k) => { if (Math.abs(a - i) < Math.abs(amountIdx[best] - i)) best = k; });
      descs[best].push(l);
    });
    amountIdx.forEach((a, k) => {
      const raw = group[a], v = parseAmount(raw.replace(/\s?(cr|db|dr|d|k)$/i, ''));
      if (!v) return;
      const desc = descs[k].join(' ').replace(/\b\d{1,2}:\d{2}(:\d{2})?\b/g, ' ').replace(/\s+/g, ' ').trim();
      const side = /^-|\s?(db|dr|d)$/i.test(raw) ? 'out' : /^\+|\s?(cr|k)$/i.test(raw) ? 'in' : sideFromWords(desc);
      out.push({ date: day, desc, amount: Math.abs(v), type: side || (IN_WORDS.test(desc) ? 'in' : 'out'), balance: null });
    });
    group = [];
  };
  for (const raw of lines) {
    const line = raw.replace(/\s+/g, ' ').trim(); if (!line) continue;
    if (isDateOnly(line, year)) { flush(); date = findDate(line, year)!.date; continue; }
    if (JUNK.test(line) || FOOTER.test(line) || /^(rdn|mutasi transaksi|[a-z]+ \d{4})$/i.test(line) || /^[\d-]{10,}$/.test(line)) continue;
    if (date) group.push(line);
  }
  flush();
  return out;
}

export function linesToStatement(lines: string[], year: number): StmtRow[] {
  const dateOnly = lines.filter((l) => isDateOnly(l.trim(), year)).length, amountOnly = lines.filter((l) => AMOUNT_ONLY.test(l.trim())).length;
  if (dateOnly && amountOnly) { const g = groupedLinesToStatement(lines, year); if (g.length) return g; }
  const out: (StmtRow & { _bal: number | null })[] = [];
  let prevBal: number | null = null, cur: (StmtRow & { _bal: number | null; _side: 'in' | 'out' | null }) | null = null;
  const close = () => {
    if (!cur) return;
    if (cur.amount > 0 && !/saldo awal|opening balance|saldo akhir|closing balance/i.test(cur.desc)) {
      let type = cur._side;
      if (!type && cur._bal !== null && prevBal !== null) type = cur._bal >= prevBal ? 'in' : 'out';
      if (!type) type = IN_WORDS.test(cur.desc) ? 'in' : 'out';
      out.push({ ...cur, type, balance: cur._bal });
    }
    if (cur._bal !== null) prevBal = cur._bal;
    cur = null;
  };
  for (const raw of lines) {
    const line = raw.replace(/\s+/g, ' ').trim(); if (!line) continue;
    const d = findDate(line, year);
    if (d && d.index <= 4) {
      close();
      let rest = (line.slice(0, d.index) + ' ' + line.slice(d.index + d.raw.length)).trim();
      const d2 = findDate(rest, year); if (d2 && d2.index <= 2) rest = rest.slice(d2.index + d2.raw.length).trim(); // value date column
      const am = amountsIn(rest).filter((a) => /[.,]\d{3}/.test(a.raw) || /[.,]\d{2}$/.test(a.raw));
      const side = /\b(cr|k|kredit|credit)\b\s*$|\b(cr|kr)\b/i.test(rest) ? 'in' : /\b(db|dr|d|debet|debit)\b\s*$|\b(db|dr)\b/i.test(rest) ? 'out' : null;
      const desc = (am.length ? rest.slice(0, am[0].index) : rest).replace(/\b(cr|db|dr)\b/gi, '').trim();
      cur = { date: d.date, desc, amount: am.length ? Math.abs(am[0].value) : 0, type: 'out', balance: null, _bal: am.length >= 2 ? am[am.length - 1].value : null, _side: side };
      if (/saldo awal|opening balance/i.test(desc) && am.length) { prevBal = am[am.length - 1].value; cur = null; }
    } else if (cur) {
      if (JUNK.test(line)) continue;
      const am = amountsIn(line).filter((a) => /[.,]\d{3}/.test(a.raw));
      if (!cur.amount && am.length) { cur.amount = Math.abs(am[0].value); if (am.length >= 2) cur._bal = am[am.length - 1].value; cur.desc = (cur.desc + ' ' + line.slice(0, am[0].index)).trim(); }
      else if (cur.desc.length < 90) cur.desc = (cur.desc + ' ' + line).trim();
    }
  }
  close();
  return out.map(({ _bal, _side, ...r }: any) => r);
}

/* ---------------- categorising ---------------- */
export interface Guess { type: 'in' | 'out' | 'tf'; cat: string | null; sub: string | null; to: string | null; note: string }
export interface GuessCtx { source: string; wallets: (WalletAlias & { group: string })[]; learned: Record<string, { cat: string; sub: string }> }

/** Bank system codes that carry no meaning for the reader. */
const NOISE = /\b(dcms|aaa|ips|peb|trx|ref|refno|seq|id|no|txn|bifast\d*)\b/gi;
export function prettyDesc(desc: string): string {
  let s = desc.replace(/\b\d{6,}\b/g, ' ').replace(/\b\d{1,2}:\d{2}(:\d{2})?\b/g, ' ').replace(/[*#|]+/g, ' ').replace(NOISE, ' ').replace(/\s+/g, ' ').trim();
  const seen = new Set<string>();
  s = s.split(' ').filter((w) => { const k = w.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; }).join(' ');
  if (s === s.toUpperCase()) s = s.toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase());
  return s.length > 42 ? s.slice(0, 40).trim() + '…' : s || 'Transaksi bank';
}
export function guessRow(row: StmtRow, ctx: GuessCtx): Guess {
  const t = ' ' + row.desc.toLowerCase().replace(/\s+/g, ' ') + ' ', note = prettyDesc(row.desc);
  const cash = ctx.wallets.find((w) => w.group === 'Tunai');
  if (row.type === 'out' && cash && /tarik tunai|penarikan tunai|tarikan atm|cash withdrawal|\batm\b.*tarik|tarik.*\batm\b/.test(t)) return { type: 'tf', cat: null, sub: null, to: cash.id, note: 'Tarik tunai' };
  if (row.type === 'out') {
    for (const w of ctx.wallets) {
      if (w.id === ctx.source || w.group === 'Tunai') continue;
      if (new RegExp(walletSource(w)).test(t)) return { type: 'tf', cat: null, sub: null, to: w.id, note: (w.group === 'E-wallet' ? 'Isi saldo ' : 'Transfer ke ') + w.aliases[0].replace(/\b[a-z]/g, (c) => c.toUpperCase()) };
    }
  }
  for (const w of t.match(/[a-z]+/g) || []) if (ctx.learned[w]) { const l = ctx.learned[w]; const inc = ['gaji', 'bonus', 'masuk_lain'].includes(l.cat); if (inc === (row.type === 'in')) return { type: row.type, cat: l.cat, sub: l.sub, to: null, note }; }
  if (row.type === 'in') {
    for (const [re, c, s] of KW_IN) if (re.test(t)) return { type: 'in', cat: c, sub: s, to: null, note };
    return { type: 'in', cat: 'masuk_lain', sub: 'Lainnya', to: null, note };
  }
  if (/\b(biaya adm|biaya administrasi|adm(in)? bulanan|admin|pajak|materai|bea|biaya kartu|iuran kartu|provisi)\b/.test(t)) return { type: 'out', cat: 'lain', sub: 'Biaya bank', to: null, note };
  for (const [re, c, s] of KW) if (re.test(t)) return { type: 'out', cat: c, sub: s, to: null, note };
  return { type: 'out', cat: 'lain', sub: 'Lainnya', to: null, note };
}
