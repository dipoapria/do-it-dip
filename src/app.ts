// @ts-nocheck
// UI layer: ported from the approved mockup v2 (D:\ProjekClaude\Keuangan\mockup\v2). It is imperative DOM code with
// the animation layer kept intact; the data, parser and stats modules it calls are strictly typed.
import {
  createIcons, House, ChartPie, Wallet as WalletIcon, Settings as SettingsIcon, Plus, Sparkles, BookOpen, ChevronDown, Eye, EyeOff,
  ArrowDownLeft, ArrowUpRight, ArrowDown, ArrowRight, Keyboard, Utensils, Fuel, ShoppingBag, Zap, HeartPulse, GraduationCap,
  HandHeart, LayoutGrid, Briefcase, Gift, Coins, ArrowLeftRight, Landmark, Smartphone, Banknote, ChevronLeft, ChevronRight,
  PiggyBank, TrendingUp, TrendingDown, ShieldCheck, X, Check, Calendar, Info, Brain, Delete, Copy, Trash2, Lock, Tags,
  CloudUpload, Download, Upload, MonitorSmartphone, Sun, Moon, User, Laptop, Store, Users, Layers, Pointer, Pencil, Palette,
  Presentation, Minimize, Flame, Clapperboard, Camera, ImagePlus, FileSpreadsheet, ScanLine, Receipt, KeyRound, TriangleAlert, RotateCcw,
} from 'lucide';
import { recognize, preprocess } from './ocr.ts';
import { extract, NeedPassword } from './filetext.ts';
import { parseReceipt } from './receipt.ts';
import { guessRow, linesToStatement, rowsToStatement } from './statement.ts';
import { KW } from './model.ts';
import { initDesk, render as renderDesk, sync as syncDesk } from './desk.ts';
import { addDays, BLN, BULAN, dayLabel, daysIn, digitsOnly, esc, fmtN, HARI, HARI_P, longDate, monthName, pad, pct, rp, shortTxt, toD, todayStr } from './format.ts';
import { CATS, DEFAULT_WALLETS, IN_CATS, OUT_CATS, WALLET_COLORS, WALLET_ICON } from './model.ts';
import { highlightHTML, parseText } from './parser.ts';
import { balance, monthList, stats } from './stats.ts';
import * as store from './store.ts';

const ICONS = {
  House, ChartPie, Wallet: WalletIcon, Settings: SettingsIcon, Plus, Sparkles, BookOpen, ChevronDown, Eye, EyeOff, ArrowDownLeft,
  ArrowUpRight, ArrowDown, ArrowRight, Keyboard, Utensils, Fuel, ShoppingBag, Zap, HeartPulse, GraduationCap, HandHeart, LayoutGrid,
  Briefcase, Gift, Coins, ArrowLeftRight, Landmark, Smartphone, Banknote, ChevronLeft, ChevronRight, PiggyBank, TrendingUp,
  TrendingDown, ShieldCheck, X, Check, Calendar, Info, Brain, Delete, Copy, Trash2, Lock, Tags, CloudUpload, Download, Upload,
  MonitorSmartphone, Sun, Moon, User, Laptop, Store, Users, Layers, Pointer, Pencil, Palette, Presentation, Minimize, Flame, Clapperboard,
  Camera, ImagePlus, FileSpreadsheet, ScanLine, Receipt, KeyRound, TriangleAlert, RotateCcw,
};
function icons() { createIcons({ icons: ICONS, attrs: { 'stroke-width': 2.2 } }); }

/* ================= state & data helpers ================= */
const S = {
  idx: 0, pos: 0, mk: null, drill: null, selDay: null, wsel: null, dispTotal: 0,
  mode: 'kalimat', co: null, nl: '', nlOv: {}, nlPick: null, lastSig: [], prevMarks: null, editId: null,
  m: null, timers: [], justDragged: false, wall: false, peekDrag: null, confirmFn: null, persisted: false,
  ob: null,
  struk: { phase: 'idle' }, imp: { phase: 'idle', wallet: null, rows: [], pick: null },
};
const $ = (id) => document.getElementById(id);
const app = () => $('app');
const T = () => todayStr();
const reduced = () => window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
const later = (ms, fn) => { const t = setTimeout(fn, ms); S.timers.push(t); return t; };
/** Run fn when an animation finishes, or after `ms` anyway (finish events can stall in background tabs). */
function onEnd(anim, ms, fn) { let done = false; const go = () => { if (done) return; done = true; fn(); }; anim.onfinish = go; setTimeout(go, ms + 150); }
const clearTimers = () => { S.timers.forEach(clearTimeout); S.timers = []; };

const TX = () => store.data.txs;
const WL = () => store.data.wallets.slice().sort((a, b) => a.order - b.order);
const GHOST = (id) => ({ id, name: 'Dompet terhapus', short: '?', group: 'Tunai', color: '#94A3B8', init: 0, order: 99, aliases: [], book: 'pribadi' });
const W = (id) => store.data.wallets.find((w) => w.id === id) || GHOST(id);
const bal = (w) => balance(TX(), typeof w === 'string' ? W(w) : w);
const totalBalance = () => WL().reduce((s, w) => s + bal(w), 0);
const sorted = (list = TX()) => list.slice().sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.createdAt - a.createdAt));
const catOf = (t) => (t.type === 'tf' ? { n: 'Transfer', c: '#3D7BFF', i: 'arrow-left-right' } : CATS[t.cat] || CATS.lain);
const money = (n) => `<span class="m">${rp(n)}</span>`;
const short = (n) => `<span class="m">${shortTxt(n)}</span>`;
const isCurMonth = (mk) => mk === T().slice(0, 7);
function defaults() {
  const ws = WL();
  const bank = (ws.find((w) => w.group === 'Bank') || ws[0] || GHOST('x')).id;
  const cash = (ws.find((w) => w.group === 'Tunai') || ws.find((w) => w.group === 'E-wallet') || ws[0] || GHOST('x')).id;
  return { bank, cash };
}
const ctx = () => ({ today: T(), learned: store.data.learned, wallets: WL().map((w) => ({ id: w.id, aliases: w.aliases?.length ? w.aliases : [w.name.toLowerCase()] })), defaults: defaults() });
function tfNote(p) {
  const to = W(p.to);
  if (p.note === 'Tarik tunai') return to.group === 'Tunai' ? 'Tarik tunai' : `Tarik ke ${to.name}`;
  if (p.note === 'Tabungan') return `Tabungan ke ${to.name}`;
  return to.group === 'E-wallet' ? `Isi saldo ${to.name}` : `Transfer ke ${to.name}`;
}
const newManual = () => ({ type: 'out', amt: '', cat: 'makan', sub: 'Makan siang', wallet: defaults().cash, to: defaults().bank, date: T(), note: '', justTyped: false });

/* ================= odometer + counters ================= */
function odoShape(el, value) {
  const str = rp(value), shape = str.replace(/\d/g, '0');
  if (el.dataset.shape !== shape) {
    el.innerHTML = [...str].map((ch) => (/\d/.test(ch) ? `<span class="od"><span class="od-c">${[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => `<span>${n}</span>`).join('')}</span></span>` : `<span>${ch}</span>`)).join('');
    el.dataset.shape = shape; void el.offsetWidth;
  }
  return str;
}
function odoZero(el, value, instant) {
  if (!el) return; odoShape(el, value); if (instant) el.classList.add('noanim');
  el.querySelectorAll('.od-c').forEach((c, i) => { c.style.transitionDelay = i * 25 + 'ms'; c.style.transform = 'translateY(0)'; });
  if (instant) { void el.offsetWidth; el.classList.remove('noanim'); }
}
function setOdo(el, value, instant) {
  if (!el) return;
  const str = odoShape(el, value);
  if (instant || reduced()) el.classList.add('noanim');
  const cols = el.querySelectorAll('.od-c'); let k = 0;
  for (const ch of str) { if (/\d/.test(ch)) { const c = cols[k++]; c.style.transitionDelay = (cols.length - k) * 45 + 'ms'; c.style.transform = `translateY(${-Number(ch) * 10}%)`; } }
  if (instant || reduced()) { void el.offsetWidth; el.classList.remove('noanim'); }
}
function countUp(el) {
  const to = Number(el.dataset.count), f = el.dataset.fmt || 'money', pre = el.dataset.pre || '';
  const fmt = (v) => (f === 'short' ? shortTxt(v) : f === 'pct' ? Math.round(v) + '%' : rp(v));
  if (reduced()) { el.textContent = pre + fmt(to); return; }
  const t0 = performance.now(), dur = 900;
  const step = (n) => { const k = Math.min(1, (n - t0) / dur), e = 1 - Math.pow(1 - k, 4); el.textContent = pre + fmt(to * e); if (k < 1) requestAnimationFrame(step); };
  requestAnimationFrame(step);
}

/* ================= views ================= */
function txRow(t) {
  const c = catOf(t), w = W(t.wallet), sign = t.type === 'in' ? '+' : t.type === 'out' ? '−' : '';
  const meta = t.type === 'tf' ? `${esc(w.name)} → ${esc(W(t.to).name)}` : `${esc(t.sub)} · ${esc(w.name)}`;
  return `<button class="tx${t.fresh ? ' fresh' : ''}" data-a="tx" data-id="${t.id}"><span class="ic" style="--c:${c.c}"><i data-lucide="${c.i}"></i></span><span class="tx-main"><b>${esc(t.note)}</b><small>${meta}</small></span><span class="amt ${t.type}">${sign}${money(t.amount)}</span></button>`;
}
function grouped(list) {
  const g = {}; list.forEach((t) => { (g[t.date] = g[t.date] || []).push(t); });
  return Object.keys(g).sort().reverse().map((d) => {
    const out = g[d].filter((t) => t.type === 'out').reduce((s, t) => s + t.amount, 0);
    return `<div class="day-h"><span>${dayLabel(d, T())}</span><span class="num">${out ? '−' + money(out) : ''}</span></div><div class="list">${g[d].map(txRow).join('')}</div>`;
  }).join('');
}
function timeOfDay() { const h = new Date().getHours(); if (h >= 4 && h < 10) return ['Selamat pagi', 'morning']; if (h >= 10 && h < 15) return ['Selamat siang', 'day']; if (h >= 15 && h < 18) return ['Selamat sore', 'dusk']; return ['Selamat malam', 'night']; }

function vHome() {
  const today = T(), mk = today.slice(0, 7), st = stats(TX(), mk), [greet, tod] = timeOfDay();
  const rate = st.inc ? Math.max(0, (st.inc - st.out) / st.inc) : 0;
  const week = []; for (let i = 6; i >= 0; i--) { const d = addDays(today, -i); week.push({ d, v: TX().filter((t) => t.date === d && t.type === 'out').reduce((s, t) => s + t.amount, 0) }); }
  const wmax = Math.max(...week.map((w) => w.v), 1), wsum = week.reduce((s, w) => s + w.v, 0);
  let recent = sorted().filter((t) => t.date >= addDays(today, -2));
  if (recent.length < 4) recent = sorted().slice(0, 8);
  const mon = BLN[Number(mk.slice(5)) - 1];
  return `<div class="inner">
  <header class="top st" style="--i:0">
    <div class="logo"><img class="app-logo" src="./icons/logo-152.png" alt="Do it Dip" width="48" height="48"><div style="min-width:0"><div class="subt">${greet},</div><div class="hello">${esc(store.data.settings.name || 'kamu')}</div></div></div>
    <button class="pillbtn" data-a="books"><i data-lucide="book-open"></i>Pribadi<i data-lucide="chevron-down"></i></button>
  </header>
  <section class="hero t-${tod} st" style="--i:1" id="hero"><div class="glare"></div>
    <div class="hero-row"><span class="lbl">Total saldo · ${WL().length} dompet</span><button class="eye" data-a="hide" aria-label="Sembunyikan atau tampilkan nominal"><i data-lucide="${app().classList.contains('hid') ? 'eye-off' : 'eye'}"></i></button></div>
    <div class="big m" id="odo" aria-label="${rp(totalBalance())}"></div>
    <div class="hero-split">
      <div><span><i data-lucide="arrow-down-left"></i>Masuk ${mon}</span><b>${money(st.inc)}</b></div>
      <div><span><i data-lucide="arrow-up-right"></i>Keluar ${mon}</span><b>${money(st.out)}</b></div>
    </div>
    <div class="save-meter">${st.inc ? `Sisa ${pct(rate)} dari pemasukan bulan ini` : 'Belum ada pemasukan bulan ini'}<div class="bar"><i style="width:${Math.min(100, rate * 100)}%"></i></div></div>
  </section>
  <button class="smart st" style="--i:2" data-a="add" data-mode="kalimat"><span class="spark"><i data-lucide="sparkles"></i></span><span class="ph">Ketik saja, misalnya <em>“kopi 18rb gopay”</em></span><span class="go">Catat</span></button>
  <div class="tip st" style="--i:2"><i data-lucide="arrow-down"></i>atau tarik layar ke bawah</div>
  <div class="quick st" style="--i:3">
    <button data-a="add" data-mode="manual"><span class="qi" style="--c:#3D8BFF"><i data-lucide="keyboard"></i></span>Manual</button>
    <button data-a="add" data-mode="struk"><span class="qi" style="--c:#E04BB5"><i data-lucide="camera"></i></span>Foto struk</button>
    <button data-a="add" data-mode="impor"><span class="qi" style="--c:#10B981"><i data-lucide="file-spreadsheet"></i></span>Impor mutasi</button>
    <button data-a="tab" data-t="1"><span class="qi" style="--c:#F0A010"><i data-lucide="chart-pie"></i></span>Rekap</button>
  </div>
  <div class="sec-h st" style="--i:4"><h3>7 hari terakhir</h3><small class="num">${money(wsum)}</small></div>
  <div class="card st" style="--i:4">
    <div class="week">${week.map((w, i) => `<div class="d ${w.d === today ? 'today' : ''}"><div class="b" style="height:${Math.max(6, (w.v / wmax) * 64)}px;--i:${i}"></div>${HARI[toD(w.d).getDay()]}</div>`).join('')}</div></div>
  <div class="sec-h"><h3>Transaksi terbaru</h3>${recent.length ? '<small>tahan baris untuk aksi cepat</small>' : ''}</div>
  ${recent.length ? grouped(recent) : `<div class="empty-card"><b>Belum ada transaksi</b>Ketuk kotak di atas dan tulis misalnya <code>kopi 18rb gopay</code>, atau tarik layar ke bawah.</div>`}</div>`;
}

