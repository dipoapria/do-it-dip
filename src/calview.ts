// @ts-nocheck
// Month calendar markup shared by the phone Rekap (inline card and sheet) and the laptop recap.
import { cellAmt, dayTotals, monthGrid, ruleDays, topDay } from './calendar.ts';
import { BLN, BULAN, esc, rp, shortTxt } from './format.ts';

const WEEK = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'];

/** Month totals (from the same day totals the cells use). */
export function monthSums(txs, mk) {
  const t = dayTotals(txs, mk); let inc = 0, out = 0, fixed = 0;
  for (const x of Object.values(t)) { inc += x.inc; out += x.out; fixed += x.fixed; }
  return { inc, out, fixed, left: inc - out };
}

export function sumsHTML(s) {
  return `<div class="cal-sums"><div class="in"><small>Masuk</small><b class="m">${rp(s.inc)}</b></div><div class="out"><small>Keluar</small><b class="m">${rp(s.out)}</b>${s.fixed ? `<em class="m"><i data-lucide="lock"></i>tetap ${shortTxt(s.fixed)} · harian ${shortTxt(s.out - s.fixed)}</em>` : ''}</div><div><small>Sisa</small><b class="m">${rp(s.left)}</b></div></div>`;
}

/**
 * The grid. o: { mk, sel, today, txs, rules, act } — every day is a button with data-a=act and data-d=date.
 * Spending shades the day (darker = more), today is ringed, the biggest-spending day gets a flame,
 * days with a recurring schedule get a dot.
 */
export function gridHTML(o) {
  const tot = dayTotals(o.txs, o.mk), top = topDay(tot), rec = ruleDays(o.rules || [], o.mk);
  const max = top ? tot[top].out - tot[top].fixed - (tot[top].adj || 0) : 0; // shading follows day-to-day spending only
  const cells = monthGrid(o.mk).flat().map((d) => {
    if (!d) return '<span class="cal-d blank"></span>';
    const x = tot[d], flex = x ? x.out - x.fixed - (x.adj || 0) : 0, h = max ? flex / max : 0, r = rec[d];
    const cls = ['cal-d', d === o.today ? 'today' : '', d === o.sel ? 'sel' : '', d > o.today ? 'future' : '', d === top ? 'peak' : '', x ? 'has' : ''].filter(Boolean).join(' ');
    const title = `${Number(d.slice(8))} ${BULAN[Number(d.slice(5, 7)) - 1]}${x ? ` · keluar ${rp(x.out)}${x.fixed ? ` (tetap ${rp(x.fixed)})` : ''} · masuk ${rp(x.inc)}` : ''}${r ? ` · jadwal: ${r.join(', ')}` : ''}`;
    return `<button class="${cls}" style="--h:${h.toFixed(2)}" data-a="${o.act}" data-d="${d}" aria-label="${esc(title)}" title="${esc(title)}">
      <span class="cal-n">${Number(d.slice(8))}${d === top ? '<i data-lucide="flame"></i>' : ''}${r ? '<em class="cal-rec"></em>' : ''}</span>
      ${flex ? `<span class="cal-o m">${cellAmt(flex)}</span>` : ''}${x && x.fixed ? `<span class="cal-f m"><i data-lucide="lock"></i>${cellAmt(x.fixed)}</span>` : ''}${x && x.inc ? `<span class="cal-i m">+${cellAmt(x.inc)}</span>` : ''}</button>`;
  }).join('');
  return `<div class="cal-w">${WEEK.map((w, i) => `<span${i > 4 ? ' class="we"' : ''}>${w}</span>`).join('')}</div><div class="cal-g">${cells}</div>
    <div class="cal-leg"><span><i class="sw"></i>makin pekat = makin boros</span><span><i data-lucide="flame"></i>terboros (tanpa yang tetap)</span><span class="lk"><i data-lucide="lock"></i>tetap</span>${Object.keys(rec).length ? '<span><em class="cal-rec"></em>jadwal berulang</span>' : ''}</div>`;
}

/**
 * Month & year picker. o: { mk, year, first, last, actYear, actMonth } — months outside first…last are disabled.
 */
export function pickerHTML(o) {
  const y = o.year, fy = Number(o.first.slice(0, 4)), ly = Number(o.last.slice(0, 4));
  return `<div class="cal-pick"><div class="cal-pick-y"><button data-a="${o.actYear}" data-s="-1" ${y <= fy ? 'disabled' : ''} aria-label="Tahun sebelumnya"><i data-lucide="chevron-left"></i></button><b>${y}</b><button data-a="${o.actYear}" data-s="1" ${y >= ly ? 'disabled' : ''} aria-label="Tahun berikutnya"><i data-lucide="chevron-right"></i></button></div>
    <div class="cal-pick-m">${BLN.map((b, i) => { const k = `${y}-${String(i + 1).padStart(2, '0')}`; return `<button class="${k === o.mk ? 'on' : ''}" data-a="${o.actMonth}" data-v="${k}" ${k < o.first || k > o.last ? 'disabled' : ''}>${b}</button>`; }).join('')}</div></div>`;
}
