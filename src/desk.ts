// @ts-nocheck
// Laptop / landscape dashboard: a read-only recap built for presenting.
// Shown automatically on wide screens; the phone app opens as a side panel for recording.
import { CATS } from './model.ts';
import { balance, monthList, stats } from './stats.ts';
import { addMonths, BLN, BULAN, dayLabel, daysIn, esc, monthName, pad, pct, rp, shortTxt, todayStr } from './format.ts';
import * as store from './store.ts';
import { netWorth } from './plan.ts';

type Api = { icons: () => void; onPhoneShown: () => void; exportExcel: (p: { from: string; to: string; label: string; file: string }) => void };
let api: Api;
let root: HTMLElement | null = null;
const D = { mode: 'month', mk: null, year: null, cat: null, slide: 0, presenting: false };
const $ = (id) => document.getElementById(id);
const T = () => todayStr();
const TX = () => store.data.txs;
const WL = () => store.data.wallets.slice().sort((a, b) => a.order - b.order);
const money = (n) => `<span class="m">${rp(n)}</span>`;
const mshort = (n) => `<span class="m">${shortTxt(n)}</span>`;
const reduced = () => window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
const MQ = window.matchMedia('(min-width: 1024px) and (min-height: 560px)');

/* ---------- period maths ---------- */
function period() {
  const today = T();
  if (D.mode === 'year') {
    const y = D.year, cur = String(y) === today.slice(0, 4);
    return { key: String(y), label: `Tahun ${y}`, short: String(y), prevKey: String(y - 1), prevLabel: String(y - 1), until: cur ? `${y - 1}${today.slice(4)}` : null, cur };
  }
  const mk = D.mk, cur = mk === today.slice(0, 7), prev = addMonths(mk, -1);
  return { key: mk, label: monthName(mk), short: BLN[Number(mk.slice(5)) - 1], prevKey: prev, prevLabel: monthName(prev), until: cur ? `${prev}-${today.slice(8)}` : null, cur };
}
/** stats for a period prefix, optionally only up to a date (same-period comparison). */
const st = (key, until = null) => stats(until ? TX().filter((t) => t.date <= until) : TX(), key);
function deltaChip(cur, prev, upIsGood, label) {
  if (!prev) return `<span class="dk-delta flat">Belum ada data ${esc(label)}</span>`;
  const d = (cur - prev) / prev, good = upIsGood ? d >= 0 : d <= 0;
  if (Math.abs(d) < 0.005) return `<span class="dk-delta flat">Setara ${esc(label)}</span>`;
  return `<span class="dk-delta ${Math.abs(d) < 0.005 ? 'flat' : good ? 'good' : 'bad'}"><i data-lucide="${d >= 0 ? 'trending-up' : 'trending-down'}"></i>${d >= 0 ? '+' : '−'}${pct(Math.abs(d))} vs ${esc(label)}</span>`;
}
function niceMax(v) { if (v <= 0) return 1; const p = Math.pow(10, Math.floor(Math.log10(v))), n = v / p; return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p; }

