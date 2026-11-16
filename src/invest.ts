// Investments: pure maths, no storage or UI.
//
// Buying moves money from a wallet into a pseudo wallet "inv:<assetId>" (a transfer), so it is not an expense;
// selling moves the proceeds back. Holdings that existed before the app come from the pseudo wallet "inv-open",
// which touches no real wallet. Dividends, coupons and interest are ordinary income transactions tagged with
// the asset. Cost uses the average method, the usual one for Indonesian retail investors.
import type { Tx } from './model.ts';

export type AssetType = 'saham' | 'reksadana' | 'obligasi' | 'emas' | 'deposito' | 'kripto';
export interface Asset {
  id: string;
  type: AssetType;
  name: string;
  /** Ticker for shares ("BBCA"), used for automatic prices. */
  code: string;
  /** Latest known price per unit (per share, per unit, per gram, per coin; per rupiah of principal = 1 for deposito/obligasi). */
  price: number;
  /** When the price was last updated, ISO date-time, '' if never. */
  priceAt: string;
  createdAt: number;
}

export interface TypeInfo { n: string; unit: string; c: string; i: string; hint: string; lot?: number; decimals: number }
export const ASSET_TYPES: Record<AssetType, TypeInfo> = {
  saham: { n: 'Saham', unit: 'lot', c: '#2F7CF6', i: 'chart-candlestick', hint: 'Kode emiten, mis. BBCA', lot: 100, decimals: 0 },
  reksadana: { n: 'Reksadana', unit: 'unit', c: '#8B5CF6', i: 'layers', hint: 'Nama produk reksadana', decimals: 4 },
  obligasi: { n: 'Obligasi / SBN', unit: 'unit', c: '#0EA5A4', i: 'landmark', hint: 'Mis. ORI025, SBR013', decimals: 0 },
  emas: { n: 'Emas', unit: 'gram', c: '#E0A100', i: 'gem', hint: 'Mis. Emas Antam, Tabungan Emas', decimals: 4 },
  deposito: { n: 'Deposito', unit: 'unit', c: '#16A34A', i: 'piggy-bank', hint: 'Mis. Deposito BSB 6 bulan', decimals: 0 },
  kripto: { n: 'Kripto', unit: 'koin', c: '#F25A24', i: 'coins', hint: 'Mis. Bitcoin, Ethereum', decimals: 8 },
};
export const ALL_TYPES = Object.keys(ASSET_TYPES) as AssetType[];

export const invWallet = (id: string) => 'inv:' + id;
export const INV_OPEN = 'inv-open';
export const isInvWallet = (w: string | null | undefined) => !!w && (w.startsWith('inv:') || w === INV_OPEN);

export interface Position {
  units: number;        // held now (shares, units, grams, coins)
  cost: number;         // what the held units cost (average method), incl. buy fees
  avg: number;          // cost per unit
  value: number;        // units × latest price
  gain: number;         // value − cost (unrealised)
  gainPct: number | null;
  realized: number;     // profit/loss of what was sold (proceeds − average cost)
  income: number;       // dividends, coupons, interest received
  invested: number;     // money put in over time (all buys)
}

const byTime = (a: Tx, b: Tx) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.createdAt - b.createdAt);

/** Position of one asset from its transactions (buys, sells, income), oldest first. */
export function position(a: Asset, txs: Tx[]): Position {
  let units = 0, cost = 0, realized = 0, income = 0, invested = 0;
  for (const t of txs.filter((x) => x.inv === a.id).sort(byTime)) {
    const u = t.units ?? 0;
    if (t.type === 'tf' && t.to === invWallet(a.id)) { units += u; cost += t.amount; invested += t.amount; }
    else if (t.type === 'tf' && t.wallet === invWallet(a.id)) {
      const part = units > 0 ? Math.min(1, u / units) : 1, out = cost * part;
      realized += t.amount - out; cost -= out; units = Math.max(0, units - u);
    } else if (t.type === 'in') income += t.amount;
  }
  if (units < 1e-9) { units = 0; cost = 0; }
  const value = units * a.price, gain = value - cost;
  return { units, cost, avg: units ? cost / units : 0, value, gain, gainPct: cost > 0 ? gain / cost : null, realized, income, invested };
}

export interface Portfolio { value: number; cost: number; gain: number; gainPct: number | null; realized: number; income: number }
export function portfolio(assets: Asset[], txs: Tx[]): Portfolio {
  const p = assets.map((a) => position(a, txs));
  const value = p.reduce((s, x) => s + x.value, 0), cost = p.reduce((s, x) => s + x.cost, 0);
  return { value, cost, gain: value - cost, gainPct: cost > 0 ? (value - cost) / cost : null, realized: p.reduce((s, x) => s + x.realized, 0), income: p.reduce((s, x) => s + x.income, 0) };
}

type NewTx = Omit<Tx, 'id' | 'createdAt' | 'updatedAt'>;
/** Buy `units` at `price` (+ fee) from `wallet` ('' = already owned before the app: no wallet changes). */
export function buyTx(a: Asset, units: number, price: number, fee: number, wallet: string, date: string): NewTx {
  return { date, type: 'tf', cat: null, sub: null, amount: Math.round(units * price + fee), wallet: wallet || INV_OPEN, to: invWallet(a.id), note: `Beli ${a.name}`, book: 'pribadi', inv: a.id, units, unitPrice: price };
}
/** Sell `units` at `price` (− fee/tax); the proceeds go to `wallet`. */
export function sellTx(a: Asset, units: number, price: number, fee: number, wallet: string, date: string): NewTx {
  return { date, type: 'tf', cat: null, sub: null, amount: Math.max(0, Math.round(units * price - fee)), wallet: invWallet(a.id), to: wallet, note: `Jual ${a.name}`, book: 'pribadi', inv: a.id, units, unitPrice: price };
}
/** Dividend, coupon or interest received in `wallet`. */
export function incomeTx(a: Asset, amount: number, wallet: string, date: string): NewTx {
  const label = a.type === 'saham' ? 'Dividen' : a.type === 'obligasi' ? 'Kupon' : a.type === 'deposito' ? 'Bunga' : 'Hasil';
  return { date, type: 'in', cat: 'masuk_lain', sub: 'Dividen & kupon', amount, wallet, to: null, note: `${label} ${a.name}`, book: 'pribadi', inv: a.id };
}

/** "12 lot", "152,3456 unit", "2,5 gram". */
export function unitsLabel(a: Asset, units: number): string {
  const t = ASSET_TYPES[a.type], n = t.lot ? units / t.lot : units;
  return `${n.toLocaleString('id-ID', { maximumFractionDigits: t.lot ? 2 : t.decimals })} ${t.unit}`;
}

/** "1.523,45" → 1523.45, "152,3456" → 152.3456, "5.600" → 5600, "0.5" → 0.5, "5600" → 5600 (Indonesian number input). */
export function parseDec(v: string): number {
  let s = v.replace(/[^\d.,]/g, '');
  if (!s) return 0;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}
