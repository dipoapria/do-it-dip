// Excel (.xlsx) export: three sheets (summary, transactions, per category) for a chosen period.
// The sheet data is built by pure functions (tested in Node); the file is written lazily by write-excel-file.
import { CATS, type Tx, type Wallet } from './model.ts';

export interface Period { from: string; to: string; label: string }
type CellObj = { value?: string | number | Date | null; type?: unknown; format?: string; fontWeight?: 'bold'; textColor?: string; backgroundColor?: string; columnSpan?: number; fontSize?: number };
type Cell = CellObj | null;
export interface SheetSpec { sheet: string; data: Cell[][]; columns: { width: number }[]; stickyRowsCount?: number }

const MONEY = '#,##0';
const DATE = 'dd/mm/yyyy';
const BRAND = '#0B7C8A';
const BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];

const head = (v: string): CellObj => ({ value: v, fontWeight: 'bold', textColor: '#FFFFFF', backgroundColor: BRAND });
const txt = (v: string, bold = false): CellObj => (bold ? { value: v, type: String, fontWeight: 'bold' } : { value: v, type: String });
const num = (v: number, bold = false): CellObj => (bold ? { value: Math.round(v), type: Number, format: MONEY, fontWeight: 'bold' } : { value: Math.round(v), type: Number, format: MONEY });
const date = (s: string): CellObj => { const [y, m, d] = s.split('-').map(Number); return { value: new Date(Date.UTC(y, m - 1, d)), type: Date, format: DATE }; };
const pctCell = (v: number): CellObj => ({ value: Math.round(v * 1000) / 1000, type: Number, format: '0.0%' });
const monthLabel = (mk: string) => `${BULAN[Number(mk.slice(5)) - 1]} ${mk.slice(0, 4)}`;

export const inPeriod = (txs: Tx[], p: Period) => txs.filter((t) => t.date >= p.from && t.date <= p.to);

export function buildSheets(allTxs: Tx[], wallets: Wallet[], p: Period, balanceOf: (w: Wallet) => number, name = ''): SheetSpec[] {
  const txs = inPeriod(allTxs, p).slice().sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.createdAt - b.createdAt));
  const wname = (id: string | null) => (id ? wallets.find((w) => w.id === id)?.name ?? 'Dompet terhapus' : '');
  const catName = (t: Tx) => (t.type === 'tf' ? 'Transfer' : CATS[t.cat ?? '']?.n ?? 'Lainnya');
  const inc = txs.filter((t) => t.type === 'in').reduce((s, t) => s + t.amount, 0);
  const out = txs.filter((t) => t.type === 'out').reduce((s, t) => s + t.amount, 0);

  /* ---- Ringkasan ---- */
  const sum: Cell[][] = [
    [{ value: 'Rekap keuangan Do it Dip', fontWeight: 'bold', fontSize: 16, textColor: BRAND, columnSpan: 4 }, null, null, null],
    [txt(`${name ? name + ' · ' : ''}${p.label}`), null, null, null],
    [],
    [head('Ringkasan'), head('Nominal'), null, null],
    [txt('Pemasukan'), num(inc), null, null],
    [txt('Pengeluaran'), num(out), null, null],
    [txt('Selisih', true), num(inc - out, true), null, null],
    [txt('Sisa dari pemasukan'), inc ? pctCell(Math.max(0, inc - out) / inc) : txt('–'), null, null],
    [txt('Jumlah transaksi'), { value: txs.length, type: Number }, null, null],
  ];
  const months = [...new Set(txs.map((t) => t.date.slice(0, 7)))].sort();
  if (months.length > 1) {
    sum.push([], [head('Bulan'), head('Pemasukan'), head('Pengeluaran'), head('Selisih')]);
    for (const mk of months) {
      const mt = txs.filter((t) => t.date.startsWith(mk));
      const i = mt.filter((t) => t.type === 'in').reduce((s, t) => s + t.amount, 0), o = mt.filter((t) => t.type === 'out').reduce((s, t) => s + t.amount, 0);
      sum.push([txt(monthLabel(mk)), num(i), num(o), num(i - o)]);
    }
  }
  sum.push([], [head('Dompet'), head('Saldo saat ini'), null, null]);
  const ws = wallets.slice().sort((a, b) => a.order - b.order);
  for (const w of ws) sum.push([txt(w.name), num(balanceOf(w)), null, null]);
  sum.push([txt('Total', true), num(ws.reduce((s, w) => s + balanceOf(w), 0), true), null, null]);

  /* ---- Transaksi ---- */
  const tx: Cell[][] = [['Tanggal', 'Jenis', 'Kategori', 'Subkategori', 'Catatan', 'Dompet', 'Ke dompet', 'Masuk', 'Keluar', 'Transfer'].map(head)];
  for (const t of txs) {
    tx.push([
      date(t.date), txt(t.type === 'in' ? 'Pemasukan' : t.type === 'out' ? 'Pengeluaran' : 'Transfer'), txt(catName(t)), txt(t.sub ?? ''), txt(t.note),
      txt(wname(t.wallet)), txt(t.type === 'tf' ? wname(t.to) : ''),
      t.type === 'in' ? num(t.amount) : null, t.type === 'out' ? num(t.amount) : null, t.type === 'tf' ? num(t.amount) : null,
    ]);
  }
  if (txs.length) tx.push([txt('Total', true), null, null, null, null, null, null, num(inc, true), num(out, true), num(txs.filter((t) => t.type === 'tf').reduce((s, t) => s + t.amount, 0), true)]);

  /* ---- Per kategori ---- */
  const cat: Cell[][] = [['Jenis', 'Kategori', 'Subkategori', 'Transaksi', 'Total', 'Porsi'].map(head)];
  for (const type of ['out', 'in'] as const) {
    const list = txs.filter((t) => t.type === type), total = list.reduce((s, t) => s + t.amount, 0);
    const groups = new Map<string, { cat: string; sub: string; n: number; v: number }>();
    for (const t of list) {
      const k = `${t.cat}|${t.sub ?? ''}`, g = groups.get(k) ?? { cat: catName(t), sub: t.sub ?? '', n: 0, v: 0 };
      g.n++; g.v += t.amount; groups.set(k, g);
    }
    const rows = [...groups.values()].sort((a, b) => b.v - a.v);
    for (const g of rows) cat.push([txt(type === 'out' ? 'Pengeluaran' : 'Pemasukan'), txt(g.cat), txt(g.sub), { value: g.n, type: Number }, num(g.v), total ? pctCell(g.v / total) : null]);
    if (rows.length) cat.push([txt(type === 'out' ? 'Total pengeluaran' : 'Total pemasukan', true), null, null, { value: list.length, type: Number, fontWeight: 'bold' }, num(total, true), null], []);
  }

  return [
    { sheet: 'Ringkasan', data: sum, columns: [{ width: 26 }, { width: 18 }, { width: 18 }, { width: 18 }] },
    { sheet: 'Transaksi', data: tx, columns: [12, 13, 18, 18, 34, 18, 18, 14, 14, 14].map((width) => ({ width })), stickyRowsCount: 1 },
    { sheet: 'Per kategori', data: cat, columns: [16, 20, 20, 11, 16, 9].map((width) => ({ width })), stickyRowsCount: 1 },
  ];
}

export async function toXlsx(sheets: SheetSpec[]): Promise<Blob> {
  const { default: write } = await import('write-excel-file/universal');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return write(sheets as any, { fontFamily: 'Calibri', fontSize: 11 } as any).toBlob();
}