/* ---------- sections (each also used as a presentation slide) ---------- */
function kpis(P, cur, prev) {
  const total = WL().reduce((s, w) => s + balance(TX(), w), 0), left = cur.inc - cur.out, rate = cur.inc ? left / cur.inc : 0;
  const cmp = P.cur ? `${P.prevLabel}, periode sama` : P.prevLabel;
  return `<div class="dk-kpis">
    <div class="dk-kpi hero"><small>Total saldo saat ini</small><b class="m">${rp(total)}</b><span class="dk-sub">di ${WL().length} dompet</span></div>
    <div class="dk-kpi"><small><i class="dot" style="--c:var(--in)"></i>Pemasukan ${esc(P.short)}</small><b class="m in" data-count="${cur.inc}">${rp(cur.inc)}</b>${deltaChip(cur.inc, prev.inc, true, cmp)}</div>
    <div class="dk-kpi"><small><i class="dot" style="--c:var(--out)"></i>Pengeluaran ${esc(P.short)}</small><b class="m out" data-count="${cur.out}">${rp(cur.out)}</b>${deltaChip(cur.out, prev.out, false, cmp)}</div>
    <div class="dk-kpi"><small><i class="dot" style="--c:var(--brand)"></i>Sisa ${esc(P.short)}</small><b class="m" data-count="${Math.abs(left)}" data-pre="${left < 0 ? '−' : ''}">${rp(left)}</b>
      <span class="dk-sub">${cur.inc ? `Rasio tabungan <strong>${pct(rate)}</strong> · patokan 20%` : 'Belum ada pemasukan'}</span><div class="dk-meter"><i style="width:${Math.max(0, Math.min(100, rate * 100))}%;--c:${rate >= 0.2 ? 'var(--in)' : rate >= 0.1 ? '#F0A010' : 'var(--out)'}"></i><b style="left:20%"></b></div></div>
  </div>`;
}
function cashflow(P, cur, big) {
  const Wd = 900, H = big ? 380 : 270, L = 54, R = 12, top = 16, base = H - 34, plotW = Wd - L - R;
  let bars = '', labels = '', grid = '', bw, vals, max;
  if (D.mode === 'year') {
    const y = Number(P.key), months = Array.from({ length: 12 }, (_, i) => `${y}-${pad(i + 1)}`), data = months.map((mk) => stats(TX(), mk));
    max = niceMax(Math.max(...data.map((s) => Math.max(s.inc, s.out)), 0)); const gw = plotW / 12; bw = Math.min(gw * 0.34, 26);
    data.forEach((s, i) => {
      const x = L + i * gw + gw / 2, hi = (s.inc / max) * (base - top), ho = (s.out / max) * (base - top);
      bars += `<rect class="dbar b-in" style="--i:${i * 2}" x="${(x - bw - 2).toFixed(1)}" y="${(base - hi).toFixed(1)}" width="${bw.toFixed(1)}" height="${hi.toFixed(1)}" rx="5"><title>Masuk ${BULAN[i]}: ${rp(s.inc)}</title></rect><rect class="dbar b-out" style="--i:${i * 2 + 1}" x="${(x + 2).toFixed(1)}" y="${(base - ho).toFixed(1)}" width="${bw.toFixed(1)}" height="${ho.toFixed(1)}" rx="5"><title>Keluar ${BULAN[i]}: ${rp(s.out)}</title></rect>`;
      labels += `<text x="${x.toFixed(1)}" y="${H - 10}" text-anchor="middle">${BLN[i]}</text>`;
    });
  } else {
    const n = daysIn(P.key), lastDay = P.cur ? Number(T().slice(8)) : n; vals = Array.from({ length: n }, (_, i) => cur.byDay[`${P.key}-${pad(i + 1)}`] || 0);
    max = niceMax(Math.max(...vals, 0)); const gw = plotW / n; bw = gw * 0.62; const mx = Math.max(...vals);
    vals.forEach((v, i) => {
      const x = L + i * gw + (gw - bw) / 2, h = Math.max(v ? 3 : 0, (v / max) * (base - top));
      bars += `<rect class="dbar${v && v === mx ? ' hi' : ''}" style="--i:${i}" x="${x.toFixed(1)}" y="${(base - h).toFixed(1)}" width="${bw.toFixed(1)}" height="${h.toFixed(1)}" rx="4"><title>${dayLabel(`${P.key}-${pad(i + 1)}`, T())}: ${rp(v)}</title></rect>`;
      if (i === 0 || (i + 1) % 5 === 0) labels += `<text x="${(L + i * gw + gw / 2).toFixed(1)}" y="${H - 10}" text-anchor="middle">${i + 1}</text>`;
    });
    if (cur.out) { const avg = cur.out / lastDay, ay = base - (avg / max) * (base - top); grid += `<line class="davg" x1="${L}" x2="${Wd - R}" y1="${ay.toFixed(1)}" y2="${ay.toFixed(1)}"/><text class="dtag" x="${Wd - R}" y="${(ay - 6).toFixed(1)}" text-anchor="end">rata-rata ${shortTxt(avg)}/hari</text>`; }
    if (P.cur && lastDay < n) grid += `<rect x="${(L + lastDay * gw).toFixed(1)}" y="${top}" width="${(plotW - lastDay * gw).toFixed(1)}" height="${base - top}" class="dfuture" rx="8"/><text x="${(L + lastDay * gw + (plotW - lastDay * gw) / 2).toFixed(1)}" y="${((base + top) / 2).toFixed(1)}" text-anchor="middle">belum terjadi</text>`;
  }
  for (let k = 0; k <= 4; k++) { const v = (max / 4) * k, y = base - (v / max) * (base - top); grid = `<line class="dgrid" x1="${L}" x2="${Wd - R}" y1="${y.toFixed(1)}" y2="${y.toFixed(1)}"/><text x="${L - 10}" y="${(y + 4).toFixed(1)}" text-anchor="end">${shortTxt(v)}</text>` + grid; }
  const legend = D.mode === 'year' ? `<span class="dk-leg"><span style="--c:var(--in)"><i></i>Masuk</span><span style="--c:var(--out)"><i></i>Keluar</span></span>` : `<span class="dk-leg"><span style="--c:var(--brand)"><i></i>Pengeluaran per hari</span></span>`;
  return `<div class="dk-card-h"><h3>Arus kas ${esc(P.label)}</h3>${legend}</div><div class="dk-chart"><svg viewBox="0 0 ${Wd} ${H}" role="img" aria-label="Grafik arus kas">${grid}${bars}${labels}</svg></div>`;
}
function composition(P, cur, prev, big) {
  if (D.cat && !big) return categoryDetail(P, cur, prev);
  const parts = Object.entries(cur.byCat).map(([k, v]) => ({ k, v })).sort((a, b) => b.v - a.v);
  if (!parts.length) return `<div class="dk-card-h"><h3>Ke mana uang pergi?</h3></div><div class="dk-empty">Belum ada pengeluaran di ${esc(P.label)}.</div>`;
  const size = big ? 340 : 230, Rr = big ? 132 : 88, sw = big ? 46 : 32, c = size / 2, C = 2 * Math.PI * Rr; let off = 0;
  const segs = parts.map((p, i) => { const len = Math.max((p.v / cur.out) * C - 3, 0.5); const s = `<circle class="dseg" data-a="dkCat" data-cat="${p.k}" data-len="${len.toFixed(2)}" data-c="${C.toFixed(2)}" style="--i:${i}" r="${Rr}" cx="${c}" cy="${c}" fill="none" stroke="${CATS[p.k].c}" stroke-width="${sw}" stroke-dasharray="${len.toFixed(2)} ${C.toFixed(2)}" stroke-dashoffset="${(-off).toFixed(2)}" transform="rotate(-90 ${c} ${c})"><title>${CATS[p.k].n}: ${rp(p.v)}</title></circle>`; off += (p.v / cur.out) * C; return s; }).join('');
  return `<div class="dk-card-h"><h3>Ke mana uang pergi?</h3>${big ? '' : '<small>klik kategori untuk detail</small>'}</div>
  <div class="dk-comp ${big ? 'lg' : ''}"><div class="dk-donut" style="width:${size}px;height:${size}px"><svg viewBox="0 0 ${size} ${size}"><circle r="${Rr}" cx="${c}" cy="${c}" fill="none" stroke="var(--surface-2)" stroke-width="${sw}"/>${segs}</svg><div class="dk-donut-c"><small>Total keluar</small><b class="m">${shortTxt(cur.out)}</b><small>${parts.length} kategori</small></div></div>
  <div class="dk-legend">${parts.slice(0, big ? 9 : 7).map((p) => `<button data-a="dkCat" data-cat="${p.k}" style="--c:${CATS[p.k].c}"><i></i><span>${CATS[p.k].n}</span><em class="m">${shortTxt(p.v)}</em><strong>${pct(p.v / cur.out)}</strong></button>`).join('')}${parts.length > (big ? 9 : 7) ? `<div class="dk-more">+${parts.length - (big ? 9 : 7)} kategori lain</div>` : ''}</div></div>`;
}
function categoryDetail(P, cur, prev) {
  const k = D.cat, c = CATS[k], tot = cur.byCat[k] || 0, pv = prev.byCat[k] || 0;
  const subs = c.subs.map((s) => ({ s, v: cur.bySub[k + '|' + s] || 0 })).filter((x) => x.v > 0).sort((a, b) => b.v - a.v), mx = Math.max(...subs.map((x) => x.v), 1);
  const list = TX().filter((t) => t.type === 'out' && t.cat === k && t.date.startsWith(P.key)).sort((a, b) => b.amount - a.amount).slice(0, 5);
  return `<div class="dk-card-h"><button class="dk-back" data-a="dkCat" data-cat=""><i data-lucide="chevron-left"></i>Semua kategori</button></div>
  <div class="dk-cat-h" style="--c:${c.c}"><span class="dk-ic"><i data-lucide="${c.i}"></i></span><div><h3>${c.n}</h3><span class="dk-sub">${cur.out ? pct(tot / cur.out) : '0%'} dari pengeluaran ${esc(P.label)}</span></div></div>
  <div class="dk-cat-total m">${rp(tot)}</div>${deltaChip(tot, pv, false, P.cur ? `${P.prevLabel}, periode sama` : P.prevLabel)}
  <div class="dk-subs">${subs.map((x, i) => `<div class="dk-subrow" style="--c:${c.c};--i:${i}"><div><span>${esc(x.s)}</span><em class="m">${rp(x.v)}</em></div><div class="trk"><i style="width:${(x.v / mx) * 100}%"></i></div></div>`).join('')}</div>
  <div class="dk-mini-h">Transaksi terbesar</div>${list.map((t) => `<div class="dk-row"><span>${dayLabel(t.date, T())}</span><b>${esc(t.note)}</b><em class="m">${rp(t.amount)}</em></div>`).join('')}`;
}
function topCategories(P, cur, prev, big) {
  const parts = Object.entries(cur.byCat).sort((a, b) => b[1] - a[1]).slice(0, big ? 6 : 5), mx = parts.length ? parts[0][1] : 1;
  if (!parts.length) return `<div class="dk-card-h"><h3>Kategori teratas</h3></div><div class="dk-empty">Belum ada data.</div>`;
  return `<div class="dk-card-h"><h3>Kategori teratas</h3><small>vs ${esc(P.cur ? 'periode sama ' + P.prevLabel : P.prevLabel)}</small></div>
  <div class="dk-tops">${parts.map(([k, v], i) => { const c = CATS[k], pv = prev.byCat[k] || 0, d = pv ? (v - pv) / pv : null;
    return `<button class="dk-top" data-a="dkCat" data-cat="${k}" style="--c:${c.c};--i:${i}"><span class="dk-ic sm"><i data-lucide="${c.i}"></i></span><div class="dk-top-m"><div><b>${c.n}</b><em class="m">${rp(v)}</em></div><div class="trk"><i style="width:${(v / mx) * 100}%"></i></div></div><span class="dk-mini-d ${d == null ? 'flat' : d > 0 ? 'bad' : 'good'}">${d == null ? 'baru' : (d > 0 ? '▲ ' : '▼ ') + pct(Math.abs(d))}</span></button>`; }).join('')}</div>`;
}
function biggest(P, big) {
  const list = TX().filter((t) => t.type === 'out' && t.date.startsWith(P.key)).sort((a, b) => b.amount - a.amount).slice(0, big ? 6 : 6);
  return `<div class="dk-card-h"><h3>Pengeluaran terbesar</h3><small>${esc(P.label)}</small></div>
  ${list.length ? `<div class="dk-big-list">${list.map((t, i) => { const c = CATS[t.cat] || CATS.lain; return `<div class="dk-big" style="--c:${c.c};--i:${i}"><span class="rank">${i + 1}</span><div><b>${esc(t.note)}</b><small>${c.n} · ${dayLabel(t.date, T())}</small></div><em class="m">${rp(t.amount)}</em></div>`; }).join('')}</div>` : '<div class="dk-empty">Belum ada pengeluaran.</div>'}`;
}
function notes(P, cur, prev) {
  const out = [];
  if (cur.inc) { const r = (cur.inc - cur.out) / cur.inc; out.push({ c: r >= 0.2 ? '#10B981' : r >= 0.1 ? '#F0A010' : '#F43F5E', i: 'piggy-bank', t: `Rasio tabungan ${pct(r)}`, d: r >= 0.2 ? 'Di atas patokan aman 20% dari pemasukan.' : 'Masih di bawah patokan 20%. Kategori teratas adalah tempat paling mudah untuk berhemat.' }); }
  const top = Object.entries(cur.byCat).sort((a, b) => b[1] - a[1])[0];
  if (top) out.push({ c: CATS[top[0]].c, i: CATS[top[0]].i, t: `${CATS[top[0]].n} menyerap ${pct(top[1] / cur.out)}`, d: `${rp(top[1])} selama ${P.label}.` });
  let up = null; for (const [k, v] of Object.entries(cur.byCat)) { const pv = prev.byCat[k] || 0; if (pv && v - pv > 0 && (!up || v - pv > up.diff)) up = { k, diff: v - pv, d: (v - pv) / pv }; }
  if (up) out.push({ c: '#F43F5E', i: 'flame', t: `Kenaikan terbesar: ${CATS[up.k].n}`, d: `Naik ${rp(up.diff)} (${pct(up.d)}) dibanding ${P.cur ? 'periode sama ' : ''}${P.prevLabel}.` });
  if (D.mode === 'month' && P.cur) {
    const prevFull = st(P.prevKey).out, prevSame = prev.out;
    if (prevFull > 0) out.push({ c: '#3D8BFF', i: 'trending-up', t: `Perkiraan akhir bulan ${rp(cur.out + Math.max(0, prevFull - prevSame))}`, d: 'Memakai pola sisa bulan lalu.' });
  }
  const months = monthList(TX(), T()).filter((k) => k !== T().slice(0, 7)).slice(-3).map((k) => stats(TX(), k).out).filter((v) => v > 0);
  if (months.length) { const avg = months.reduce((a, b) => a + b, 0) / months.length, total = WL().reduce((s, w) => s + balance(TX(), w), 0), n = Math.max(0, total / avg); out.push({ c: '#8B5CF6', i: 'shield-check', t: `Dana darurat cukup ${n.toFixed(1).replace('.', ',')} bulan`, d: `Patokan umum 3–6 kali pengeluaran bulanan (rata-rata ${rp(avg)}).`, prog: Math.min(1, n / 6) }); }
  return `<div class="dk-card-h"><h3>Catatan perencana keuangan</h3></div>
  ${out.length ? `<div class="dk-notes">${out.map((x, i) => `<div class="dk-note" style="--c:${x.c};--i:${i}"><span class="dk-ic sm"><i data-lucide="${x.i}"></i></span><div><b>${x.t}</b><p>${x.d}</p>${x.prog != null ? `<div class="trk"><i style="width:${x.prog * 100}%"></i></div>` : ''}</div></div>`).join('')}</div>` : '<div class="dk-empty">Catatan muncul setelah ada pemasukan dan pengeluaran.</div>'}`;
}
function walletsStrip() {
  const ws = WL().map((w) => ({ w, b: balance(TX(), w) })), tot = ws.reduce((s, x) => s + Math.max(0, x.b), 0) || 1;
  const cash = ws.reduce((s, x) => s + x.b, 0), nw = store.data.debts.length ? netWorth(cash, store.data.debts, TX()) : null;
  return `<div class="dk-card-h"><h3>Saldo per dompet</h3><small>${nw ? `kekayaan bersih <b class="m">${rp(nw.net)}</b> · piutang ${rp(nw.receivable)} · utang ${rp(nw.owed)}` : 'hari ini'}</small></div>
  <div class="dk-wallets">${ws.map(({ w, b }, i) => `<div class="dk-wallet" style="--c:${w.color};--i:${i}"><div class="top"><span class="logo">${esc(w.short)}</span><span>${esc(w.name)}</span></div><b class="m">${rp(b)}</b><div class="trk"><i style="width:${(Math.max(0, b) / tot) * 100}%"></i></div><small>${pct(Math.max(0, b) / tot)} dari total</small></div>`).join('')}</div>`;
}