function donut(parts, total) {
  const Rr = 60, C = 2 * Math.PI * Rr; let off = 0;
  const segs = parts.map((p) => { const len = Math.max((p.v / total) * C - 2.5, 0.5); const s = `<circle class="seg" data-a="drill" data-cat="${p.k}" data-len="${len.toFixed(2)}" data-c="${C.toFixed(2)}" r="${Rr}" cx="75" cy="75" fill="none" stroke="${CATS[p.k].c}" stroke-width="20" stroke-dasharray="${len.toFixed(2)} ${C.toFixed(2)}" stroke-dashoffset="${(-off).toFixed(2)}" transform="rotate(-90 75 75)"><title>${CATS[p.k].n}</title></circle>`; off += (p.v / total) * C; return s; }).join('');
  return `<div class="donut"><svg viewBox="0 0 150 150" role="img" aria-label="Pengeluaran per kategori"><circle r="${Rr}" cx="75" cy="75" fill="none" stroke="var(--surface-2)" stroke-width="20"/>${segs}</svg><div class="ctr"><small>Keluar</small><b class="m" data-count="${total}" data-fmt="short">${shortTxt(total)}</b><small>${parts.length} kategori</small></div></div>`;
}
function dailyChart(mk, st) {
  const n = daysIn(mk), Wd = 320, H = 118, top = 8, base = 96, lastDay = isCurMonth(mk) ? Number(T().slice(8)) : n;
  const vals = []; for (let d = 1; d <= n; d++) vals.push(st.byDay[`${mk}-${pad(d)}`] || 0);
  const max = Math.max(...vals, 1), avg = st.out / lastDay, bw = Wd / n, mxI = vals.indexOf(Math.max(...vals)), y = (v) => base - (v / max) * (base - top);
  let bars = '';
  vals.forEach((v, i) => {
    const d = i + 1, h = Math.max(v ? 3 : 0, base - y(v)), key = `${mk}-${pad(d)}`;
    bars += `<rect class="bar${v && i === mxI ? ' hi' : ''}${S.selDay === key ? ' sel' : ''}" style="--i:${i}" data-a="day" data-d="${key}" x="${(i * bw + bw * 0.18).toFixed(1)}" y="${(base - h).toFixed(1)}" width="${(bw * 0.64).toFixed(1)}" height="${h.toFixed(1)}" rx="2.5"/>`;
    if (d === 1 || d % 7 === 1) bars += `<text x="${(i * bw + bw / 2).toFixed(1)}" y="${H - 6}" text-anchor="middle">${d}</text>`;
  });
  if (isCurMonth(mk) && lastDay < n) bars += `<rect x="${(lastDay * bw).toFixed(1)}" y="${top}" width="${(Wd - lastDay * bw).toFixed(1)}" height="${base - top}" fill="var(--surface-2)" opacity=".55" rx="6"/><text x="${((lastDay * bw + Wd) / 2).toFixed(1)}" y="${(base + top) / 2}" text-anchor="middle">belum terjadi</text>`;
  const ay = y(avg).toFixed(1);
  return `<svg viewBox="0 0 ${Wd} ${H}"><line class="grid" x1="0" x2="${Wd}" y1="${base}" y2="${base}"/>${bars}${st.out ? `<line class="avg" x1="0" x2="${Wd}" y1="${ay}" y2="${ay}"/><text x="${Wd}" y="${(Number(ay) - 4).toFixed(1)}" text-anchor="end">rata-rata ${shortTxt(avg)}</text>` : ''}</svg>`;
}
function trendChart(months) {
  const Wd = 320, H = 140, base = 112, top = 14, data = months.map((mk) => { const s = stats(TX(), mk); return { mk, inc: s.inc, out: s.out }; });
  const max = Math.max(...data.map((d) => Math.max(d.inc, d.out)), 1), gw = Wd / Math.max(data.length, 1), bw = Math.min(gw * 0.26, 34); let g = '';
  data.forEach((d, i) => {
    const x = i * gw + gw / 2, hi = (d.inc / max) * (base - top), ho = (d.out / max) * (base - top);
    g += `<rect class="b-in tb" style="--i:${i * 4}" x="${(x - bw - 2).toFixed(1)}" y="${(base - hi).toFixed(1)}" width="${bw.toFixed(1)}" height="${hi.toFixed(1)}" rx="4"/><rect class="b-out tb" style="--i:${i * 4 + 2}" x="${(x + 2).toFixed(1)}" y="${(base - ho).toFixed(1)}" width="${bw.toFixed(1)}" height="${ho.toFixed(1)}" rx="4"/>`;
    if (d.inc) g += `<text x="${(x - bw / 2 - 2).toFixed(1)}" y="${(base - hi - 4).toFixed(1)}" text-anchor="middle">${shortTxt(d.inc)}</text>`;
    if (d.out) g += `<text x="${(x + bw / 2 + 2).toFixed(1)}" y="${(base - ho - 4).toFixed(1)}" text-anchor="middle">${shortTxt(d.out)}</text>`;
    const m = Number(d.mk.slice(5)); g += `<text x="${x.toFixed(1)}" y="${H - 8}" text-anchor="middle" style="fill:${S.mk === d.mk ? 'var(--ink)' : 'var(--ink-3)'}">${BLN[m - 1]}${isCurMonth(d.mk) ? ' (berjalan)' : ''}</text>`;
  });
  return `<svg viewBox="0 0 ${Wd} ${H}"><line class="grid" x1="0" x2="${Wd}" y1="${base}" y2="${base}"/>${g}</svg>`;
}
function insights(mk, st, months) {
  const out = [], idx = months.indexOf(mk), cur = isCurMonth(mk);
  if (st.inc) {
    const rate = (st.inc - st.out) / st.inc;
    out.push({ c: rate >= 0.2 ? '#10B981' : rate >= 0.1 ? '#F0A010' : '#F43F5E', i: 'piggy-bank', t: `Rasio tabungan ${pct(rate)}`, d: rate >= 0.2 ? 'Di atas patokan aman 20% dari pemasukan. Pertahankan ritme ini.' : 'Masih di bawah patokan 20%. Lihat kategori terbesar untuk mencari ruang hemat.' });
  }
  const top = Object.entries(st.byCat).sort((a, b) => b[1] - a[1])[0];
  if (top) out.push({ c: CATS[top[0]].c, i: CATS[top[0]].i, t: `${CATS[top[0]].n} menyerap ${pct(top[1] / st.out)}`, d: `${rp(top[1])} di bulan ini. Kategori inilah yang paling menentukan sisa uang Anda.` });
  if (cur && idx > 0) {
    const day = Number(T().slice(8)), prevFull = stats(TX(), months[idx - 1]).out, prevSame = stats(TX(), months[idx - 1], day).out;
    if (prevFull > 0) {
      const proj = st.out + Math.max(0, prevFull - prevSame);
      const cmp = prevSame > 0 ? ` Pengeluaran 1–${day} ${BLN[Number(mk.slice(5)) - 1]} ${st.out >= prevSame ? 'lebih tinggi' : 'lebih rendah'} ${pct(Math.abs(st.out - prevSame) / prevSame)} dari periode yang sama bulan lalu.` : '';
      out.push({ c: '#3D8BFF', i: 'trending-up', t: `Perkiraan akhir bulan ${rp(proj)}`, d: `Memakai pola sisa bulan lalu.${cmp}` });
    }
  }
  const full = months.filter((k) => !isCurMonth(k)).slice(-3).map((k) => stats(TX(), k).out).filter((v) => v > 0);
  if (full.length) {
    const avgOut = full.reduce((a, b) => a + b, 0) / full.length, months2 = totalBalance() / avgOut;
    out.push({ c: '#8B5CF6', i: 'shield-check', t: `Dana darurat cukup ${Math.max(0, months2).toFixed(1).replace('.', ',')} bulan`, d: `Patokan umum: 3–6 kali pengeluaran bulanan (rata-rata ${rp(avgOut)}).`, prog: Math.max(0, Math.min(1, months2 / 6)) });
  }
  if (!out.length) return '<div class="empty">Catatan muncul setelah ada pemasukan dan pengeluaran tercatat.</div>';
  return out.map((x) => `<div class="insight"><span class="ic" style="--c:${x.c}"><i data-lucide="${x.i}"></i></span><div style="flex:1;min-width:0"><b>${x.t}</b><p>${x.d}</p>${x.prog != null ? `<div class="prog" style="--c:${x.c}"><i style="width:${x.prog * 100}%"></i></div>` : ''}</div></div>`).join('');
}
function vRekap(swap) {
  const months = monthList(TX(), T());
  if (!S.mk || !months.includes(S.mk)) S.mk = months[months.length - 1];
  const mk = S.mk, idx = months.indexOf(mk), st = stats(TX(), mk), parts = Object.entries(st.byCat).map(([k, v]) => ({ k, v })).sort((a, b) => b.v - a.v);
  let note = 'Ketuk batang untuk melihat nominal harian.';
  if (S.selDay && S.selDay.startsWith(mk)) note = `<b>${dayLabel(S.selDay, T())}</b> · ${money(st.byDay[S.selDay] || 0)} dari ${TX().filter((t) => t.date === S.selDay && t.type === 'out').length} transaksi`;
  return `<div class="inner">
  <header class="top"><h2 class="title">Rekap</h2>
    <div class="month-sw"><button data-a="month" data-d="-1" ${idx <= 0 ? 'disabled' : ''} aria-label="Bulan sebelumnya"><i data-lucide="chevron-left"></i></button><span>${monthName(mk)}</span><button data-a="month" data-d="1" ${idx >= months.length - 1 ? 'disabled' : ''} aria-label="Bulan berikutnya"><i data-lucide="chevron-right"></i></button></div>
  </header>
  <div class="${swap || ''}">
  <div class="tiles">
    <div class="tile in"><small>Masuk</small><b class="m" data-count="${st.inc}" data-fmt="short">${shortTxt(st.inc)}</b></div>
    <div class="tile out"><small>Keluar</small><b class="m" data-count="${st.out}" data-fmt="short">${shortTxt(st.out)}</b></div>
    <div class="tile"><small>Sisa</small><b class="m" data-count="${Math.abs(st.inc - st.out)}" data-fmt="short" data-pre="${st.inc - st.out < 0 ? '−' : ''}">${shortTxt(st.inc - st.out)}</b></div>
  </div>
  <div class="card"><h4>Ke mana uang pergi? <small>${parts.length ? 'ketuk warna' : ''}</small></h4>
    ${parts.length ? `<div class="donut-wrap">${donut(parts, st.out)}<div class="legend">${parts.map((p) => `<button data-a="drill" data-cat="${p.k}" style="--c:${CATS[p.k].c}"><i></i><span>${CATS[p.k].n}</span><em>${pct(p.v / st.out)}</em></button>`).join('')}</div></div>` : '<div class="empty">Belum ada pengeluaran di bulan ini.</div>'}</div>
  <div class="card chart"><h4>Pengeluaran harian <small>${st.n} transaksi</small></h4><div class="chart-note" id="daynote">${note}</div>${dailyChart(mk, st)}</div>
  <div class="card chart"><h4>Tren bulanan <span class="leg-inline"><span style="--c:var(--in)"><i></i>Masuk</span><span style="--c:var(--out)"><i></i>Keluar</span></span></h4>${trendChart(months.slice(Math.max(0, idx - 3), idx + 1))}</div>
  <div class="card"><h4>Catatan perencana keuangan</h4>${insights(mk, st, months)}</div>
  </div></div>`;
}
function vDrill() {
  const months = monthList(TX(), T()), mk = S.mk, { cat, sub } = S.drill, c = CATS[cat], st = stats(TX(), mk);
  const all = TX().filter((t) => t.type === 'out' && t.cat === cat && t.date.startsWith(mk)), list = sub ? all.filter((t) => t.sub === sub) : all;
  const tot = list.reduce((s, t) => s + t.amount, 0), catTot = all.reduce((s, t) => s + t.amount, 0), idx = months.indexOf(mk);
  let delta = '';
  if (idx > 0) {
    const prev = stats(TX(), months[idx - 1], isCurMonth(mk) ? Number(T().slice(8)) : 0), pv = sub ? prev.bySub[cat + '|' + sub] || 0 : prev.byCat[cat] || 0;
    if (pv) { const d = (tot - pv) / pv; delta = `<span class="delta"><i data-lucide="${d > 0 ? 'trending-up' : 'trending-down'}"></i>${d > 0 ? 'Naik' : 'Turun'} ${pct(Math.abs(d))} dari ${BLN[Number(months[idx - 1].slice(5)) - 1]}${isCurMonth(mk) ? ' (periode sama)' : ''}</span>`; }
  }
  const subs = c.subs.map((s) => ({ s, v: st.bySub[cat + '|' + s] || 0 })).filter((x) => x.v > 0).sort((a, b) => b.v - a.v), maxS = Math.max(...subs.map((x) => x.v), 1);
  return `<div class="page-band" style="--c:${c.c}">
    <div class="band-top"><button class="back" data-a="undrill" aria-label="Kembali"><i data-lucide="chevron-left"></i></button><div class="crumb"><button data-a="undrill">Rekap ${BLN[Number(mk.slice(5)) - 1]}</button><i data-lucide="chevron-right"></i>${sub ? `<button data-a="drillall">${c.n}</button><i data-lucide="chevron-right"></i><span>${esc(sub)}</span>` : `<span>${c.n}</span>`}</div></div>
    <div class="band-ic sa" style="--i:0"><i data-lucide="${c.i}"></i></div>
    <h2 class="sa" style="--i:1">${sub ? esc(sub) : c.n}</h2><div class="band-sub sa" style="--i:1">${st.out ? pct(tot / st.out) : '0%'} dari pengeluaran ${monthName(mk)} · geser ke kanan untuk kembali</div>
    <div class="band-total m sa" style="--i:2" data-count="${tot}">${rp(tot)}</div><div class="sa" style="--i:3">${delta}</div>
  </div>
  <div class="page-body">
    <div class="mini-stats sa" style="--i:3">
      <div class="tile"><small>Transaksi</small><b>${list.length}×</b></div>
      <div class="tile"><small>Rata-rata</small><b>${short(list.length ? tot / list.length : 0)}</b></div>
      <div class="tile"><small>Terbesar</small><b>${short(Math.max(0, ...list.map((t) => t.amount)))}</b></div>
    </div>
    ${subs.length > 1 || sub ? `<div class="sec-h sa" style="--i:4"><h3>Subkategori</h3><small>ketuk untuk menyaring</small></div><div class="card sa" style="--i:4;padding:8px">${subs.map((x, i) => `<button class="subrow ${sub === x.s ? 'on' : ''}" data-a="drillsub" data-sub="${esc(x.s)}" style="--c:${c.c};--i:${i}"><div class="r"><span>${esc(x.s)}</span><em>${money(x.v)} · ${pct(x.v / catTot)}</em></div><div class="trk"><i style="width:${(x.v / maxS) * 100}%"></i></div></button>`).join('')}</div>` : ''}
    <div class="sec-h sa" style="--i:5"><h3>Semua transaksi</h3><small>${list.length} item</small></div>
    <div class="sa" style="--i:5">${list.length ? grouped(sorted(list)) : '<div class="empty">Tidak ada transaksi.</div>'}</div>
  </div>`;
}

