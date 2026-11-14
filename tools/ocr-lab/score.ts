// Compares what the reader produced with the ground truth of a synthetic receipt.
import type { Truth } from './gen.ts';

export interface Pred { total: number | null; items: { name: string; amount: number }[] }
export interface Score {
  totalOk: boolean; itemsTrue: number; itemsFound: number; itemsRight: number; pricesRight: number; junk: number;
  perfect: boolean; missing: string[]; extra: string[];
}

const norm = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, '');
function lev(a: string, b: string): number {
  const m = a.length, n = b.length; if (!m) return n; if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[n];
}
export const nameSim = (a: string, b: string) => { const x = norm(a), y = norm(b); return x || y ? 1 - lev(x, y) / Math.max(x.length, y.length) : 1; };

export function score(t: Truth, p: Pred): Score {
  const used = new Set<number>();
  let itemsRight = 0, pricesRight = 0;
  const missing: string[] = [];
  for (const ti of t.items) {
    // best unused prediction: same price first, then most similar name
    let best = -1, bestSim = -1;
    p.items.forEach((pi, j) => { if (used.has(j) || pi.amount !== ti.price) return; const s = nameSim(ti.name, pi.name); if (s > bestSim) { bestSim = s; best = j; } });
    if (best >= 0) { used.add(best); pricesRight++; if (bestSim >= 0.6) itemsRight++; else missing.push(`${ti.name} (nama: ${p.items[best].name})`); }
    else missing.push(`${ti.name} ${ti.price}`);
  }
  const extra = p.items.filter((_, j) => !used.has(j)).map((x) => `${x.name} ${x.amount}`);
  const totalOk = p.total === t.total;
  return { totalOk, itemsTrue: t.items.length, itemsFound: p.items.length, itemsRight, pricesRight, junk: extra.length, perfect: totalOk && itemsRight === t.items.length && extra.length === 0, missing, extra };
}