/* ---------- render ---------- */
function ensurePeriod() {
  const months = monthList(TX(), T());
  if (!D.mk || !months.includes(D.mk)) D.mk = months[months.length - 1];
  const years = [...new Set(months.map((m) => Number(m.slice(0, 4))))];
  if (!D.year || !years.includes(D.year)) D.year = years[years.length - 1];
  return { months, years };
}
function canStep(dir) {
  const { months, years } = ensurePeriod();
  if (D.mode === 'year') { const i = years.indexOf(D.year) + dir; return i >= 0 && i < years.length; }
  const i = months.indexOf(D.mk) + dir; return i >= 0 && i < months.length;
}
function step(dir) {
  if (!canStep(dir)) return; const { months, years } = ensurePeriod();
  if (D.mode === 'year') D.year = years[years.indexOf(D.year) + dir]; else D.mk = months[months.indexOf(D.mk) + dir];
  D.cat = null; render(dir > 0 ? 'swap-l' : 'swap-r');
}
export function render(swap = '') {
  if (!root || !document.body.classList.contains('desk')) return;
  ensurePeriod();
  const P = period(), cur = st(P.key), prev = st(P.prevKey, P.until);
  const name = store.data.settings.name;
  root.innerHTML = `<div class="dk">
    <header class="dk-top">
      <div class="dk-brand"><img class="dk-logo" src="./icons/logo-152.png" alt="Do it Dip" width="54" height="54"><div><small>Do it Dip${name ? ' · ' + esc(name) : ''}</small><h1>Rekap ${esc(P.label)}</h1></div></div>
      <div class="dk-ctrl">
        <div class="dk-seg"><button class="${D.mode === 'month' ? 'on' : ''}" data-a="dkMode" data-v="month">Bulan</button><button class="${D.mode === 'year' ? 'on' : ''}" data-a="dkMode" data-v="year">Tahun</button></div>
        <div class="dk-step"><button data-a="dkStep" data-d="-1" ${canStep(-1) ? '' : 'disabled'} aria-label="Periode sebelumnya"><i data-lucide="chevron-left"></i></button><span>${esc(D.mode === 'year' ? String(D.year) : monthName(D.mk))}</span><button data-a="dkStep" data-d="1" ${canStep(1) ? '' : 'disabled'} aria-label="Periode berikutnya"><i data-lucide="chevron-right"></i></button></div>
        <button class="dk-btn" data-a="dkHide" aria-label="Sembunyikan nominal"><i data-lucide="${root.classList.contains('hid') ? 'eye-off' : 'eye'}"></i></button>
        <button class="dk-btn" data-a="dkExcel" title="Unduh rekap periode ini sebagai Excel"><i data-lucide="file-down"></i>Excel</button>
        <button class="dk-btn" data-a="dkPhone"><i data-lucide="smartphone"></i>Catat</button>
        <button class="dk-btn dk-go" data-a="dkPresent"><i data-lucide="presentation"></i>Presentasi</button>
      </div>
    </header>
    <div class="dk-body ${swap}">
      ${kpis(P, cur, prev)}
      <div class="dk-grid">
        <section class="dk-card span-8">${cashflow(P, cur)}</section>
        <section class="dk-card span-4">${composition(P, cur, prev)}</section>
        <section class="dk-card span-4">${topCategories(P, cur, prev)}</section>
        <section class="dk-card span-4">${biggest(P)}</section>
        <section class="dk-card span-4">${notes(P, cur, prev)}</section>
        <section class="dk-card span-12">${walletsStrip()}</section>
      </div>
    </div>
    <footer class="dk-foot">Panah ← → untuk ganti periode · tombol Presentasi untuk layar penuh · data dari perangkat ini</footer>
  </div>${presentHTML(P, cur, prev)}`;
  api.icons(); play(root.querySelector('.dk-body'));
}
function play(scope) {
  if (!scope) return;
  scope.classList.remove('play'); void scope.offsetWidth; scope.classList.add('play');
  scope.querySelectorAll('[data-count]').forEach(countUp);
  if (!reduced()) scope.querySelectorAll('.dseg').forEach((s, j) => { const len = Number(s.dataset.len), C = Number(s.dataset.c); s.animate([{ strokeDasharray: `0 ${C}` }, { strokeDasharray: `${len} ${C}` }], { duration: 900, delay: 150 + j * 80, easing: 'cubic-bezier(.3,.9,.3,1)', fill: 'backwards' }); });
}
function countUp(el) {
  const to = Number(el.dataset.count), pre = el.dataset.pre || '';
  if (reduced()) { el.textContent = pre + rp(to); return; }
  const t0 = performance.now(), dur = 1000;
  const f = (n) => { const k = Math.min(1, (n - t0) / dur), e = 1 - Math.pow(1 - k, 4); el.textContent = pre + rp(to * e); if (k < 1) requestAnimationFrame(f); };
  requestAnimationFrame(f);
}