const STACK_GAP = 64, OPEN_GAP = 196;
function vDompet() {
  const ws = WL(), tot = totalBalance();
  const dots = () => Array.from({ length: 7 }, (_, j) => `<span style="--d:${j};--sx:${Math.round(Math.random() * 70 - 35)}px;--sy:${Math.round(-18 - Math.random() * 40)}px"></span>`).join('');
  const cards = ws.map((w, i) => {
    const on = S.wall || S.wsel === w.id;
    return `<button class="wcard${on ? ' shown' : ''}" data-a="wcard" data-id="${w.id}" style="--c:${w.color};--i:${i}">
    <div class="wc-top"><span><small>${w.group}</small>${esc(w.name)}</span><i data-lucide="${WALLET_ICON[w.group]}"></i></div>
    <div class="wc-chip"></div>
    <div class="wc-bot"><div><small>Saldo</small><b class="wc-bal"><span class="mask">${dots()}</span><span class="odo-w m" id="wb-${w.id}"></span></b></div><span class="wc-code">${w.no ? '•••• ' + esc(w.no) : esc(w.short)}</span></div></button>`;
  }).join('');
  return `<div class="inner ${S.wsel ? 'hide-sel' : ''}">
  <header class="top"><h2 class="title">Dompet</h2></header>
  <div class="wtotal"><span>Total di ${ws.length} dompet</span><b id="wtot" class="m${S.wall ? '' : ' masked'}" ${S.wall ? `data-count="${tot}"` : ''}>${S.wall ? rp(tot) : 'Rp ••••••'}</b></div>
  <button class="wall-tg${S.wall ? ' on' : ''}" data-a="wall"><span class="wt-ic"><i data-lucide="${S.wall ? 'eye' : 'eye-off'}"></i></span><span class="wt-lbl">${S.wall ? 'Sembunyikan semua saldo' : 'Tampilkan semua saldo'}</span><span class="wt-sw"></span></button>
  <div class="tip" style="margin:-6px 0 14px"><i data-lucide="arrow-down"></i>tarik kartu ke bawah untuk mengintip saldonya</div>
  <div class="wstack" id="wstack">${cards}</div>
  <div id="wdetail" class="wdetail"></div>
  <div class="books-sec">
    <button class="btn2 dash" data-a="walletNew"><i data-lucide="plus"></i>Tambah bank atau e-wallet</button>
    <div class="sec-h"><h3>Buku keuangan</h3><small>terpisah satu sama lain</small></div>
    <div class="books">
      <div class="book on"><span class="ic" style="--c:#13A894"><i data-lucide="user"></i></span><b>Pribadi</b><small>Aktif sekarang</small></div>
      <button class="book off" data-a="toast" data-msg="Buku Freelance diaktifkan saat Anda mulai freelance"><span class="ic" style="--c:#06B6D4"><i data-lucide="laptop"></i></span><b>Freelance</b><small>Aktifkan nanti</small></button>
      <button class="book off" data-a="toast" data-msg="Buku Usaha diaktifkan saat usaha Anda berjalan"><span class="ic" style="--c:#F0A010"><i data-lucide="store"></i></span><b>Usaha</b><small>Aktifkan nanti</small></button>
    </div>
  </div></div>`;
}
function walletDetail(k) {
  const mk = T().slice(0, 7), list = sorted().filter((t) => t.wallet === k || t.to === k);
  let inn = 0, out = 0;
  list.filter((t) => t.date.startsWith(mk)).forEach((t) => { if (t.type === 'in' || (t.type === 'tf' && t.to === k)) inn += t.amount; else out += t.amount; });
  const mon = BLN[Number(mk.slice(5)) - 1];
  return `<div class="mini-stats sa" style="--i:0;grid-template-columns:1fr 1fr"><div class="tile in"><small>Masuk ${mon}</small><b>${money(inn)}</b></div><div class="tile out"><small>Keluar ${mon}</small><b>${money(out)}</b></div></div>
  <div class="sec-h sa" style="--i:1"><h3>Riwayat terbaru</h3><small>${list.length} transaksi</small></div>
  <div class="sa" style="--i:2">${list.length ? grouped(list.slice(0, 15)) : '<div class="empty">Belum ada transaksi di dompet ini.</div>'}</div>
  <div class="btn-row sa" style="--i:3"><button class="btn2" data-a="walletEdit" data-id="${k}"><i data-lucide="pencil"></i>Ubah dompet</button><button class="btn2" data-a="wclose"><i data-lucide="layers"></i>Ke tumpukan</button></div>`;
}
function cardEl(k) { return document.querySelector(`.wcard[data-id="${k}"]`); }
function showCard(k, delay) { setTimeout(() => { const c = cardEl(k); if (!c) return; c.classList.remove('hiding'); c.classList.add('shown'); c.classList.remove('shine'); void c.offsetWidth; c.classList.add('shine'); setOdo($('wb-' + k), bal(k)); }, delay || 0); }
function hideCard(k, delay) { setTimeout(() => { const c = cardEl(k); if (!c || S.wall || S.wsel === k || S.peekDrag === k) return; c.classList.remove('shown'); c.classList.add('hiding'); odoZero($('wb-' + k), bal(k)); }, delay || 0); }
function initCards() { WL().forEach((w) => { const el = $('wb-' + w.id); if (!el) return; if (S.wall || S.wsel === w.id) setOdo(el, bal(w), true); else odoZero(el, bal(w), true); }); }
function layoutStack(gap) {
  const st = $('wstack'); if (!st) return; const cards = [...st.children], sel = S.wsel, GAP = gap || (S.wall ? OPEN_GAP : STACK_GAP);
  if (!sel) { cards.forEach((c, i) => { c.style.transform = `translateY(${i * GAP}px)`; c.style.opacity = '1'; c.style.pointerEvents = ''; }); st.style.height = (cards.length ? (cards.length - 1) * GAP + 184 : 0) + 'px'; $('wdetail').innerHTML = ''; }
  else {
    let j = 0;
    cards.forEach((c) => { if (c.dataset.id === sel) { c.style.transform = 'translateY(0) scale(1.02)'; c.style.opacity = '1'; } else { c.style.transform = `translateY(${560 + j * 18}px) scale(.88) rotate(${j % 2 ? 3 : -3}deg)`; c.style.opacity = '0'; c.style.pointerEvents = 'none'; j++; } });
    st.style.height = '196px'; $('wdetail').innerHTML = walletDetail(sel); icons();
  }
}
let stackRaf = null;
function peekLayout(i, d) {
  const st = $('wstack'), G = S.wall ? OPEN_GAP : STACK_GAP, n = st.children.length, t = Math.min(d, 130) / 130;
  [...st.children].forEach((c, j) => {
    c.style.transition = 'none'; const y = j * G;
    if (j === i) c.style.transform = `perspective(900px) translateY(${y + d * 0.12}px) scale(${1 + t * 0.03}) rotateX(${-t * 7}deg)`;
    else c.style.transform = `translateY(${j > i ? y + d : y}px)`;
  });
  st.style.height = (n - 1) * G + 184 + (i < n - 1 ? d : d * 0.12) + 'px';
}
function bindStack() {
  const st = $('wstack'); if (!st) return;
  drag(st, {
    start(s) { cancelAnimationFrame(stackRaf); if (S.wsel) return false; const c = s.target.closest('.wcard'); if (!c) return false; s.k = c.dataset.id; s.i = [...st.children].indexOf(c); s.sc = PANELS[2].scrollTop; },
    move(s, e) {
      if (!s.lock) { const ax = Math.abs(s.dx), ay = Math.abs(s.dy); if (ax < 6 && ay < 6) return; s.lock = ax > ay ? 'h' : s.dy > 0 ? 'peek' : 'scroll'; }
      if (s.lock === 'scroll') { if (e.cancelable) e.preventDefault(); PANELS[2].scrollTop = s.sc - s.dy; }
      if (s.lock === 'peek') { if (e.cancelable) e.preventDefault(); const d = rubber(Math.max(0, s.dy), 200); peekLayout(s.i, d); if (d > 60 && !s.shown) { s.shown = true; S.peekDrag = s.k; showCard(s.k); } }
    },
    end(s) {
      if (s.lock === 'peek' || s.lock === 'scroll') markDragged();
      if (s.lock === 'peek') { S.peekDrag = null; [...st.children].forEach((c) => (c.style.transition = '')); layoutStack(); if (s.shown) hideCard(s.k, 120); }
      if (s.lock === 'scroll') { let v = -s.vy * 16; const p = PANELS[2]; const step = () => { p.scrollTop += v; v *= 0.94; if (Math.abs(v) > 0.4) stackRaf = requestAnimationFrame(step); }; stackRaf = requestAnimationFrame(step); }
    },
  });
}

function vLainnya() {
  const kw = Object.entries(store.data.learned), set = store.data.settings;
  return `<div class="inner">
  <header class="top"><h2 class="title">Lainnya</h2></header>
  <div class="card"><h4>Profil</h4>
    <button class="set-row" data-a="rename"><span class="ic" style="--c:#13A894"><i data-lucide="user"></i></span><div class="t"><b>${esc(set.name || 'Tanpa nama')}</b><small>Nama sapaan di Beranda · ketuk untuk mengubah</small></div><i data-lucide="chevron-right"></i></button></div>
  <div class="card"><h4>Cadangan data <span class="status">${S.persisted ? 'Penyimpanan permanen aktif' : 'Di perangkat ini'}</span></h4>
    <p class="about" style="margin:0 0 4px">Semua data tersimpan di perangkat ini. Cadangan online otomatis hadir di Tahap 2; sampai saat itu, ekspor cadangan secara rutin, misalnya seminggu sekali, lalu simpan di Files atau Google Drive.</p>
    <div class="btn-row"><button class="btn2" data-a="backup"><i data-lucide="download"></i>Ekspor cadangan</button><button class="btn2" data-a="restore"><i data-lucide="upload"></i>Pulihkan dari file</button></div>
    <input type="file" id="restoreFile" accept="application/json,.json" hidden></div>
  <div class="card"><h4>Tampilan</h4>
    <div class="seg" id="themeSeg"><span class="pill"></span>${[['system', 'Sistem', 'monitor-smartphone'], ['light', 'Terang', 'sun'], ['dark', 'Gelap', 'moon']].map(([k, l, i]) => `<button class="${set.theme === k ? 'on' : ''}" data-a="theme" data-t="${k}"><i data-lucide="${i}"></i>${l}</button>`).join('')}</div></div>
  <div class="card"><h4>Kata kunci yang dipelajari</h4>
    <p class="about" style="margin:0">${kw.length ? 'Ketuk untuk melupakan satu kata kunci.' : 'Belum ada. Saat mencatat lewat kalimat, ganti kategori di pratinjau; aplikasi akan mengingatnya.'}</p>
    ${kw.length ? `<div class="kw">${kw.map(([w, v]) => `<button data-a="unlearn" data-w="${esc(w)}" style="--c:${CATS[v.cat]?.c || '#94A3B8'}">${esc(w)} → ${CATS[v.cat]?.n || v.cat}<i data-lucide="x"></i></button>`).join('')}</div>` : ''}</div>
  <div class="card"><h4>Data</h4>
    <button class="set-row danger-row" data-a="wipe"><span class="ic" style="--c:#F43F5E"><i data-lucide="trash-2"></i></span><div class="t"><b>Hapus semua data</b><small>Transaksi, dompet, dan pengaturan di perangkat ini</small></div></button></div>
  <div class="card about"><h4>Tentang</h4>Do it Dip 0.1 · Tahap 1. ${TX().length.toLocaleString('id-ID')} transaksi tersimpan. Berikutnya: cadangan online otomatis, impor mutasi bank, foto struk, anggaran, dan rekap kilat.</div></div>`;
}
function placePill(seg) { if (!seg) return; const on = seg.querySelector('button.on'), pill = seg.querySelector('.pill'); if (!on || !pill) return; pill.style.width = on.offsetWidth + 'px'; pill.style.transform = `translateX(${on.offsetLeft - 4}px)`; }

/* ================= panels: render + stacked "deck" ================= */
let PANELS = [];
const VIEWS = [vHome, vRekap, vDompet, vLainnya];
function renderPanel(i, arg) {
  const p = PANELS[i]; p.innerHTML = VIEWS[i](arg);
  if (i === 0) {
    setOdo($('odo'), S.dispTotal, true); bindHero();
    if (!store.data.settings.lpLearned) { const t = p.querySelector('.list .tx'); if (t) t.insertAdjacentHTML('beforeend', '<span class="lp-hint"><i data-lucide="pointer"></i>Tahan</span>'); }
  }
  if (i === 2) { layoutStack(); initCards(); bindStack(); }
  if (i === 3) placePill($('themeSeg'));
}
function renderAll() { for (let i = 0; i < 4; i++) renderPanel(i); icons(); }
function refresh() { S.dispTotal = totalBalance(); renderAll(); setOdo($('odo'), S.dispTotal, true); if (S.drill) rerenderDrill(); renderDesk(); }
function onPhoneShown() { tabCenters = []; refresh(); requestAnimationFrame(() => { measureTabs(); moveInd(S.pos); placePill($('themeSeg')); }); }
function playPanel(i) {
  const p = PANELS[i]; p.classList.remove('pre'); p.classList.remove('play'); void p.offsetWidth; p.classList.add('play');
  p.querySelectorAll('[data-count]').forEach(countUp);
  if (!reduced()) p.querySelectorAll('.seg[data-len]').forEach((s, j) => { const len = Number(s.dataset.len), C = Number(s.dataset.c); s.animate([{ strokeDasharray: `0 ${C}` }, { strokeDasharray: `${len} ${C}` }], { duration: 800, delay: 150 + j * 80, easing: 'cubic-bezier(.3,.9,.3,1)', fill: 'backwards' }); });
  if (i === 3) placePill($('themeSeg'));
}
let tabCenters = [];
function measureTabs() { const tb = $('tabbar'), r = tb.getBoundingClientRect(); tabCenters = [...tb.querySelectorAll('.tab')].map((b) => { const q = b.getBoundingClientRect(); return q.left + q.width / 2 - r.left; }); }
function moveInd(p) {
  if (!tabCenters.length || !tabCenters[0]) measureTabs();
  const lo = Math.max(0, Math.min(3, Math.floor(p))), hi = Math.min(3, lo + 1), f = Math.max(0, Math.min(1, p - lo));
  const x = tabCenters[lo] + (tabCenters[hi] - tabCenters[lo]) * f, stretch = Math.sin(f * Math.PI), w = 54 + stretch * (Math.abs(tabCenters[hi] - tabCenters[lo]) * 0.55);
  const ind = $('ind'); ind.style.width = w + 'px'; ind.style.transform = `translateX(${x - w / 2}px) scaleY(${1 - stretch * 0.18})`;
  const near = Math.round(Math.max(0, Math.min(3, p))); document.querySelectorAll('.tab').forEach((b, i) => b.classList.toggle('on', i === near));
}
function setPos(p) {
  S.pos = p;
  for (let i = 0; i < 4; i++) {
    const d = i - p, el = PANELS[i];
    if (d >= 1 || d <= -1) { el.style.visibility = 'hidden'; el.style.transform = `translate3d(${d > 0 ? 100 : -35}%,0,0)`; el.classList.remove('peek'); continue; }
    el.style.visibility = 'visible';
    if (d <= 0) { const a = -d; el.style.transform = `translate3d(${-a * 35}%,0,0) scale(${1 - a * 0.1})`; el.style.opacity = String(1 - a * 0.55); el.style.borderRadius = a * 36 + 'px'; el.style.zIndex = '1'; el.classList.remove('peek'); }
    else { el.style.transform = `translate3d(${d * 100}%,0,0)`; el.style.opacity = '1'; el.style.borderRadius = Math.min(d * 5, 1) * 36 + 'px'; el.style.zIndex = '2'; el.classList.add('peek'); }
  }
  moveInd(p);
}
let springRaf = null;
function springTo(target, v0) {
  cancelAnimationFrame(springRaf);
  if (reduced()) { setPos(target); arrive(target); return; }
  let p = S.pos, v = v0 || 0, last = performance.now();
  const step = (now) => {
    const dt = Math.min(32, now - last) / 1000; last = now; const a = 230 * (target - p) - 26 * v; v += a * dt; p += v * dt;
    if (Math.abs(target - p) < 0.0006 && Math.abs(v) < 0.02) { setPos(target); arrive(target); return; }
    setPos(p); springRaf = requestAnimationFrame(step);
  };
  springRaf = requestAnimationFrame(step);
}
function arrive(i) { if (i !== S.idx) { const old = S.idx; S.idx = i; PANELS[old].classList.remove('play'); PANELS[old].classList.add('pre'); playPanel(i); } }
function goTab(i, v0) { i = Math.max(0, Math.min(3, i)); if (!$('drill').hidden) closeDrill(true); springTo(i, v0); }

/* ================= gestures ================= */
function drag(el, h) {
  let st = null;
  const start = (x, y, e) => { st = { x0: x, y0: y, lx: x, ly: y, lt: performance.now(), vx: 0, vy: 0, dx: 0, dy: 0, lock: null, target: e.target }; if (h.start && h.start(st, e) === false) st = null; };
  const move = (x, y, e) => { if (!st) return; const now = performance.now(), dt = Math.max(1, now - st.lt); st.vx = 0.8 * ((x - st.lx) / dt) + 0.2 * st.vx; st.vy = 0.8 * ((y - st.ly) / dt) + 0.2 * st.vy; st.lx = x; st.ly = y; st.lt = now; st.dx = x - st.x0; st.dy = y - st.y0; h.move(st, e); };
  const end = (e) => { if (!st) return; const s = st; st = null; h.end(s, e); };
  el.addEventListener('touchstart', (e) => { if (e.touches.length > 1) return; const t = e.touches[0]; start(t.clientX, t.clientY, e); }, { passive: true });
  el.addEventListener('touchmove', (e) => { const t = e.touches[0]; move(t.clientX, t.clientY, e); }, { passive: false });
  el.addEventListener('touchend', end); el.addEventListener('touchcancel', end);
  el.addEventListener('mousedown', (e) => {
    if (e.button !== 0 || (e.sourceCapabilities && e.sourceCapabilities.firesTouchEvents)) return; start(e.clientX, e.clientY, e);
    const mm = (ev) => move(ev.clientX, ev.clientY, ev), up = (ev) => { window.removeEventListener('mousemove', mm); window.removeEventListener('mouseup', up); end(ev); };
    window.addEventListener('mousemove', mm); window.addEventListener('mouseup', up);
  });
}
function markDragged() { S.justDragged = true; setTimeout(() => (S.justDragged = false), 60); }
const rubber = (x, lim) => lim * (1 - Math.exp(-x / lim));
function relPt(cx, cy) { const p = app(), r = p.getBoundingClientRect(); return { x: cx - r.left - p.clientLeft, y: cy - r.top - p.clientTop }; }
function rel(el) { const r = el.getBoundingClientRect(); return relPt(r.left + r.width / 2, r.top + r.height / 2); }

