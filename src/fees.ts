// Admin fees: what transfers (and other bank charges) cost in a period, and which route costs the most.
import type { Tx } from './model.ts';

export interface FeeRoute { from: string; to: string; total: number; n: number }
export interface FeeSummary { total: number; n: number; fromTransfers: number; routes: FeeRoute[] }

/** Fees ("Biaya & admin" expenses) whose date starts with `key` (a month "2026-11" or a year "2026"). */
export function feeSummary(txs: Tx[], key: string): FeeSummary {
  const byId = new Map(txs.map((t) => [t.id, t]));
  const fees = txs.filter((t) => t.type === 'out' && t.cat === 'biaya' && t.date.startsWith(key));
  const routes = new Map<string, FeeRoute>();
  let fromTransfers = 0;
  for (const f of fees) {
    const tf = f.feeOf ? byId.get(f.feeOf) : undefined;
    if (!tf || !tf.to) continue;
    fromTransfers++;
    const k = tf.wallet + '>' + tf.to, r = routes.get(k) || { from: tf.wallet, to: tf.to, total: 0, n: 0 };
    r.total += f.amount; r.n++; routes.set(k, r);
  }
  return {
    total: fees.reduce((s, t) => s + t.amount, 0), n: fees.length, fromTransfers,
    routes: [...routes.values()].sort((a, b) => b.total - a.total || b.n - a.n),
  };
}

/** A list without the fee rows whose transfer is in the same list (the transfer row shows the fee). */
export function foldFees<T extends { id: string; feeOf?: string }>(list: T[]): T[] {
  const ids = new Set(list.map((t) => t.id));
  return list.filter((t) => !(t.feeOf && ids.has(t.feeOf)));
}