/* ---------- presentation (full-screen slides) ---------- */
const SLIDES = ['Ringkasan', 'Ke mana uang pergi', 'Arus kas', 'Kategori & pengeluaran terbesar', 'Catatan perencana keuangan'];
function presentHTML(P, cur, prev) {
  const body = [
    kpis(P, cur, prev),
    `<div class="dk-card">${composition(P, cur, prev, true)}</div>`,
    `<div class="dk-card">${cashflow(P, cur, true)}</div>`,
    `<div class="dk-grid"><div class="dk-card span-6">${topCategories(P, cur, prev, true)}</div><div class="dk-card span-6">${biggest(P, true)}</div></div>`,
    `<div class="dk-card">${notes(P, cur, prev)}</div>`,
  ];
  return `<div class="dk-pres" id="dkPres" ${D.presenting ? '' : 'hidden'}>
    ${body.map((b, i) => `<section class="dk-slide ${i === D.slide ? 'on' : ''}" data-i="${i}"><div class="dk-slide-h"><span>${pad(i + 1)} / ${pad(SLIDES.length)}</span><h2>${SLIDES[i]}</h2><small>${esc(P.label)}${store.data.settings.name ? ' · ' + esc(store.data.settings.name) : ''}</small></div><div class="dk-slide-b">${b}</div></section>`).join('')}
    <nav class="dk-pres-nav"><button data-a="dkSlide" data-d="-1" aria-label="Sebelumnya"><i data-lucide="chevron-left"></i></button>${SLIDES.map((_, i) => `<button class="dot ${i === D.slide ? 'on' : ''}" data-a="dkGo" data-i="${i}" aria-label="Slide ${i + 1}"></button>`).join('')}<button data-a="dkSlide" data-d="1" aria-label="Berikutnya"><i data-lucide="chevron-right"></i></button><button class="exit" data-a="dkExit"><i data-lucide="minimize"></i>Keluar</button></nav>
  </div>`;
}
function goSlide(i) {
  const n = SLIDES.length; i = Math.max(0, Math.min(n - 1, i)); if (i === D.slide && D.presenting) { /* replay */ }
  const dir = i >= D.slide ? 1 : -1; D.slide = i;
  root.querySelectorAll('.dk-slide').forEach((s) => { const on = Number(s.dataset.i) === i; s.classList.toggle('on', on); s.style.setProperty('--dir', String(dir)); if (on) play(s); });
  root.querySelectorAll('.dk-pres-nav .dot').forEach((d, j) => d.classList.toggle('on', j === i));
}
function startPresent() {
  D.presenting = true; D.slide = 0; const p = $('dkPres'); p.hidden = false; goSlide(0);
  document.documentElement.requestFullscreen?.().catch(() => {});
}
function stopPresent() {
  D.presenting = false; const p = $('dkPres'); if (p) p.hidden = true;
  if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
}