function bindTrack() {
  drag($('track'), {
    start(st) { cancelLongPress(); cancelAnimationFrame(springRaf); st.p0 = S.pos; st.W = $('track').clientWidth; },
    move(st, e) {
      if (!st.lock) {
        const ax = Math.abs(st.dx), ay = Math.abs(st.dy); if (ax < 8 && ay < 8) return; cancelLongPress();
        if (ax > ay * 1.15 && !st.target.closest('.hscroll,.ex,textarea,input')) st.lock = 'h';
        else if (st.dy > 0 && ay > ax && Math.round(S.pos) === 0 && PANELS[0].scrollTop <= 0) st.lock = 'pull';
        else { st.lock = 'v'; if (Math.abs(S.pos - Math.round(S.pos)) > 0.001) springTo(Math.round(S.pos)); }
        if (st.lock !== 'v') app().classList.add('dragging');
      }
      if (st.lock === 'h') { if (e.cancelable) e.preventDefault(); let p = st.p0 - st.dx / st.W; if (p < 0) p = -rubber(-p, 0.25); if (p > 3) p = 3 + rubber(p - 3, 0.25); setPos(p); }
      if (st.lock === 'pull') {
        if (e.cancelable) e.preventDefault(); const d = rubber(Math.max(0, st.dy), 150); st.pd = d; const inner = PANELS[0].firstElementChild; inner.style.transform = `translateY(${d}px)`; inner.style.transition = 'none';
        const pl = $('pull'); pl.style.opacity = String(Math.min(1, d / 60)); pl.style.transform = `translateX(-50%) translateY(${d * 0.25}px) scale(${0.7 + Math.min(1, d / 90) * 0.3})`;
        const ready = d > 88; pl.classList.toggle('ready', ready); $('pullTxt').textContent = ready ? 'Lepaskan untuk mencatat' : 'Tarik untuk mencatat';
      }
    },
    end(st) {
      app().classList.remove('dragging');
      if (st.lock === 'h') { markDragged(); let t = Math.round(S.pos); const v = (-st.vx * 1000) / st.W; if (Math.abs(st.vx) > 0.35) t = st.vx < 0 ? Math.floor(st.p0) + 1 : Math.ceil(st.p0) - 1; t = Math.max(0, Math.min(3, t)); if (!$('drill').hidden) closeDrill(true); springTo(t, v); }
      if (st.lock === 'pull') {
        markDragged(); const inner = PANELS[0].firstElementChild; inner.style.transition = 'transform .55s var(--spring)'; inner.style.transform = '';
        const pl = $('pull'); pl.style.transition = 'all .3s'; pl.style.opacity = '0'; setTimeout(() => { pl.style.transition = ''; pl.classList.remove('ready'); }, 300);
        if (st.pd > 88) { const r = rel(pl); openComposer('kalimat', r.x, r.y); }
      }
    },
  });
}
function bindHero() {
  const h = $('hero'); if (!h) return;
  h.addEventListener('mousemove', (e) => { if (reduced()) return; const r = h.getBoundingClientRect(), px = (e.clientX - r.left) / r.width, py = (e.clientY - r.top) / r.height; h.style.transform = `perspective(700px) rotateY(${(px - 0.5) * 12}deg) rotateX(${-(py - 0.5) * 12}deg)`; h.style.setProperty('--gx', px * 100 + '%'); h.style.setProperty('--gy', py * 100 + '%'); h.style.setProperty('--go', '1'); });
  h.addEventListener('mouseleave', () => { h.style.transform = ''; h.style.setProperty('--go', '.6'); });
}

/* ================= drill page ================= */
function openDrill(cat, x, y) {
  S.drill = { cat, sub: null, ox: x, oy: y }; const pg = $('drill'); pg.innerHTML = vDrill(); pg.hidden = false; pg.scrollTop = 0; pg.style.transform = ''; icons();
  pg.querySelectorAll('[data-count]').forEach(countUp);
  if (reduced()) return;
  const r = Math.hypot(Math.max(x, pg.clientWidth - x), Math.max(y, pg.clientHeight - y));
  pg.animate([{ clipPath: `circle(0px at ${x}px ${y}px)` }, { clipPath: `circle(${r}px at ${x}px ${y}px)` }], { duration: 620, easing: 'cubic-bezier(.65,0,.25,1)' });
}
function rerenderDrill() { const pg = $('drill'), st = pg.scrollTop; pg.innerHTML = vDrill(); icons(); pg.scrollTop = st; pg.querySelectorAll('.sa').forEach((e) => (e.style.animation = 'none')); }
function closeDrill(instant) {
  const pg = $('drill'); if (pg.hidden) return;
  if (instant || reduced() || !S.drill) { pg.hidden = true; S.drill = null; return; }
  const { ox, oy } = S.drill, r = Math.hypot(pg.clientWidth, pg.clientHeight);
  const a = pg.animate([{ clipPath: `circle(${r}px at ${ox}px ${oy}px)` }, { clipPath: `circle(0px at ${ox}px ${oy}px)` }], { duration: 460, easing: 'cubic-bezier(.65,0,.35,1)', fill: 'forwards' });
  onEnd(a, 460, () => { pg.hidden = true; S.drill = null; pg.style.transform = ''; a.cancel(); });
}
function bindDrill() {
  drag($('drill'), {
    start(st) { st.W = $('drill').clientWidth; },
    move(st, e) {
      if (!st.lock) { const ax = Math.abs(st.dx), ay = Math.abs(st.dy); if (ax < 8 && ay < 8) return; st.lock = st.dx > 0 && ax > ay * 1.2 ? 'h' : 'v'; }
      if (st.lock === 'h') { if (e.cancelable) e.preventDefault(); const pg = $('drill'); pg.style.transform = `translateX(${Math.max(0, st.dx)}px) scale(${1 - Math.min(0.08, (st.dx / st.W) * 0.12)})`; pg.style.borderRadius = Math.min(36, st.dx / 6) + 'px'; }
    },
    end(st) {
      if (st.lock !== 'h') return; markDragged(); const pg = $('drill');
      if (st.dx > st.W * 0.3 || st.vx > 0.5) { const a = pg.animate([{ transform: pg.style.transform }, { transform: `translateX(${st.W}px) scale(.9)` }], { duration: 280, easing: 'ease-in', fill: 'forwards' }); onEnd(a, 280, () => { pg.hidden = true; S.drill = null; pg.style.transform = ''; pg.style.borderRadius = ''; a.cancel(); }); }
      else { pg.style.transition = 'transform .4s var(--spring),border-radius .4s'; pg.style.transform = ''; pg.style.borderRadius = ''; setTimeout(() => (pg.style.transition = ''), 400); }
    },
  });
}

/* ================= composer ================= */
const MODES = [['kalimat', 'Kalimat', 'sparkles'], ['manual', 'Manual', 'keyboard'], ['struk', 'Struk', 'camera'], ['impor', 'Impor', 'file-spreadsheet']];
function composerHTML() {
  const edit = !!S.editId;
  return `<div class="co-head"><div class="co-row"><h3>${edit ? 'Ubah transaksi' : 'Catat transaksi'}</h3><button class="icon-btn" data-a="close" aria-label="Tutup"><i data-lucide="x"></i></button></div>
  ${edit ? '' : `<div class="modes" id="modes"><span class="pill"></span>${MODES.map(([k, l, i]) => `<button class="${S.mode === k ? 'on' : ''}" data-a="mode" data-mode="${k}"><i data-lucide="${i}"></i>${l}</button>`).join('')}</div>`}</div>
  <div class="co-body" id="cobody"><div id="modebody">${modeHTML()}</div></div>`;
}
const modeHTML = () => (S.mode === 'kalimat' ? mKalimat() : S.mode === 'manual' ? mManual() : S.mode === 'struk' ? mStruk() : mImpor());
function placeModePill() { const i = MODES.findIndex((m) => m[0] === S.mode), pill = document.querySelector('#modes .pill'); if (pill) pill.style.transform = `translateX(calc(${i * 100}% + ${i * 4}px))`; }
function openComposer(mode, x, y) {
  closeSheet(true); S.mode = mode; if (mode === 'manual' && !S.editId) S.m = S.m && S.m.amt ? S.m : newManual();
  const c = $('composer'); c.innerHTML = composerHTML(); c.hidden = false; icons(); placeModePill(); afterModeRender();
  S.co = { x, y };
  const focus = () => { const n = $('nl'); if (n) n.focus({ preventScroll: true }); };
  if (reduced()) { if (mode === 'kalimat') later(50, focus); return; }
  const ph = app(), Wd = ph.clientWidth, H = ph.clientHeight, R = Math.hypot(Math.max(x, Wd - x), Math.max(y, H - y)), blobs = [];
  ['#BFF5E8', '#2CC4AB', '#0B7C8A'].forEach((col, i) => {
    const b = document.createElement('div'), s = R * 2.4; b.className = 'splash'; b.style.cssText = `left:${x}px;top:${y}px;width:${s}px;height:${s}px;background:${col}`; ph.appendChild(b); blobs.push(b);
    b.animate([{ transform: 'translate(-50%,-50%) scale(0) rotate(0deg)', borderRadius: '38% 62% 63% 37% / 41% 44% 56% 59%' }, { transform: 'translate(-50%,-50%) scale(.45) rotate(80deg)', borderRadius: '63% 37% 37% 63% / 58% 62% 38% 42%', offset: 0.45 }, { transform: 'translate(-50%,-50%) scale(1) rotate(160deg)', borderRadius: '50%' }], { duration: 640, delay: i * 90, easing: 'cubic-bezier(.55,0,.2,1)', fill: 'both' });
  });
  sparks(x, y);
  const fab = $('fab'); if (fab) fab.animate([{ transform: 'translateY(-14px) rotate(-6deg)' }, { transform: 'translateY(-14px) rotate(135deg) scale(.6)' }], { duration: 420, easing: 'cubic-bezier(.3,1.4,.5,1)' });
  const a = c.animate([{ clipPath: `circle(0px at ${x}px ${y}px)` }, { clipPath: `circle(${R}px at ${x}px ${y}px)` }], { duration: 520, delay: 330, easing: 'cubic-bezier(.65,0,.25,1)', fill: 'backwards' });
  onEnd(a, 850, () => blobs.forEach((b) => b.remove()));
  [...c.querySelectorAll('.co-row,.modes'), ...$('modebody').children].forEach((p, i) => p.animate([{ transform: 'translateY(50px) scale(.92)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 700, delay: 520 + i * 65, easing: 'cubic-bezier(.16,1,.3,1)', fill: 'backwards' }));
  if (mode === 'kalimat') later(820, focus);
}
function sparks(x, y) { if (reduced()) return; const ph = app(); for (let i = 0; i < 16; i++) { const s = document.createElement('span'); s.className = 'burst'; const a = (i / 16) * Math.PI * 2, r = 90 + Math.random() * 90; s.style.cssText = `left:${x}px;top:${y}px;background:#fff;width:6px;height:6px;border-radius:50%;--x:${Math.cos(a) * r}px;--y:${Math.sin(a) * r}px;box-shadow:0 0 10px #FFC93C`; ph.appendChild(s); setTimeout(() => s.remove(), 950); } }
function closeComposer(to) {
  const c = $('composer'); if (c.hidden) return; clearTimers(); stopType();
  const done = () => { c.hidden = true; c.innerHTML = ''; S.editId = null; };
  const { x, y } = to || S.co || { x: c.clientWidth / 2, y: c.clientHeight - 40 };
  if (reduced()) { done(); return; }
  const r = Math.hypot(Math.max(x, c.clientWidth - x), Math.max(y, c.clientHeight - y));
  const a = c.animate([{ clipPath: `circle(${r}px at ${x}px ${y}px)` }, { clipPath: `circle(0px at ${x}px ${y}px)` }], { duration: 440, easing: 'cubic-bezier(.65,0,.35,1)', fill: 'forwards' });
  onEnd(a, 440, () => { done(); a.cancel(); });
}
function switchMode(mode) {
  if (mode === S.mode) return; clearTimers(); stopType();
  const dir = MODES.findIndex((m) => m[0] === mode) > MODES.findIndex((m) => m[0] === S.mode) ? 1 : -1; S.mode = mode;
  if (mode === 'manual' && !S.m) S.m = newManual();
  document.querySelectorAll('#modes button').forEach((b) => b.classList.toggle('on', b.dataset.mode === mode)); placeModePill();
  const mb = $('modebody'); mb.style.setProperty('--dir', dir); mb.className = 'mode-out';
  setTimeout(() => { mb.innerHTML = modeHTML(); mb.className = 'mode-in'; icons(); afterModeRender(); $('cobody').scrollTop = 0; }, reduced() ? 0 : 150);
}
function rerenderMode() { const mb = $('modebody'); if (!mb) return; mb.className = ''; mb.innerHTML = modeHTML(); icons(); afterModeRender(); }
function afterModeRender() { document.querySelectorAll('#modebody .seg').forEach(placePill); if (S.mode === 'kalimat') { S.prevMarks = null; syncHL(); startType(); } }

/* ---------- Struk: photo → on-device OCR → editable expense ---------- */
const kwHit = (text) => { const t = ' ' + text.toLowerCase() + ' '; for (const w of t.match(/[a-z]+/g) || []) if (store.data.learned[w]) return store.data.learned[w]; for (const [re, c, s] of KW) if (re.test(t)) return { cat: c, sub: s }; return null; };
/** Shop name decides first (Indomaret → Belanja); a long item list is a shopping trip; otherwise look at the whole text. */
const receiptGuess = (res) => kwHit(res.merchant) || (res.items.length >= 3 ? { cat: 'belanja', sub: 'Kebutuhan harian' } : kwHit(res.lines.join(' '))) || { cat: 'belanja', sub: 'Kebutuhan harian' };
function mStruk() {
  const s = S.struk;
  if (s.phase === 'idle') return `<div class="drop"><span class="ic" style="--c:#E04BB5"><i data-lucide="receipt"></i></span><b>Foto struk belanja</b>
    <small>Total, nama toko, dan tanggal dibaca otomatis langsung di HP ini. Foto lurus, terang, dan seluruh struk masuk bingkai.</small>
    <div class="btn-row" style="width:100%"><label class="btn2 primaryish" for="strukCam"><i data-lucide="camera"></i>Foto struk</label><label class="btn2" for="strukPick"><i data-lucide="image-plus"></i>Dari galeri</label></div>
    <input type="file" id="strukCam" accept="image/*" capture="environment" hidden><input type="file" id="strukPick" accept="image/*" hidden>
    <small class="muted">Pemakaian pertama mengunduh pembaca teks ±5 MB (perlu internet). Setelah itu jauh lebih cepat.</small></div>`;
  if (s.phase === 'reading') return `<div class="st-img"><img src="${s.img}" alt="Foto struk"><div class="scan"></div></div>
    <div class="st-prog"><div class="bar"><i id="stProg" style="width:${Math.round((s.progress || 0) * 100)}%"></i></div><span id="stLbl">${esc(s.label || 'Menyiapkan…')}</span></div>`;
  if (s.phase === 'error') return `<div class="st-img small"><img src="${s.img}" alt="Foto struk"></div><div class="err-card"><i data-lucide="triangle-alert"></i><div><b>Struk belum terbaca</b><p>${esc(s.err)}</p></div></div>
    <div class="btn-row"><button class="btn2" data-a="stRetry"><i data-lucide="rotate-ccw"></i>Foto ulang</button><button class="btn2" data-a="mode" data-mode="manual"><i data-lucide="keyboard"></i>Isi manual</button></div>`;
  const f = s.form, r = s.res, c = CATS[f.cat];
  const wchips = WL().map((w) => `<button class="chip ${f.wallet === w.id ? 'on' : ''}" data-a="stset" data-k="wallet" data-v="${w.id}"><i data-lucide="${WALLET_ICON[w.group]}"></i>${esc(w.name)}</button>`).join('');
  return `<div class="st-done"><div class="st-img small"><img src="${s.img}" alt="Foto struk"></div><div><span class="type out">Pengeluaran</span><p class="muted" style="margin:6px 0 0">${r.total ? 'Periksa hasilnya, lalu simpan.' : '<b>Total tidak terbaca.</b> Isi nominalnya di bawah.'}</p></div></div>
  <span class="lab">Total</span><input class="field amt-field" id="stAmt" inputmode="numeric" value="${f.amount ? fmtN(f.amount) : ''}" placeholder="Rp0" autocomplete="off">
  <span class="lab">Catatan</span><input class="field" id="stNote" maxlength="60" value="${esc(f.note)}" autocomplete="off">
  <span class="lab">Tanggal</span><input class="field" type="date" id="stDate" value="${f.date}" max="${T()}">
  <span class="lab">Kategori</span><div class="hscroll">${OUT_CATS.map((k) => `<button class="chip cat ${f.cat === k ? 'on' : ''}" style="--c:${CATS[k].c}" data-a="stset" data-k="cat" data-v="${k}"><i data-lucide="${CATS[k].i}"></i>${CATS[k].n}</button>`).join('')}</div>
  <div class="hscroll">${c.subs.map((x) => `<button class="chip ${f.sub === x ? 'on' : ''}" data-a="stset" data-k="sub" data-v="${esc(x)}">${esc(x)}</button>`).join('')}</div>
  <span class="lab">Dibayar pakai</span><div class="hscroll">${wchips}</div>
  ${r.items.length ? `<details class="st-more"><summary>${r.items.length} barang terbaca</summary>${r.items.map((it) => `<div class="kv"><span>${esc(it.name)}</span><b>${rp(it.amount)}</b></div>`).join('')}</details>` : ''}
  <details class="st-more"><summary>Teks yang terbaca</summary><pre>${esc(r.lines.join('\n') || '(kosong)')}</pre></details>
  <button class="primary" data-a="saveStruk" ${f.amount ? '' : 'disabled'}><i data-lucide="check"></i>Simpan dari struk</button>
  <button class="btn2" style="width:100%;margin-top:8px;background:none" data-a="stRetry"><i data-lucide="rotate-ccw"></i>Foto struk lain</button>`;
}
async function startStruk(file) {
  S.struk = { phase: 'reading', img: URL.createObjectURL(file), progress: 0, label: 'Menyiapkan foto…' }; rerenderMode();
  const mine = S.struk;
  try {
    const img = await preprocess(file);
    const text = await recognize(img, (p, l) => { mine.progress = p; mine.label = l; const b = $('stProg'), lb = $('stLbl'); if (b) b.style.width = Math.round(p * 100) + '%'; if (lb) lb.textContent = l; });
    if (S.struk !== mine) return;
    const res = parseReceipt(text, T()), g = receiptGuess(res);
    if (!res.lines.length) throw new Error('empty');
    S.struk = { ...mine, phase: 'done', res, form: { amount: res.total || 0, note: res.merchant || 'Belanja', date: res.date || T(), cat: g.cat, sub: g.sub, wallet: defaults().cash } };
  } catch (e) {
    if (S.struk !== mine) return;
    S.struk = { ...mine, phase: 'error', err: !navigator.onLine ? 'Pemakaian pertama butuh internet untuk mengunduh pembaca teks. Sambungkan internet lalu coba lagi.' : 'Teksnya tidak terbaca. Coba foto lebih dekat, lurus, dan di tempat terang.' };
    console.error(e);
  }
  if (S.mode === 'struk' && !$('composer').hidden) rerenderMode();
}

/* ---------- Impor: bank statement file → reviewed transactions ---------- */
function impCtx() { return { source: S.imp.wallet, learned: store.data.learned, wallets: WL().map((w) => ({ id: w.id, aliases: w.aliases?.length ? w.aliases : [w.name.toLowerCase()], group: w.group })) }; }
function regroupImport() { const g = impCtx(); S.imp.rows.forEach((r) => { if (!r.manual) r.g = guessRow(r, g); r.dup = TX().some((t) => t.date === r.date && t.amount === r.amount && (t.wallet === S.imp.wallet || t.to === S.imp.wallet)); }); }
function mImpor() {
  const s = S.imp; if (!s.wallet || !WL().some((w) => w.id === s.wallet)) s.wallet = (WL().find((w) => w.group === 'Bank') || WL()[0])?.id;
  const head = `<span class="lab">Mutasi dari rekening</span><div class="hscroll">${WL().map((w) => `<button class="chip ${s.wallet === w.id ? 'on' : ''}" data-a="impWallet" data-v="${w.id}"><i data-lucide="${WALLET_ICON[w.group]}"></i>${esc(w.name)}</button>`).join('')}</div>`;
  const pickBtn = `<div class="btn-row" style="width:100%"><label class="btn2 primaryish" for="impFile"><i data-lucide="file-spreadsheet"></i>File mutasi</label><label class="btn2" for="impShot"><i data-lucide="image-plus"></i>Screenshot</label></div>
    <input type="file" id="impFile" accept=".csv,.txt,.xlsx,.pdf,text/csv,application/pdf,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" hidden><input type="file" id="impShot" accept="image/*" hidden>`;
  if (s.phase === 'idle') return head + `<div class="drop"><span class="ic" style="--c:#10B981"><i data-lucide="file-spreadsheet"></i></span><b>Impor mutasi rekening</b>
    <small><b>File mutasi:</b> CSV, Excel .xlsx, atau PDF dari aplikasi bank (misalnya PermataMobile X → Mutasi Transaksi → unduh PDF).<br><b>Screenshot:</b> untuk bank tanpa fitur unduh mutasi, tangkap layar riwayat transaksi di aplikasi bank.<br>Transaksi dikelompokkan otomatis dan bisa diperiksa sebelum disimpan. File hanya dibaca di HP ini.</small>${pickBtn}</div>`;
  if (s.phase === 'reading') return head + `<div class="drop"><span class="ic spin-ic" style="--c:#10B981"><i data-lucide="scan-line"></i></span><b>Membaca ${esc(s.fileName)}…</b><small id="impLbl"></small></div>`;
  if (s.phase === 'pw') return head + `<div class="drop"><span class="ic" style="--c:#F0A010"><i data-lucide="key-round"></i></span><b>File dikunci kata sandi</b>
    <small>${s.pwWrong ? '<b style="color:var(--out)">Kata sandi salah.</b> ' : ''}E-statement bank biasanya dikunci dengan tanggal lahir atau kata sandi dari email bank. Kata sandi hanya dipakai untuk membuka file ini dan tidak disimpan.</small>
    <input class="field" type="password" id="impPw" autocomplete="off" placeholder="Kata sandi file"><button class="btn2 primaryish" data-a="impPw">Buka file</button></div>`;
  if (s.phase === 'error') return head + `<div class="err-card"><i data-lucide="triangle-alert"></i><div><b>Mutasi belum terbaca</b><p>${esc(s.err)}</p></div></div>
    ${s.sample?.length ? `<details class="st-more" open><summary>Isi awal file (kirim ini ke pengembang agar formatnya didukung)</summary><pre>${esc(s.sample.join('\n'))}</pre></details>` : ''}<div style="height:10px"></div>${pickBtn}`;
  const on = s.rows.filter((r) => r.on), inn = on.filter((r) => r.g.type === 'in').reduce((a, r) => a + r.amount, 0), out = on.filter((r) => r.g.type === 'out').reduce((a, r) => a + r.amount, 0), dups = s.rows.filter((r) => r.dup).length;
  return head + `<div class="imp-sum"><div><b>${s.rows.length} transaksi terbaca</b><small>${esc(s.fileName)}${dups ? ` · ${dups} kemungkinan sudah tercatat (tidak dicentang)` : ''}</small></div>
    <div class="imp-tot"><span class="in">+${rp(inn)}</span><span class="out">−${rp(out)}</span></div></div>
    <div class="btn-row" style="margin:0 0 10px"><button class="btn2" data-a="impAll">Pilih semua</button><button class="btn2" data-a="impNone">Kosongkan</button></div>
    <div class="list imp-list">${s.rows.map((r, i) => {
      const g = r.g, lbl = g.type === 'tf' ? `Transfer → ${esc(W(g.to).name)}` : `${CATS[g.cat].n} · ${esc(g.sub)}`, col = g.type === 'tf' ? '#3D7BFF' : CATS[g.cat].c;
      return `<div class="imp-row ${r.on ? '' : 'off'}"><button class="cb ${r.on ? 'on' : ''}" data-a="impTog" data-i="${i}" aria-label="Pilih transaksi">${r.on ? '<i data-lucide="check"></i>' : ''}</button>
      <div class="mm"><small class="d">${dayLabel(r.date, T())}${r.dup ? ' · <b>sudah ada?</b>' : ''}</small><code>${esc(r.desc)}</code>
      <button class="chip cat sm ${s.pick === i ? 'on' : ''}" style="--c:${col}" data-a="impPick" data-i="${i}">${lbl}<i data-lucide="chevron-down"></i></button></div>
      <span class="amt ${g.type}">${g.type === 'in' ? '+' : g.type === 'out' ? '−' : ''}${rp(r.amount)}</span></div>
      ${s.pick === i ? `<div class="picker">${(r.type === 'in' ? IN_CATS : OUT_CATS).map((k) => `<button class="chip cat" style="--c:${CATS[k].c}" data-a="impSet" data-i="${i}" data-cat="${k}"><i data-lucide="${CATS[k].i}"></i>${CATS[k].n}</button>`).join('')}${r.type === 'out' ? WL().filter((w) => w.id !== s.wallet).map((w) => `<button class="chip" data-a="impSet" data-i="${i}" data-to="${w.id}"><i data-lucide="arrow-left-right"></i>Ke ${esc(w.name)}</button>`).join('') : ''}</div>` : ''}`;
    }).join('')}</div>
    <div style="height:12px"></div><button class="primary" data-a="impSave" ${on.length ? '' : 'disabled'}><i data-lucide="download"></i>Impor ${on.length} transaksi</button>
    <button class="btn2" style="width:100%;margin-top:8px;background:none" data-a="impReset"><i data-lucide="rotate-ccw"></i>Pilih file lain</button>`;
}
async function startImport(file, password) {
  S.imp = { ...S.imp, phase: 'reading', fileName: file.name, file, rows: [], pick: null }; rerenderMode();
  try {
    const ex = await extract(file, password, (p, l) => { const lb = $('impLbl'); if (lb) lb.textContent = `${l} ${Math.round(p * 100)}%`; }), year = Number(T().slice(0, 4));
    const rows = ex.kind === 'rows' ? rowsToStatement(ex.rows, year) : linesToStatement(ex.lines, year);
    if (!rows.length) { S.imp.phase = 'error'; S.imp.err = 'Belum ada transaksi yang bisa dibaca dari file ini. Formatnya mungkin berbeda dari yang dikenali.'; S.imp.sample = (ex.kind === 'rows' ? ex.rows.slice(0, 10).map((r) => r.join(' | ')) : ex.lines.slice(0, 14)); }
    else { S.imp.rows = rows.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0)).map((r) => ({ ...r, g: null, on: true, dup: false })); regroupImport(); S.imp.rows.forEach((r) => (r.on = !r.dup)); S.imp.phase = 'review'; }
  } catch (e) {
    if (e instanceof NeedPassword) { S.imp.phase = 'pw'; S.imp.pwWrong = e.wrong; }
    else { S.imp.phase = 'error'; S.imp.err = e?.message || 'File gagal dibaca.'; S.imp.sample = null; console.error(e); }
  }
  if (S.mode === 'impor' && !$('composer').hidden) { rerenderMode(); if (S.imp.phase === 'pw') later(100, () => $('impPw')?.focus()); }
}

const EXAMPLES = ['kopi susu 18rb gopay', 'makan siang 25rb', 'bensin 40rb tunai kemarin', 'gaji 5,2jt masuk sumsel', 'topup dana 100rb dari permata', 'token listrik 200rb', 'tarik tunai 300rb'];
function mKalimat() {
  return `<label class="lab" for="nl">Tulis seperti chat. Satu baris untuk satu transaksi.</label>
  <div class="nlbox"><div class="hl nlf" id="hl" aria-hidden="true"></div><textarea id="nl" class="nlf" rows="3" autocomplete="off" autocapitalize="off" spellcheck="false">${esc(S.nl)}</textarea></div>
  <div class="hl-legend"><span class="h-amt">nominal</span><span class="h-cat">kategori</span><span class="h-wal">dompet</span><span class="h-date">tanggal</span></div>
  <div class="ex hscroll">${EXAMPLES.map((e) => `<button data-a="ex" data-v="${esc(e)}">+ ${esc(e)}</button>`).join('')}</div>
  <div id="preview">${pvHTML()}</div>`;
}
function syncHL() { const hl = $('hl'), nl = $('nl'); if (!hl || !nl) return; nl.style.height = 'auto'; nl.style.height = Math.max(112, nl.scrollHeight + 3) + 'px'; const r = highlightHTML(nl.value, ctx(), S.prevMarks); S.prevMarks = r.seen; hl.innerHTML = r.html; hl.scrollTop = nl.scrollTop; }
let typeT = null;
function startType() {
  stopType(); if (!$('nl')) return; let ei = 0, ci = 0, del = false;
  const tick = () => { const nl = $('nl'); if (!nl) { stopType(); return; } const ex = EXAMPLES[ei]; if (!del) { ci++; if (ci > ex.length + 14) del = true; } else { ci -= 2; if (ci <= 0) { ci = 0; del = false; ei = (ei + 1) % EXAMPLES.length; } } nl.placeholder = 'mis. ' + ex.slice(0, Math.min(ci, ex.length)) + (ci <= ex.length && !del ? '▍' : ''); typeT = setTimeout(tick, del ? 28 : 70); };
  tick();
}
function stopType() { clearTimeout(typeT); typeT = null; }
function nlItems() {
  return parseText(S.nl, ctx()).map((p, i) => {
    const ov = S.nlOv[i];
    if (ov && ov.raw === p.raw) { if (ov.cat && p.type !== 'tf') { p.cat = ov.cat; p.sub = ov.sub; p.type = CATS[ov.cat].inc ? 'in' : 'out'; } if (ov.wallet) p.wallet = ov.wallet; }
    if (p.type === 'tf') p.note = tfNote(p);
    return p;
  });
}
const sigOf = (p) => ({ amt: p.amount, cat: p.cat + p.sub, wal: p.wallet + (p.to || ''), date: p.date });
function pvHTML() {
  const items = nlItems();
  if (!items.length) { S.lastSig = []; return `<div class="empty">Pratinjau muncul di sini saat Anda mengetik.<br>Kata yang dikenali langsung diberi warna.</div>`; }
  const ok = items.filter((p) => p.amount > 0).length;
  const html = `<div class="pv-list">${items.map((p, i) => {
    const prev = S.lastSig[i], sg = sigOf(p), pop = (k) => (prev && prev[k] !== sg[k] ? ' pop' : '');
    const tl = p.type === 'in' ? 'Pemasukan' : p.type === 'tf' ? 'Transfer' : 'Pengeluaran';
    const wchip = (id, a) => `<${a ? 'button' : 'span'} class="chip${pop('wal')}" ${a ? `data-a="pvwal" data-i="${i}"` : ''}><i data-lucide="${WALLET_ICON[W(id).group]}"></i>${esc(W(id).name)}</${a ? 'button' : 'span'}>`;
    let chips = '';
    if (p.type === 'tf') chips = `${wchip(p.wallet)}<i data-lucide="arrow-right" style="align-self:center;color:var(--ink-3)"></i>${wchip(p.to)}`;
    else { const c = CATS[p.cat]; chips = `<button class="chip cat${pop('cat')} ${S.nlPick === i ? 'on' : ''}" style="--c:${c.c}" data-a="pvcat" data-i="${i}"><i data-lucide="${c.i}"></i>${c.n} · ${esc(p.sub)}<i data-lucide="chevron-down"></i></button>${wchip(p.wallet, true)}`; }
    chips += `<span class="chip${pop('date')}"><i data-lucide="calendar"></i>${dayLabel(p.date, T())}</span>`;
    const pk = S.nlPick === i && p.type !== 'tf' ? `<div class="picker">${(p.type === 'in' ? IN_CATS.concat(OUT_CATS) : OUT_CATS.concat(IN_CATS)).map((k, j) => `<button class="chip cat" style="--c:${CATS[k].c};--i:${j}" data-a="pvset" data-i="${i}" data-cat="${k}"><i data-lucide="${CATS[k].i}"></i>${CATS[k].n}</button>`).join('')}</div>` : '';
    return `<div class="pv${prev ? '' : ' new'}"><div class="pv-top"><span class="type ${p.type}">${tl}</span><span class="pv-amt${p.amount ? '' : ' none'}${pop('amt')}">${p.amount ? (p.type === 'in' ? '+' : '') + rp(p.amount) : 'Nominal belum terbaca'}</span></div><div class="pv-note">${esc(p.note)}</div><div class="chips">${chips}</div>${pk}
      ${p.assumed ? `<div class="hint"><i data-lucide="info"></i>Angka tanpa satuan dibaca ribuan: ${rp(p.amount)}</div>` : ''}
      ${p.learned ? `<div class="hint learned"><i data-lucide="brain"></i>Kategori diingat dari koreksi Anda</div>` : ''}</div>`;
  }).join('')}</div>
  <button class="primary" data-a="saveNL" ${ok ? '' : 'disabled'}><i data-lucide="check"></i>Simpan ${ok > 1 ? ok + ' transaksi' : 'transaksi'}</button>`;
  S.lastSig = items.map(sigOf); return html;
}
function refreshPreview() { const pv = $('preview'); if (pv) { pv.innerHTML = pvHTML(); icons(); } }

function amtHTML() { const s = fmtN(Number(S.m.amt) || 0); return 'Rp' + [...s].map((ch, i) => `<span class="${i === s.length - 1 && S.m.amt && S.m.justTyped ? 'dig-in' : ''}">${ch}</span>`).join(''); }
function mManual() {
  const m = S.m, cats = m.type === 'in' ? IN_CATS : OUT_CATS, amt = Number(m.amt) || 0, today = T();
  const wchips = (key, sel) => WL().map((w) => `<button class="chip ${sel === w.id ? 'on' : ''}" data-a="mset" data-k="${key}" data-v="${w.id}"><i data-lucide="${WALLET_ICON[w.group]}"></i>${esc(w.name)}</button>`).join('');
  const quick = [[today, 'Hari ini'], [addDays(today, -1), 'Kemarin'], [addDays(today, -2), '2 hari lalu']];
  return `<div class="seg" id="typeSeg" style="margin-bottom:10px"><span class="pill"></span>${[['out', 'Pengeluaran'], ['in', 'Pemasukan'], ['tf', 'Transfer']].map(([k, l]) => `<button class="${m.type === k ? 'on' : ''}" data-a="mset" data-k="type" data-v="${k}">${l}</button>`).join('')}</div>
  <div class="amount-disp"><small>Nominal</small><div class="ad ${amt ? '' : 'zero'}" id="mamt">${amtHTML()}</div></div>
  ${m.type === 'tf' ? `<span class="lab">Dari</span><div class="hscroll">${wchips('wallet', m.wallet)}</div><span class="lab">Ke</span><div class="hscroll">${wchips('to', m.to)}</div>` :
  `<span class="lab">Kategori</span><div class="hscroll">${cats.map((k) => `<button class="chip cat ${m.cat === k ? 'on' : ''}" style="--c:${CATS[k].c}" data-a="mset" data-k="cat" data-v="${k}"><i data-lucide="${CATS[k].i}"></i>${CATS[k].n}</button>`).join('')}</div>
  <div class="hscroll">${CATS[m.cat].subs.map((s) => `<button class="chip ${m.sub === s ? 'on' : ''}" data-a="mset" data-k="sub" data-v="${esc(s)}">${esc(s)}</button>`).join('')}</div>
  <span class="lab">Dompet</span><div class="hscroll">${wchips('wallet', m.wallet)}</div>`}
  <span class="lab">Tanggal</span><div class="hscroll">${quick.map(([d, l]) => `<button class="chip ${m.date === d ? 'on' : ''}" data-a="mset" data-k="date" data-v="${d}"><i data-lucide="calendar"></i>${l}</button>`).join('')}</div>
  <input class="field" type="date" id="mdate" value="${m.date}" max="${today}" aria-label="Tanggal transaksi">
  <input class="note-in" id="mnote" placeholder="Catatan (opsional), misal: makan dengan tim" value="${esc(m.note)}" autocomplete="off">
  <div class="keypad">${['1', '2', '3', '4', '5', '6', '7', '8', '9', '000', '0', 'del'].map((k) => `<button data-a="key" data-k="${k}" aria-label="${k === 'del' ? 'Hapus angka' : k}">${k === 'del' ? '<i data-lucide="delete"></i>' : k}</button>`).join('')}</div>
  <button class="primary" id="saveM" data-a="saveM" ${amt ? '' : 'disabled'}><i data-lucide="check"></i>${S.editId ? 'Simpan perubahan' : 'Simpan'}</button>`;
}

/* ================= saving: coin comet into the balance card ================= */
function markFresh(list) { list.forEach((t) => { t.fresh = true; setTimeout(() => { t.fresh = false; }, 2000); }); }
function celebrate(text, type, fromEl, msg) {
  const from = fromEl ? rel(fromEl) : { x: app().clientWidth / 2, y: app().clientHeight * 0.6 };
  cancelAnimationFrame(springRaf); if (S.idx !== 0) { PANELS[S.idx].classList.remove('play'); PANELS[S.idx].classList.add('pre'); S.idx = 0; }
  closeDrill(true); renderAll(); setPos(0); playPanel(0); PANELS[0].scrollTop = 0;
  const to = rel($('odo'));
  closeComposer({ x: to.x, y: to.y });
  const label = type === 'out' && /^Rp/.test(text) ? '−' + text : text;
  const land = () => { S.dispTotal = totalBalance(); setOdo($('odo'), S.dispTotal); impact(to, label); toast(msg); };
  if (reduced()) { land(); return; }
  const ph = app(), f = document.createElement('div'); f.className = 'flyer ' + type; f.innerHTML = `<span class="ft">${esc(label)}</span><span class="fc">Rp</span>`; f.style.left = from.x + 'px'; f.style.top = from.y + 'px'; ph.appendChild(f);
  f.style.width = f.offsetWidth + 'px'; f.style.height = f.offsetHeight + 'px';
  f.animate([{ transform: 'translate(-50%,-50%) scale(.4)', opacity: 0 }, { transform: 'translate(-50%,-50%) scale(1.3)', opacity: 1, offset: 0.55 }, { transform: 'translate(-50%,-50%) scale(1) rotate(-4deg)', opacity: 1, offset: 0.8 }, { transform: 'translate(-50%,-50%) scale(1)', opacity: 1 }], { duration: 460, easing: 'ease-out', fill: 'forwards' });
  setTimeout(() => { f.classList.add('coin'); f.style.width = '54px'; f.style.height = '54px'; }, 430);
  setTimeout(() => { f.getAnimations().forEach((a) => a.cancel()); fly(f, from, to, land); }, 720);
}
function fly(f, from, to, done) {
  const dir = to.x >= from.x ? 1 : -1, p1 = { x: from.x - dir * 90, y: from.y - 170 }, p2 = { x: to.x + dir * 110, y: to.y - 230 };
  const B = (t, a, b, c, d) => { const u = 1 - t; return u * u * u * a + 3 * u * u * t * b + 3 * u * t * t * c + t * t * t * d; };
  const cols = ['#FFC93C', '#FFE08A', '#FFF3B0', '#7EE6D2'], t0 = performance.now(), dur = 900; let lt = 0;
  const step = (now) => {
    const k = Math.min(1, (now - t0) / dur), e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
    const x = B(e, from.x, p1.x, p2.x, to.x), y = B(e, from.y, p1.y, p2.y, to.y), sc = 1 - e * 0.5, spin = Math.cos(e * Math.PI * 5);
    f.style.left = x + 'px'; f.style.top = y + 'px'; f.style.transform = `translate(-50%,-50%) scale(${(sc * Math.max(0.12, Math.abs(spin))).toFixed(3)},${sc.toFixed(3)})`;
    if (now - lt > 14) { lt = now; for (let j = 0; j < 2; j++) { const s = document.createElement('span'); s.className = 'trail'; const sz = 4 + Math.random() * 9 * (1 - e * 0.4); s.style.cssText = `left:${x + (Math.random() - 0.5) * 16}px;top:${y + (Math.random() - 0.5) * 16}px;width:${sz}px;height:${sz}px;background:${cols[(Math.random() * cols.length) | 0]};box-shadow:0 0 8px #FFC93C`; f.parentNode.appendChild(s); setTimeout(() => s.remove(), 640); } }
    if (k < 1) requestAnimationFrame(step); else { f.remove(); done(); }
  };
  requestAnimationFrame(step);
}
function impact(p, label) {
  const ph = app();
  ['', 's2'].forEach((c) => { const r = document.createElement('span'); r.className = 'shock ' + c; r.style.left = p.x + 'px'; r.style.top = p.y + 'px'; ph.appendChild(r); setTimeout(() => r.remove(), 1000); });
  const h = $('hero'); if (h && !reduced()) h.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.06,.9)', offset: 0.2 }, { transform: 'scale(.97,1.05)', offset: 0.5 }, { transform: 'scale(1.01,.99)', offset: 0.75 }, { transform: 'scale(1)' }], { duration: 700, easing: 'ease-out' });
  if (!reduced()) {
    const fl = document.createElement('div'); fl.className = 'float-lbl'; fl.textContent = label; fl.style.left = p.x + 'px'; fl.style.top = p.y - 30 + 'px'; ph.appendChild(fl);
    fl.animate([{ transform: 'translate(-50%,-20%) scale(.6)', opacity: 0 }, { transform: 'translate(-50%,-80%) scale(1.05)', opacity: 1, offset: 0.25 }, { transform: 'translate(-50%,-240%) scale(1)', opacity: 0 }], { duration: 1600, easing: 'cubic-bezier(.2,.8,.3,1)' }).onfinish = () => fl.remove();
  }
  burst(p.x, p.y);
}
function burst(x, y) {
  if (reduced()) return; const ph = app(), cols = ['#13A894', '#0B7C8A', '#FFC93C', '#7EE6D2', '#3D8BFF', '#8B5CF6'];
  for (let i = 0; i < 28; i++) { const b = document.createElement('span'); b.className = 'burst'; const a = Math.random() * Math.PI * 2, r = 60 + Math.random() * 110; b.style.cssText = `left:${x}px;top:${y}px;background:${cols[i % cols.length]};--x:${Math.cos(a) * r}px;--y:${Math.sin(a) * r - 30}px;border-radius:${i % 2 ? '50%' : '3px'};width:${6 + Math.random() * 6}px;height:${6 + Math.random() * 6}px`; ph.appendChild(b); setTimeout(() => b.remove(), 950); }
}
let toastT;
function toast(msg, undo) {
  const el = $('toast'); el.innerHTML = `<i data-lucide="sparkles"></i><span>${esc(msg)}</span>${undo ? '<button class="undo" id="undoBtn">Urungkan</button>' : ''}`; icons();
  el.classList.remove('show'); void el.offsetWidth; el.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove('show'), undo ? 4500 : 2400);
  if (undo) $('undoBtn').onclick = () => { el.classList.remove('show'); undo(); };
}