/* ---------- mode + events ---------- */
export function sync() {
  const on = MQ.matches && store.data.settings.onboarded;
  document.body.classList.toggle('desk', on);
  if (!on) { document.body.classList.remove('phone-open'); stopPresent(); }
  render();
}
function openPhone() { document.body.classList.add('phone-open'); api.onPhoneShown(); }
export function closePhone() { if (!document.body.classList.contains('phone-open')) return; document.body.classList.remove('phone-open'); render(); }

export function initDesk(a: Api) {
  api = a;
  root = document.createElement('div'); root.id = 'desk'; document.body.appendChild(root);
  const scrim = document.createElement('div'); scrim.className = 'phone-scrim'; scrim.innerHTML = '<button class="phone-close" aria-label="Tutup panel catat"><span>Kembali ke rekap</span></button>'; document.body.appendChild(scrim);
  scrim.addEventListener('click', closePhone);
  MQ.addEventListener('change', sync);
  root.addEventListener('click', (e) => {
    const el = e.target.closest('[data-a]'); if (!el) return; const d = el.dataset;
    switch (d.a) {
      case 'dkMode': D.mode = d.v; D.cat = null; render(); break;
      case 'dkStep': step(Number(d.d)); break;
      case 'dkCat': D.cat = d.cat || null; render(); break;
      case 'dkHide': { const hid = !root.classList.contains('hid'); root.classList.toggle('hid', hid); document.getElementById('app')?.classList.toggle('hid', hid); render(); break; }
      case 'dkPhone': openPhone(); break;
      case 'dkExcel': { const P = period(); api.exportExcel(D.mode === 'year' ? { from: P.key + '-01-01', to: P.key + '-12-31', label: P.label, file: P.key } : { from: P.key + '-01', to: P.key + '-' + pad(daysIn(P.key)), label: P.label, file: P.key }); break; }
      case 'dkPresent': startPresent(); break;
      case 'dkExit': stopPresent(); break;
      case 'dkSlide': goSlide(D.slide + Number(d.d)); break;
      case 'dkGo': goSlide(Number(d.i)); break;
    }
  });
  document.addEventListener('keydown', (e) => {
    if (!document.body.classList.contains('desk')) return;
    if (D.presenting) {
      if (['ArrowRight', 'PageDown', ' ', 'Enter'].includes(e.key)) { e.preventDefault(); goSlide(D.slide + 1); }
      else if (['ArrowLeft', 'PageUp', 'Backspace'].includes(e.key)) { e.preventDefault(); goSlide(D.slide - 1); }
      else if (e.key === 'Escape') stopPresent();
      return;
    }
    if (document.body.classList.contains('phone-open')) { if (e.key === 'Escape' && !document.querySelector('#layer .sheet, #composer:not([hidden])')) closePhone(); return; }
    if (e.target.closest && e.target.closest('input,textarea')) return;
    if (e.key === 'ArrowRight') step(1); if (e.key === 'ArrowLeft') step(-1);
  });
  document.addEventListener('fullscreenchange', () => { if (!document.fullscreenElement && D.presenting) stopPresent(); });
  sync();
}
export const isDesk = () => document.body.classList.contains('desk') && !document.body.classList.contains('phone-open');