/* ================= sheets ================= */
function openSheet(title, body) {
  const L = $('layer');
  L.innerHTML = `<div class="backdrop" data-a="close"></div><div class="sheet" role="dialog" aria-label="${esc(title)}"><div class="grabzone"><div class="grab"></div><div class="sheet-h"><h3>${esc(title)}</h3><button class="icon-btn" data-a="close" aria-label="Tutup"><i data-lucide="x"></i></button></div></div><div class="sheet-body">${body}</div></div>`; icons();
  const sh = L.querySelector('.sheet'), bd = L.querySelector('.backdrop');
  drag(L.querySelector('.grabzone'), {
    move(st, e) { if (e.cancelable) e.preventDefault(); const y = st.dy > 0 ? st.dy : -rubber(-st.dy, 30); sh.style.animation = 'none'; sh.style.transition = 'none'; sh.style.transform = `translateY(${y}px)`; bd.style.opacity = String(1 - Math.max(0, y) / sh.offsetHeight); },
    end(st) { if (Math.abs(st.dy) > 4) markDragged(); if (st.dy > 110 || st.vy > 0.6) closeSheet(); else { sh.style.transition = 'transform .45s var(--spring)'; sh.style.transform = ''; bd.style.transition = 'opacity .3s'; bd.style.opacity = '1'; } },
  });
}
function closeSheet(instant) {
  const L = $('layer'), sh = L.querySelector('.sheet,.peek-menu'); if (!sh) { L.innerHTML = ''; return; }
  if (instant || reduced()) { L.innerHTML = ''; return; }
  if (sh.classList.contains('sheet')) { sh.style.transition = 'transform .3s cubic-bezier(.5,0,.75,0)'; sh.style.transform = 'translateY(110%)'; }
  else { sh.style.transition = 'all .2s'; sh.style.opacity = '0'; sh.style.transform = 'scale(.8)'; }
  const bd = L.querySelector('.backdrop,.peek-bg'); if (bd) { bd.style.transition = 'opacity .3s'; bd.style.opacity = '0'; }
  setTimeout(() => { if (L.contains(sh)) L.innerHTML = ''; }, 300);
}
function sTx(id) {
  const t = TX().find((x) => x.id === id); if (!t) return; const c = catOf(t), w = W(t.wallet);
  openSheet('Detail transaksi', `<div class="det-top"><span class="ic" style="--c:${c.c}"><i data-lucide="${c.i}"></i></span><div class="a" style="color:${t.type === 'in' ? 'var(--in)' : t.type === 'tf' ? 'var(--transfer)' : 'var(--ink)'}">${t.type === 'in' ? '+' : t.type === 'out' ? '−' : ''}${money(t.amount)}</div><p>${esc(t.note)}</p></div>
  <div class="card" style="padding:4px 14px">
    <div class="kv" style="border-top:0"><span>Kategori</span><b>${t.type === 'tf' ? 'Transfer' : `${c.n} · ${esc(t.sub)}`}</b></div>
    <div class="kv"><span>${t.type === 'tf' ? 'Dari → Ke' : 'Dompet'}</span><b>${t.type === 'tf' ? `${esc(w.name)} → ${esc(W(t.to).name)}` : esc(w.name)}</b></div>
    <div class="kv"><span>Tanggal</span><b>${longDate(t.date)}</b></div>
    <div class="kv"><span>Buku</span><b>Pribadi</b></div></div>
  <div class="btn-row"><button class="btn2" data-a="edit" data-id="${t.id}"><i data-lucide="pencil"></i>Ubah</button><button class="btn2" data-a="dup" data-id="${t.id}"><i data-lucide="copy"></i>Duplikat hari ini</button></div>
  <button class="danger" data-a="del" data-id="${t.id}">Hapus transaksi</button>`);
}
function sBooks() {
  openSheet('Pilih buku', `<p class="confirm-text">Setiap buku punya catatan dan rekap sendiri, jadi uang pribadi tidak tercampur dengan freelance atau usaha.</p>
  <div class="list">
    <button class="tx" data-a="close"><span class="ic" style="--c:#13A894"><i data-lucide="user"></i></span><span class="tx-main"><b>Pribadi</b><small>Gaji dan pengeluaran harian</small></span><i data-lucide="check" style="color:var(--brand)"></i></button>
    <button class="tx" data-a="toast" data-msg="Buku Freelance diaktifkan saat Anda mulai freelance"><span class="ic" style="--c:#06B6D4"><i data-lucide="laptop"></i></span><span class="tx-main"><b>Freelance</b><small>Belum aktif</small></span><i data-lucide="lock" style="color:var(--ink-3)"></i></button>
    <button class="tx" data-a="toast" data-msg="Buku Usaha diaktifkan saat usaha Anda berjalan"><span class="ic" style="--c:#F0A010"><i data-lucide="store"></i></span><span class="tx-main"><b>Usaha</b><small>Belum aktif</small></span><i data-lucide="lock" style="color:var(--ink-3)"></i></button>
    <button class="tx" data-a="toast" data-msg="Buku bersama pasangan disiapkan untuk tahap berikutnya"><span class="ic" style="--c:#8B5CF6"><i data-lucide="users"></i></span><span class="tx-main"><b>Keluarga</b><small>Untuk nanti, bersama pasangan</small></span><i data-lucide="lock" style="color:var(--ink-3)"></i></button>
  </div>`);
}
function sConfirm(title, text, okLabel, fn) {
  S.confirmFn = fn;
  openSheet(title, `<p class="confirm-text">${text}</p><div class="btn-row"><button class="btn2" data-a="close">Batal</button><button class="btn2" style="color:#fff;background:var(--out)" data-a="confirmOk">${esc(okLabel)}</button></div>`);
}
function sRename() {
  openSheet('Nama sapaan', `<input class="field" id="renameIn" maxlength="24" value="${esc(store.data.settings.name)}" placeholder="Nama panggilan" autocomplete="off"><button class="primary" data-a="renameSave"><i data-lucide="check"></i>Simpan</button>`);
  later(350, () => $('renameIn')?.focus());
}
let WF = null;
function sWalletForm(id) {
  const w = id ? W(id) : null;
  WF = { id: w ? w.id : null, name: w ? w.name : '', group: w ? w.group : 'E-wallet', color: w ? w.color : WALLET_COLORS[store.data.wallets.length % WALLET_COLORS.length], no: w?.no || '', init: w ? String(w.init) : '' };
  const used = id ? TX().filter((t) => t.wallet === id || t.to === id).length : 0;
  openSheet(w ? 'Ubah dompet' : 'Tambah dompet', `
    <span class="lab">Nama</span><input class="field" id="wfName" maxlength="28" value="${esc(WF.name)}" placeholder="mis. BCA, OVO, Jenius" autocomplete="off">
    <span class="lab">Jenis</span><div class="seg" id="wfGroup" style="margin-bottom:12px"><span class="pill"></span>${['Bank', 'E-wallet', 'Tunai'].map((g) => `<button class="${WF.group === g ? 'on' : ''}" data-a="wfGroup" data-v="${g}">${g}</button>`).join('')}</div>
    <span class="lab">Warna kartu</span><div class="swatches">${WALLET_COLORS.map((c) => `<button class="${WF.color === c ? 'on' : ''}" style="--c:${c}" data-a="wfColor" data-v="${c}" aria-label="Warna ${c}"></button>`).join('')}</div>
    <span class="lab">4 digit terakhir (opsional)</span><input class="field" id="wfNo" inputmode="numeric" maxlength="4" value="${esc(WF.no)}" placeholder="mis. 4821" autocomplete="off">
    <span class="lab">Saldo awal</span><input class="field" id="wfInit" inputmode="numeric" value="${WF.init ? fmtN(Number(WF.init)) : ''}" placeholder="0" autocomplete="off">
    <p class="form-note">Saldo awal adalah saldo sebelum transaksi pertama yang Anda catat di aplikasi ini.</p>
    <button class="primary" data-a="wfSave"><i data-lucide="check"></i>Simpan dompet</button>
    ${w ? (used ? `<p class="form-note" style="margin-top:12px">Dompet ini dipakai di ${used} transaksi, jadi tidak bisa dihapus.</p>` : `<button class="danger" data-a="wfDelete" data-id="${w.id}">Hapus dompet</button>`) : ''}`);
  later(60, () => placePill($('wfGroup')));
}

/* ================= long-press peek ================= */
let lpT = null, lpEl = null;
function cancelLongPress() { clearTimeout(lpT); lpT = null; if (lpEl) { lpEl.classList.remove('pressing'); lpEl = null; } }
function startLongPress(el) { cancelLongPress(); lpEl = el; el.classList.add('pressing'); lpT = setTimeout(() => { const e = lpEl; cancelLongPress(); if (e) { S.justDragged = true; setTimeout(() => (S.justDragged = false), 400); openPeek(e); } }, 430); }
function openPeek(el) {
  if (!store.data.settings.lpLearned) store.setSetting('lpLearned', true);
  document.querySelectorAll('.lp-hint').forEach((h) => h.remove());
  const id = el.dataset.id; if (!TX().find((x) => x.id === id)) return;
  const p = app(), pr = p.getBoundingClientRect(), r = el.getBoundingClientRect(), x = r.left - pr.left - p.clientLeft, y = r.top - pr.top - p.clientTop, ph = p.clientHeight;
  const below = y + r.height + 190 < ph - 90, my = below ? y + r.height + 12 : y - 12 - 168;
  $('layer').innerHTML = `<div class="peek-bg" data-a="close"></div><div class="peek-row" style="left:${x}px;top:${y}px;width:${r.width}px">${el.outerHTML}</div>
  <div class="peek-menu" style="top:${my}px;transform-origin:${below ? 'top' : 'bottom'} center">
    <button data-a="pkDetail" data-id="${id}">Lihat detail<i data-lucide="eye"></i></button>
    <button data-a="dup" data-id="${id}">Duplikat untuk hari ini<i data-lucide="copy"></i></button>
    <button class="red" data-a="del" data-id="${id}">Hapus<i data-lucide="trash-2"></i></button></div>`;
  icons(); requestAnimationFrame(() => { const pr2 = document.querySelector('.peek-row'); if (pr2) pr2.style.transform = 'scale(1.05)'; });
}
function deleteTx(id) {
  closeSheet();
  document.querySelectorAll(`.tx[data-id="${id}"]`).forEach((r) => { r.style.maxHeight = r.offsetHeight + 'px'; void r.offsetWidth; r.classList.add('gone'); });
  setTimeout(() => {
    const t = store.deleteTx(id); if (!t) return; refresh();
    toast('Transaksi dihapus', () => { store.restoreTx(t); markFresh([t]); refresh(); });
  }, reduced() ? 0 : 340);
}

/* ================= theme (reveal measured inside the app frame) ================= */
function localPt(el) { const ph = app(); let x = el.offsetWidth / 2, y = el.offsetHeight / 2, e = el; while (e && e !== ph) { x += e.offsetLeft; y += e.offsetTop; e = e.offsetParent; } let p = el.parentElement; while (p && p !== ph) { x -= p.scrollLeft; y -= p.scrollTop; p = p.parentElement; } return { x, y }; }
function resolvedTheme() { const a = document.documentElement.getAttribute('data-theme'); if (a === 'dark' || a === 'light') return a; return window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'; }
function applyTheme(t) { if (t === 'system') document.documentElement.removeAttribute('data-theme'); else document.documentElement.setAttribute('data-theme', t); }
function setTheme(t, btn) {
  store.setSetting('theme', t);
  const done = () => { document.querySelectorAll('#themeSeg button').forEach((b) => b.classList.toggle('on', b.dataset.t === t)); placePill($('themeSeg')); };
  const before = resolvedTheme();
  if (reduced()) { applyTheme(t); done(); return; }
  const ph = app(), { x, y } = localPt(btn), sel = '.panel,.page,.co-body,.sheet-body';
  const scrolls = [...ph.querySelectorAll(sel)].map((e) => e.scrollTop);
  const snap = document.createElement('div'); snap.className = 'theme-snap force-' + before;
  [...ph.children].forEach((ch) => { if (ch.id !== 'toast' && !ch.classList.contains('theme-snap')) snap.appendChild(ch.cloneNode(true)); });
  ph.appendChild(snap);
  [...snap.querySelectorAll(sel)].forEach((e, i) => { e.scrollTop = scrolls[i] || 0; });
  snap.querySelectorAll('[id]').forEach((e) => e.removeAttribute('id'));
  applyTheme(t); done();
  if (before === resolvedTheme()) { snap.remove(); return; }
  const Wd = ph.clientWidth, H = ph.clientHeight, R = Math.hypot(Math.max(x, Wd - x), Math.max(y, H - y)) + 2, t0 = performance.now(), dur = 760;
  const step = (n) => {
    const k = Math.min(1, (n - t0) / dur), e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2, r = R * e;
    const m = `radial-gradient(circle at ${x}px ${y}px, transparent ${r.toFixed(1)}px, #000 ${(r + 1).toFixed(1)}px)`; snap.style.webkitMaskImage = m; snap.style.maskImage = m;
    if (k < 1) requestAnimationFrame(step); else snap.remove();
  };
  requestAnimationFrame(step);
}

/* ================= backup ================= */
async function exportBackup() {
  const json = JSON.stringify(store.exportAll(), null, 1), name = `do-it-dip-cadangan-${T()}.json`;
  const file = new File([json], name, { type: 'application/json' });
  const touch = window.matchMedia && matchMedia('(pointer: coarse)').matches;
  try {
    if (touch && navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: 'Cadangan Do it Dip' }); toast('Cadangan siap disimpan'); return; }
  } catch (e) { if (e && e.name === 'AbortError') return; }
  const a = document.createElement('a'); a.href = URL.createObjectURL(file); a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000); toast('Cadangan diunduh: ' + name);
}
async function readBackupFile(file) {
  let obj; try { obj = JSON.parse(await file.text()); } catch { toast('File tidak bisa dibaca sebagai cadangan'); return; }
  const err = store.checkBackup(obj); if (err) { toast(err); return; }
  const n = obj.data.tx.length, when = obj.exportedAt ? longDate(obj.exportedAt.slice(0, 10)) : 'tanggal tidak diketahui';
  const go = async () => { await store.importAll(obj); afterDataReset(); toast(`Cadangan dipulihkan: ${n} transaksi`); };
  if (!store.data.settings.onboarded || TX().length === 0) { closeSheet(true); await go(); return; }
  sConfirm('Pulihkan cadangan?', `Cadangan dari ${when} berisi <b>${n} transaksi</b>. Semua data di perangkat ini akan diganti dengan isi cadangan dan tidak bisa dibatalkan. Sebaiknya ekspor cadangan data saat ini dulu.`, 'Ganti dengan cadangan', go);
}
function afterDataReset() {
  S.mk = null; S.drill = null; S.wsel = null; S.wall = false; S.nl = ''; S.nlOv = {}; S.m = null; closeDrill(true); closeComposer();
  applyTheme(store.data.settings.theme);
  syncDesk();
  if (!store.data.settings.onboarded) { showOnboarding(); return; }
  $('onb').hidden = true; refresh(); goTab(0);
}

/* ================= onboarding ================= */
function showOnboarding() {
  S.ob = { step: 0, name: store.data.settings.name || '', wallets: DEFAULT_WALLETS.map((w) => ({ ...w, init: '', on: true })) };
  renderOnb(); $('onb').hidden = false;
}
function renderOnb() {
  const ob = S.ob, el = $('onb');
  if (ob.step === 0) {
    el.innerHTML = `<div class="step">
      <div class="onb-hero"><img class="onb-logo" src="./icons/logo-152.png" alt="Logo Do it Dip" width="76" height="76"><h1>Halo! Selamat datang di <span>Do it Dip</span></h1>
      <p>Catat pemasukan dan pengeluaran cukup dengan satu kalimat, lalu lihat rekapnya sampai ke tiap transaksi. Semua data tersimpan di perangkat ini.</p></div>
      <span class="lab" style="margin-top:6px">Nama panggilan</span><input class="field" id="obName" maxlength="24" value="${esc(ob.name)}" placeholder="mis. Dipo" autocomplete="off"></div>
      <div class="spacer"></div>
      <button class="primary" data-a="obNext"><i data-lucide="arrow-right"></i>Lanjut</button>
      <button class="btn2" style="margin-top:10px;width:100%;background:none" data-a="restore"><i data-lucide="upload"></i>Sudah punya cadangan? Pulihkan dari file</button>
      <input type="file" id="restoreFile" accept="application/json,.json" hidden>`;
  } else {
    el.innerHTML = `<div class="step">
      <h1 style="font-size:28px;margin-bottom:8px">Saldo awal dompetmu</h1>
      <p style="margin-bottom:16px">Isi saldo saat ini di setiap dompet. Dompet yang tidak kamu pakai bisa dimatikan; bank dan e-wallet lain bisa ditambah nanti di tab Dompet.</p>
      <div class="card" style="padding:6px 14px">${ob.wallets.map((w, i) => `<div class="ob-wallet ${w.on ? '' : 'off'}"><span class="wlogo" style="--c:${w.color}">${esc(w.short)}</span><span class="nm">${esc(w.name)}<small>${w.group}</small></span>
        <input id="obw-${i}" inputmode="numeric" placeholder="Rp0" value="${w.init ? fmtN(Number(w.init)) : ''}" aria-label="Saldo awal ${esc(w.name)}" autocomplete="off">
        <button class="rm" data-a="obToggle" data-i="${i}" aria-label="${w.on ? 'Matikan' : 'Aktifkan'} ${esc(w.name)}"><i data-lucide="${w.on ? 'x' : 'plus'}"></i></button></div>`).join('')}</div></div>
      <div class="spacer"></div>
      <button class="primary" data-a="obDone"><i data-lucide="check"></i>Mulai mencatat</button>
      <button class="btn2" style="margin-top:10px;width:100%;background:none" data-a="obBack"><i data-lucide="chevron-left"></i>Kembali</button>`;
  }
  icons();
}
async function finishOnboarding() {
  const ob = S.ob, chosen = ob.wallets.filter((w) => w.on);
  if (!chosen.length) { toast('Aktifkan minimal satu dompet'); return; }
  const ws = chosen.map((w, i) => ({ id: w.id, name: w.name, short: w.short, group: w.group, color: w.color, order: i, aliases: w.aliases, init: Number(w.init) || 0, book: 'pribadi' }));
  await store.saveWallets(ws);
  store.setSetting('name', ob.name.trim());
  store.setSetting('onboarded', true);
  const el = $('onb');
  const finish = () => { el.hidden = true; S.ob = null; syncDesk(); app().classList.add('boot'); S.dispTotal = 0; refresh(); setPos(0); playPanel(0); setTimeout(() => { S.dispTotal = totalBalance(); setOdo($('odo'), S.dispTotal); }, 450); setTimeout(() => app().classList.remove('boot'), 1600); };
  if (reduced()) { finish(); return; }
  onEnd(el.animate([{ clipPath: 'circle(150% at 50% 90%)' }, { clipPath: 'circle(0% at 50% 90%)' }], { duration: 650, easing: 'cubic-bezier(.65,0,.35,1)', fill: 'forwards' }), 650, () => { finish(); el.getAnimations().forEach((a) => a.cancel()); });
  burst(app().clientWidth / 2, app().clientHeight * 0.85);
}

/* ================= events ================= */
function bindEvents() {
  document.addEventListener('click', (e) => { if (S.justDragged) { e.preventDefault(); e.stopPropagation(); } }, true);
  document.addEventListener('click', onClick);
  document.addEventListener('input', (e) => {
    const id = e.target.id;
    if (id === 'nl') { S.nl = e.target.value; S.nlPick = null; syncHL(); refreshPreview(); }
    if (id === 'mnote') S.m.note = e.target.value;
    if (id === 'mdate' && e.target.value) { S.m.date = e.target.value > T() ? T() : e.target.value; const sc = $('cobody').scrollTop; rerenderMode(); $('cobody').scrollTop = sc; }
    if (id === 'obName') S.ob.name = e.target.value;
    if (id === 'stAmt') { const v = digitsOnly(e.target.value); e.target.value = v ? fmtN(v) : ''; S.struk.form.amount = v; const b = document.querySelector('[data-a="saveStruk"]'); if (b) b.disabled = !v; }
    if (id === 'stNote') S.struk.form.note = e.target.value;
    if (id === 'stDate' && e.target.value) S.struk.form.date = e.target.value > T() ? T() : e.target.value;
    if (id.startsWith('obw-') || id === 'wfInit') { const v = digitsOnly(e.target.value); e.target.value = v ? fmtN(v) : ''; if (id.startsWith('obw-')) S.ob.wallets[Number(id.slice(4))].init = String(v); }
  });
  document.addEventListener('scroll', (e) => { if (e.target.id === 'nl') syncHL(); }, true);
  document.addEventListener('change', (e) => {
    const id = e.target.id, f = e.target.files?.[0]; if (!f) return;
    if (id === 'restoreFile') readBackupFile(f);
    if (id === 'strukCam' || id === 'strukPick') startStruk(f);
    if (id === 'impFile' || id === 'impShot') startImport(f);
    e.target.value = '';
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.id === 'impPw') { e.preventDefault(); onClick({ target: document.querySelector('[data-a="impPw"]') }); } });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { if ($('layer').innerHTML) closeSheet(); else if (!$('composer').hidden) closeComposer(); else if (!$('drill').hidden) closeDrill(); return; }
    if (e.key === 'Enter' && e.target.id === 'renameIn') { e.preventDefault(); onClick({ target: document.querySelector('[data-a="renameSave"]') }); return; }
    if ((e.target.closest && e.target.closest('textarea,input')) || !$('composer').hidden || $('layer').innerHTML || !$('onb').hidden) return;
    if (document.body.classList.contains('desk') && !document.body.classList.contains('phone-open')) return;
    if (e.key === 'ArrowRight') goTab(S.idx + 1); if (e.key === 'ArrowLeft') goTab(S.idx - 1);
  });
  document.addEventListener('touchstart', (e) => { const t = e.target.closest('.tx[data-id]'); if (t && !e.target.closest('#layer')) startLongPress(t); }, { passive: true });
  document.addEventListener('mousedown', (e) => { if (e.sourceCapabilities && e.sourceCapabilities.firesTouchEvents) return; const t = e.target.closest('.tx[data-id]'); if (t && e.button === 0 && !e.target.closest('#layer')) startLongPress(t); });
  ['touchend', 'touchcancel', 'mouseup'].forEach((ev) => document.addEventListener(ev, () => { if (lpT) cancelLongPress(); }));
  document.addEventListener('contextmenu', (e) => { if (e.target.closest('.tx[data-id]')) e.preventDefault(); });
  window.addEventListener('resize', () => { tabCenters = []; moveInd(S.pos); placePill($('themeSeg')); });
  window.addEventListener('dip-error', (e) => toast(e.detail));
  // A new day may have started while the app sat in the background.
  document.addEventListener('visibilitychange', () => { if (!document.hidden && store.data.settings.onboarded && $('composer').hidden) refresh(); });
  if (window.matchMedia) matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => {});
}

function onClick(e) {
  const el = e.target.closest && e.target.closest('[data-a]'); if (!el) return; const a = el.dataset.a, d = el.dataset;
  switch (a) {
    case 'tab': closeSheet(true); goTab(Number(d.t)); break;
    case 'hide': { const p = app(); p.classList.toggle('hid'); $('desk')?.classList.toggle('hid', p.classList.contains('hid')); const ic = p.classList.contains('hid') ? 'eye-off' : 'eye'; document.querySelectorAll('.eye').forEach((b) => { b.innerHTML = `<i data-lucide="${ic}"></i>`; }); icons(); break; }
    case 'add': { S.editId = null; const r = rel(el); openComposer(d.mode, r.x, r.y); break; }
    case 'mode': switchMode(d.mode); break;
    case 'close': if ($('layer').innerHTML) closeSheet(); else closeComposer(); break;
    case 'books': sBooks(); break;
    case 'tx': sTx(d.id); break;
    case 'toast': toast(d.msg); break;
    case 'backup': exportBackup(); break;
    case 'restore': $('restoreFile')?.click(); break;
    case 'month': {
      const months = monthList(TX(), T()), i = months.indexOf(S.mk) + Number(d.d); if (i < 0 || i >= months.length) break;
      S.mk = months[i]; S.selDay = null; const sc = PANELS[1].scrollTop; renderPanel(1, Number(d.d) > 0 ? 'swap-l' : 'swap-r'); icons(); PANELS[1].scrollTop = sc; playPanel(1); break;
    }
    case 'drill': { const p = e.clientX ? relPt(e.clientX, e.clientY) : rel(el); openDrill(d.cat, p.x, p.y); break; }
    case 'drillsub': S.drill.sub = S.drill.sub === d.sub ? null : d.sub; rerenderDrill(); break;
    case 'drillall': S.drill.sub = null; rerenderDrill(); break;
    case 'undrill': closeDrill(); break;
    case 'day': {
      S.selDay = S.selDay === d.d ? null : d.d; PANELS[1].querySelectorAll('.bar').forEach((b) => b.classList.toggle('sel', b.dataset.d === S.selDay));
      const st = stats(TX(), S.mk), n = $('daynote');
      if (n) n.innerHTML = S.selDay ? `<b>${dayLabel(S.selDay, T())}</b> · ${money(st.byDay[S.selDay] || 0)} dari ${TX().filter((t) => t.date === S.selDay && t.type === 'out').length} transaksi` : 'Ketuk batang untuk melihat nominal harian.';
      break;
    }
    case 'wcard': { const prev = S.wsel; S.wsel = S.wsel === d.id ? null : d.id; PANELS[2].firstElementChild.classList.toggle('hide-sel', !!S.wsel); layoutStack(); if (S.wsel) { showCard(S.wsel, 160); PANELS[2].scrollTo({ top: 0, behavior: 'smooth' }); } if (prev && prev !== S.wsel) hideCard(prev, 120); break; }
    case 'wclose': { const prev = S.wsel; S.wsel = null; PANELS[2].firstElementChild.classList.remove('hide-sel'); layoutStack(); if (prev) hideCard(prev, 300); break; }
    case 'wall': {
      S.wall = !S.wall; el.classList.toggle('on', S.wall); el.querySelector('.wt-lbl').textContent = S.wall ? 'Sembunyikan semua saldo' : 'Tampilkan semua saldo';
      const ic = el.querySelector('.wt-ic'); ic.innerHTML = `<i data-lucide="${S.wall ? 'eye' : 'eye-off'}"></i>`; icons(); ic.classList.remove('spin'); void ic.offsetWidth; ic.classList.add('spin');
      const ks = WL().map((w) => w.id), wt = $('wtot');
      const stagger = (fn) => document.querySelectorAll('.wcard').forEach((c, i) => { c.style.transitionDelay = fn(i) + 'ms'; });
      const clearStagger = () => setTimeout(() => document.querySelectorAll('.wcard').forEach((c) => (c.style.transitionDelay = '')), 1400);
      if (S.wall) { if (!S.wsel) { stagger((i) => (ks.length - 1 - i) * 70); layoutStack(); clearStagger(); } ks.forEach((k, i) => showCard(k, 200 + i * 110)); if (wt) { wt.classList.remove('masked'); wt.dataset.count = totalBalance(); countUp(wt); } }
      else { ks.slice().reverse().forEach((k, i) => hideCard(k, i * 60)); if (wt) { wt.classList.add('masked'); delete wt.dataset.count; wt.textContent = 'Rp ••••••'; } if (!S.wsel) setTimeout(() => { stagger((i) => i * 60); layoutStack(); clearStagger(); }, 380); }
      break;
    }
    case 'walletNew': sWalletForm(null); break;
    case 'walletEdit': sWalletForm(d.id); break;
    case 'wfGroup': WF.group = d.v; document.querySelectorAll('#wfGroup button').forEach((b) => b.classList.toggle('on', b.dataset.v === d.v)); placePill($('wfGroup')); break;
    case 'wfColor': WF.color = d.v; document.querySelectorAll('.swatches button').forEach((b) => b.classList.toggle('on', b.dataset.v === d.v)); break;
    case 'wfSave': {
      const name = $('wfName').value.trim(); if (!name) { toast('Isi nama dompet dulu'); $('wfName').focus(); break; }
      const no = $('wfNo').value.replace(/\D/g, '').slice(-4), init = digitsOnly($('wfInit').value), old = WF.id ? W(WF.id) : null;
      const words = name.toLowerCase();
      const w = { id: WF.id || store.newWalletId(), name, short: (old && old.name === name ? old.short : name.replace(/[^A-Za-z0-9]/g, '').slice(0, 3).toUpperCase() || 'W'), group: WF.group, color: WF.color, no: WF.group === 'Bank' && no ? no : undefined, init, order: old ? old.order : Math.max(-1, ...store.data.wallets.map((x) => x.order)) + 1, aliases: Array.from(new Set([...(old && old.name === name ? old.aliases : []), words])), book: 'pribadi' };
      store.saveWallet(w); closeSheet(); S.wsel = null; refresh(); toast(old ? 'Dompet diperbarui' : `${name} ditambahkan`); break;
    }
    case 'wfDelete': {
      if (WL().length <= 1) { toast('Minimal harus ada satu dompet'); break; }
      const id = d.id; sConfirm('Hapus dompet?', `${esc(W(id).name)} akan dihapus dari daftar dompet.`, 'Hapus', () => { store.deleteWallet(id); S.wsel = null; refresh(); toast('Dompet dihapus'); }); break;
    }
    case 'theme': setTheme(d.t, el); break;
    case 'rename': sRename(); break;
    case 'renameSave': { const v = $('renameIn').value.trim(); store.setSetting('name', v); closeSheet(); refresh(); toast('Nama disimpan'); break; }
    case 'unlearn': store.unlearn(d.w); renderPanel(3); icons(); toast(`“${d.w}” dilupakan`); break;
    case 'wipe': sConfirm('Hapus semua data?', 'Semua transaksi, dompet, dan pengaturan di perangkat ini akan dihapus permanen dan <b>tidak bisa dibatalkan</b>. Ekspor cadangan dulu jika masih ingin menyimpannya.', 'Hapus semua', async () => { await store.wipe(); afterDataReset(); }); break;
    case 'confirmOk': { const fn = S.confirmFn; S.confirmFn = null; closeSheet(); if (fn) fn(); break; }
    case 'del': deleteTx(d.id); break;
    case 'pkDetail': closeSheet(true); sTx(d.id); break;
    case 'dup': {
      const t = TX().find((x) => x.id === d.id); closeSheet(); if (!t) break;
      const n = store.addTx({ date: T(), type: t.type, cat: t.cat, sub: t.sub, amount: t.amount, wallet: t.wallet, to: t.to, note: t.note }); markFresh([n]);
      refresh(); toast(`Diduplikat: ${rp(t.amount)} · hari ini`); break;
    }
    case 'edit': {
      const t = TX().find((x) => x.id === d.id); if (!t) break; closeSheet(true);
      S.editId = t.id; S.m = { type: t.type, amt: String(t.amount), cat: t.cat || 'makan', sub: t.sub || CATS.makan.subs[0], wallet: t.wallet, to: t.to || defaults().cash, date: t.date, note: t.note, justTyped: false };
      openComposer('manual', app().clientWidth / 2, app().clientHeight / 2); break;
    }
    /* kalimat */
    case 'ex': { S.nl = S.nl.trim() ? S.nl.replace(/\s+$/, '') + '\n' + d.v : d.v; const n = $('nl'); if (n) n.value = S.nl; syncHL(); refreshPreview(); break; }
    case 'pvcat': S.nlPick = S.nlPick === Number(d.i) ? null : Number(d.i); refreshPreview(); break;
    case 'pvset': {
      const i = Number(d.i), p = nlItems()[i], cat = d.cat, sub = CATS[cat].subs[0]; S.nlOv[i] = { ...(S.nlOv[i] || {}), raw: p.raw, cat, sub }; S.nlPick = null;
      const key = (p.note.toLowerCase().match(/[a-z]+/g) || []).find((w) => w.length >= 3); if (key) { store.learn(key, cat, sub); toast(`Diingat: “${key}” masuk ${CATS[cat].n}`); }
      refreshPreview(); syncHL(); break;
    }
    case 'pvwal': { const i = Number(d.i), p = nlItems()[i], ks = WL().map((w) => w.id), nx = ks[(ks.indexOf(p.wallet) + 1) % ks.length]; S.nlOv[i] = { ...(S.nlOv[i] || {}), raw: p.raw, wallet: nx }; refreshPreview(); break; }
    case 'saveNL': {
      const items = nlItems().filter((p) => p.amount > 0); if (!items.length) break;
      const src = document.querySelector('.pv-amt:not(.none)') || el;
      const added = items.map((p) => store.addTx({ date: p.date, type: p.type, cat: p.type === 'tf' ? null : p.cat, sub: p.type === 'tf' ? null : p.sub, amount: p.amount, wallet: p.wallet, to: p.type === 'tf' ? p.to : null, note: p.note })); markFresh(added);
      const one = items[0]; S.nl = ''; S.nlOv = {}; S.nlPick = null; S.lastSig = [];
      celebrate(items.length > 1 ? `${items.length} transaksi` : (one.type === 'in' ? '+' : '') + rp(one.amount), one.type, src, items.length > 1 ? `${items.length} transaksi tercatat` : `Tercatat: ${rp(one.amount)} · ${one.type === 'tf' ? 'Transfer' : CATS[one.cat].n}`);
      break;
    }
    /* manual */
    case 'mset': {
      const m = S.m; m[d.k] = d.v; m.justTyped = false;
      if (d.k === 'type' && d.v !== 'tf') { m.cat = d.v === 'in' ? 'gaji' : 'makan'; m.sub = CATS[m.cat].subs[0]; if (d.v === 'in') m.wallet = defaults().bank; }
      if (d.k === 'type' && d.v === 'tf' && m.wallet === m.to) m.to = WL().find((w) => w.id !== m.wallet)?.id || m.to;
      if (d.k === 'cat') m.sub = CATS[d.v].subs[0];
      const sc = $('cobody').scrollTop; rerenderMode(); $('cobody').scrollTop = sc; break;
    }
    case 'key': {
      const m = S.m; if (d.k === 'del') m.amt = m.amt.slice(0, -1); else if ((m.amt + d.k).length <= 12) m.amt = (m.amt + d.k).replace(/^0+/, ''); m.justTyped = d.k !== 'del';
      const ad = $('mamt'); ad.innerHTML = amtHTML(); ad.classList.toggle('zero', !Number(m.amt)); $('saveM').disabled = !Number(m.amt);
      const r = el.getBoundingClientRect(), rp2 = document.createElement('span'); rp2.className = 'ripple'; rp2.style.left = (e.clientX || r.left + r.width / 2) - r.left + 'px'; rp2.style.top = (e.clientY || r.top + r.height / 2) - r.top + 'px'; el.appendChild(rp2); setTimeout(() => rp2.remove(), 520);
      break;
    }
    case 'saveM': {
      const m = S.m, amt = Number(m.amt); if (!amt) break; if (m.type === 'tf' && m.wallet === m.to) { toast('Pilih dompet tujuan yang berbeda'); break; }
      const note = m.note.trim() || (m.type === 'tf' ? tfNote({ note: 'Transfer', to: m.to }) : m.sub);
      const rec = { date: m.date, type: m.type, cat: m.type === 'tf' ? null : m.cat, sub: m.type === 'tf' ? null : m.sub, amount: amt, wallet: m.wallet, to: m.type === 'tf' ? m.to : null, note };
      if (S.editId) { const t = store.updateTx(S.editId, rec); if (t) markFresh([t]); S.m = null; closeComposer(); refresh(); toast('Perubahan disimpan'); break; }
      const t = store.addTx(rec); markFresh([t]);
      const src = $('mamt'); S.m = null; celebrate((m.type === 'in' ? '+' : '') + rp(amt), m.type, src, `Tercatat: ${rp(amt)}`); break;
    }
    /* struk */
    case 'stRetry': S.struk = { phase: 'idle' }; rerenderMode(); break;
    case 'stset': { const f = S.struk.form; f[d.k] = d.v; if (d.k === 'cat') f.sub = CATS[d.v].subs[0]; const sc = $('cobody').scrollTop; rerenderMode(); $('cobody').scrollTop = sc; break; }
    case 'saveStruk': {
      const f = S.struk.form; if (!f.amount) break;
      const t = store.addTx({ date: f.date, type: 'out', cat: f.cat, sub: f.sub, amount: f.amount, wallet: f.wallet, to: null, note: (f.note || 'Belanja').trim() }); markFresh([t]);
      S.struk = { phase: 'idle' }; celebrate(rp(f.amount), 'out', el, `Struk tersimpan: ${rp(f.amount)}`); break;
    }
    /* impor */
    case 'impWallet': S.imp.wallet = d.v; if (S.imp.phase === 'review') regroupImport(); { const sc = $('cobody').scrollTop; rerenderMode(); $('cobody').scrollTop = sc; } break;
    case 'impPw': { const pw = $('impPw')?.value; if (!pw || !S.imp.file) break; startImport(S.imp.file, pw); break; }
    case 'impReset': S.imp = { phase: 'idle', wallet: S.imp.wallet, rows: [], pick: null }; rerenderMode(); break;
    case 'impTog': { const r = S.imp.rows[Number(d.i)]; r.on = !r.on; const sc = $('cobody').scrollTop; rerenderMode(); $('cobody').scrollTop = sc; break; }
    case 'impAll': case 'impNone': { S.imp.rows.forEach((r) => (r.on = a === 'impAll')); const sc = $('cobody').scrollTop; rerenderMode(); $('cobody').scrollTop = sc; break; }
    case 'impPick': { S.imp.pick = S.imp.pick === Number(d.i) ? null : Number(d.i); const sc = $('cobody').scrollTop; rerenderMode(); $('cobody').scrollTop = sc; break; }
    case 'impSet': {
      const r = S.imp.rows[Number(d.i)]; r.manual = true;
      if (d.to) r.g = { ...r.g, type: 'tf', cat: null, sub: null, to: d.to, note: (W(d.to).group === 'E-wallet' ? 'Isi saldo ' : 'Transfer ke ') + W(d.to).name };
      else r.g = { ...r.g, type: CATS[d.cat].inc ? 'in' : 'out', cat: d.cat, sub: CATS[d.cat].subs[0], to: null };
      S.imp.pick = null; const sc = $('cobody').scrollTop; rerenderMode(); $('cobody').scrollTop = sc; break;
    }
    case 'impSave': {
      const src = S.imp.wallet, rows = S.imp.rows.filter((r) => r.on); if (!rows.length) break;
      const added = rows.map((r) => store.addTx({ date: r.date, type: r.g.type, cat: r.g.type === 'tf' ? null : r.g.cat, sub: r.g.type === 'tf' ? null : r.g.sub, amount: r.amount, wallet: src, to: r.g.type === 'tf' ? r.g.to : null, note: r.g.note }));
      markFresh(added); const n = added.length; S.imp = { phase: 'idle', wallet: src, rows: [], pick: null };
      celebrate(`${n} transaksi`, 'tf', el, `${n} transaksi diimpor dari ${W(src).name}`); break;
    }
    /* onboarding */
    case 'obNext': S.ob.name = $('obName').value; S.ob.step = 1; renderOnb(); break;
    case 'obBack': S.ob.step = 0; renderOnb(); break;
    case 'obToggle': { const w = S.ob.wallets[Number(d.i)]; w.on = !w.on; renderOnb(); break; }
    case 'obDone': finishOnboarding(); break;
  }
}

/* ================= boot ================= */
const SHELL = `
  <div class="track" id="track">
    <section class="panel" id="p0" aria-label="Beranda"></section>
    <section class="panel pre" id="p1" aria-label="Rekap"></section>
    <section class="panel pre" id="p2" aria-label="Dompet"></section>
    <section class="panel pre" id="p3" aria-label="Lainnya"></section>
  </div>
  <div class="pull" id="pull" aria-hidden="true"><span class="pb"><i data-lucide="sparkles"></i></span><span id="pullTxt">Tarik untuk mencatat</span></div>
  <div class="page" id="drill" hidden></div>
  <nav class="tabbar" id="tabbar" aria-label="Navigasi utama">
    <span class="tab-ind" id="ind"></span>
    <button class="tab on" data-a="tab" data-t="0"><span class="ti"><i data-lucide="house"></i></span>Beranda</button>
    <button class="tab" data-a="tab" data-t="1"><span class="ti"><i data-lucide="chart-pie"></i></span>Rekap</button>
    <button class="fab" id="fab" data-a="add" data-mode="kalimat" aria-label="Catat transaksi"><i data-lucide="plus"></i></button>
    <button class="tab" data-a="tab" data-t="2"><span class="ti"><i data-lucide="wallet"></i></span>Dompet</button>
    <button class="tab" data-a="tab" data-t="3"><span class="ti"><i data-lucide="settings"></i></span>Lainnya</button>
  </nav>
  <div class="composer" id="composer" hidden role="dialog" aria-label="Catat transaksi"></div>
  <div id="layer"></div>
  <div class="onb" id="onb" hidden></div>
  <div class="toast" id="toast" role="status" aria-live="polite"></div>`;

export async function start() {
  await store.load();
  applyTheme(store.data.settings.theme);
  app().innerHTML = SHELL;
  PANELS = [0, 1, 2, 3].map((i) => $('p' + i));
  bindEvents(); bindTrack(); bindDrill();
  initDesk({ icons, onPhoneShown });
  store.requestPersist().then((ok) => { S.persisted = ok; });
  renderAll(); setPos(0); PANELS[0].classList.add('play');
  requestAnimationFrame(() => { measureTabs(); moveInd(0); });
  if (!store.data.settings.onboarded) { showOnboarding(); return; }
  setTimeout(() => { S.dispTotal = totalBalance(); setOdo($('odo'), S.dispTotal); }, 450);
  setTimeout(() => app().classList.remove('boot'), 1600);
}
