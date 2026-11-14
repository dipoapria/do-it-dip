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
  ScanFace, PartyPopper, Play, Hourglass, CloudDownload, RefreshCw, LogOut, Mail, LogIn, Repeat, FileDown, SkipForward, CalendarClock,
  HandCoins, Handshake, Target, Plane, Car, Bike, Heart, Baby, Gem, BriefcaseBusiness, Package, Wrench,
} from 'lucide';
import { allocated, debtDone, debtLeft, debtPaid, etaMonths, goalLeft, goalPct, goalSaved, monthlyNeed, netWorth, openingTx, paymentTx, isDebtWallet, monthlyInstalments, dsr } from './plan.ts';
import { budgetSummary, levelOf, newAlerts, suggestBudgets } from './budget.ts';
import { dueDates, nextAfter, occurrenceTx, ruleFromTx, scheduleLabel } from './recurring.ts';
import { initLock, lockNow, setupPin, verifyPin, pinOn, enableBio, bioAvailable } from './lock.ts';
import { initStories, openStories, storiesReady } from './stories.ts';
import * as cloud from './cloud.ts';
import { recognize, preprocess } from './ocr.ts';
import { extract, NeedPassword } from './filetext.ts';
import { parseReceipt } from './receipt.ts';
import { guessRow, linesToStatement, rowsToStatement } from './statement.ts';
import { KW } from './model.ts';
import { initDesk, render as renderDesk, sync as syncDesk } from './desk.ts';
import { addDays, addMonths, BLN, BULAN, dayLabel, daysIn, digitsOnly, esc, fmtN, HARI, HARI_P, longDate, monthName, pad, pct, rp, shortTxt, toD, todayStr } from './format.ts';
import { BOOK_KW, BOOKS, CATS, catsFor, DEFAULT_WALLETS, IN_CATS, OUT_CATS, WALLET_COLORS, WALLET_ICON } from './model.ts';
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
  ScanFace, PartyPopper, Play, Hourglass, CloudDownload, RefreshCw, LogOut, Mail, LogIn, Repeat, FileDown, SkipForward, CalendarClock,
  HandCoins, Handshake, Target, Plane, Car, Bike, Heart, Baby, Gem, BriefcaseBusiness, Package, Wrench,
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

const TX = () => store.bookTxs();
const WL = () => store.bookWallets().slice().sort((a, b) => a.order - b.order);
const BK = () => store.curBook();
const isPersonal = () => BK() === 'pribadi';
const OUTC = () => catsFor(BK(), false);
const INC = () => catsFor(BK(), true);
/** Hero number: total balance in Pribadi; this month's profit in Freelance/Usaha (their money often sits in shared wallets). */
function heroVal() { if (isPersonal()) return totalBalance(); const st = stats(TX(), T().slice(0, 7)); return Math.abs(st.inc - st.out); }
const GHOST = (id) => ({ id, name: 'Dompet terhapus', short: '?', group: 'Tunai', color: '#94A3B8', init: 0, order: 99, aliases: [], book: 'pribadi' });
const W = (id) => store.data.wallets.find((w) => w.id === id) || (isDebtWallet(id) ? debtPseudo(id) : GHOST(id));
function debtPseudo(id) { const d = store.data.debts.find((x) => 'debt:' + x.id === id); return { ...GHOST(id), name: d ? (d.kind === 'utang' ? 'Pinjaman ' : 'Dipinjam ') + d.name : 'Utang (dihapus)', color: d ? DEBT_C[d.kind] : '#94A3B8' }; }
const bal = (w) => balance(store.data.txs, typeof w === 'string' ? W(w) : w);
const totalBalance = () => WL().reduce((s, w) => s + bal(w), 0);
const sorted = (list = TX()) => list.slice().sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.createdAt - a.createdAt));
const catOf = (t) => (t.type === 'tf' ? (t.debt ? debtCat(t) : { n: 'Transfer', c: '#3D7BFF', i: 'arrow-left-right' }) : CATS[t.cat] || CATS.lain);
function debtCat(t) { const k = store.data.debts.find((x) => x.id === t.debt)?.kind || 'utang'; return { n: k === 'utang' ? 'Utang' : 'Piutang', c: DEBT_C[k], i: k === 'utang' ? 'hand-coins' : 'handshake' }; }
const money = (n) => `<span class="m">${rp(n)}</span>`;
const short = (n) => `<span class="m">${shortTxt(n)}</span>`;
const isCurMonth = (mk) => mk === T().slice(0, 7);
function defaults() {
  const ws = WL();
  const bank = (ws.find((w) => w.group === 'Bank') || ws[0] || GHOST('x')).id;
  const cash = (ws.find((w) => w.group === 'Tunai') || ws.find((w) => w.group === 'E-wallet') || ws[0] || GHOST('x')).id;
  return { bank, cash };
}
const ctx = () => ({ today: T(), learned: store.data.learned, wallets: WL().map((w) => ({ id: w.id, aliases: w.aliases?.length ? w.aliases : [w.name.toLowerCase()] })), defaults: defaults(), kw: BOOK_KW[BK()] || [] });
function tfNote(p) {
  const to = W(p.to);
  if (p.note === 'Tarik tunai') return to.group === 'Tunai' ? 'Tarik tunai' : `Tarik ke ${to.name}`;
  if (p.note === 'Tabungan') return `Tabungan ke ${to.name}`;
  return to.group === 'E-wallet' ? `Isi saldo ${to.name}` : `Transfer ke ${to.name}`;
}
const newManual = () => ({ type: 'out', amt: '', cat: OUTC()[0], sub: CATS[OUTC()[0]].subs[0], wallet: defaults().cash, to: defaults().bank, date: T(), note: '', justTyped: false });

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
  return `<button class="tx${t.fresh ? ' fresh' : ''}" data-a="tx" data-id="${t.id}"><span class="ic" style="--c:${c.c}"><i data-lucide="${c.i}"></i></span><span class="tx-main"><b>${esc(t.note)}</b><small>${t.rec ? '<i data-lucide="repeat" class="rec-ic"></i>' : ''}${meta}</small></span><span class="amt ${t.type}">${sign}${money(t.amount)}</span></button>`;
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
    <button class="pillbtn" data-a="books" style="--c:${BOOKS[BK()].c}"><i data-lucide="${BOOKS[BK()].i}"></i>${BOOKS[BK()].n}<i data-lucide="chevron-down"></i></button>
  </header>
  <section class="hero t-${tod} book-${BK()} st" style="--i:1" id="hero"><div class="glare"></div>
    <div class="hero-row"><span class="lbl">${isPersonal() ? `Total saldo · ${WL().length} dompet` : `${st.inc - st.out < 0 ? 'Rugi' : 'Laba bersih'} ${mon} · buku ${BOOKS[BK()].n}`}</span><button class="eye" data-a="hide" aria-label="Sembunyikan atau tampilkan nominal"><i data-lucide="${app().classList.contains('hid') ? 'eye-off' : 'eye'}"></i></button></div>
    <div class="big m${!isPersonal() && st.inc - st.out < 0 ? ' neg' : ''}" id="odo" aria-label="${rp(heroVal())}"></div>
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
  ${dueCardHTML()}
  ${budgetMiniHTML()}
  ${storiesReady() ? `<button class="story-card st" style="--i:4" data-a="stories"><span class="sc-ic"><i data-lucide="clapperboard"></i></span><span><b>Rekap kilat minggu ini</b><small>6 kartu cerita · ketuk untuk memutar</small></span><span class="play"><i data-lucide="play"></i></span></button>` : ''}
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
  const inst = isPersonal() ? monthlyInstalments(store.data.debts, TX()) : 0;
  if (inst > 0) {
    const r = dsr(inst, st.inc);
    out.push(r == null
      ? { c: '#F0A010', i: 'hand-coins', t: `Cicilan ${rp(inst)}/bulan`, d: 'Belum ada pemasukan di bulan ini untuk dibandingkan. Patokan aman: total cicilan maksimal 30% dari pemasukan.' }
      : { c: r <= 0.3 ? '#10B981' : r <= 0.4 ? '#F0A010' : '#F43F5E', i: 'hand-coins', t: `Cicilan ${pct(r)} dari pemasukan`, d: r <= 0.3 ? `${rp(inst)}/bulan, masih di bawah batas aman 30%. Hindari menambah cicilan baru sampai ada yang lunas.` : `${rp(inst)}/bulan, di atas batas aman 30%. Dahulukan melunasi utang berbunga tertinggi dan tunda cicilan baru.`, prog: Math.min(1, r / 0.5) });
  }
  if (isPersonal() && store.data.debts.length) {
    const nw = netWorth(totalBalance(), store.data.debts, TX());
    out.push({ c: nw.net >= 0 ? '#13A894' : '#F43F5E', i: 'landmark', t: `Kekayaan bersih ${rp(nw.net)}`, d: `Saldo dompet ${rp(nw.cash)} + piutang ${rp(nw.receivable)} − utang ${rp(nw.owed)}.` });
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
  ${budgetCardHTML(mk, st)}
  <div class="card chart"><h4>Pengeluaran harian <small>${st.n} transaksi</small></h4><div class="chart-note" id="daynote">${note}</div>${dailyChart(mk, st)}</div>
  <div class="card chart"><h4>Tren bulanan <span class="leg-inline"><span style="--c:var(--in)"><i></i>Masuk</span><span style="--c:var(--out)"><i></i>Keluar</span></span></h4>${trendChart(months.slice(Math.max(0, idx - 3), idx + 1))}</div>
  <div class="card"><h4>Catatan perencana keuangan</h4>${insights(mk, st, months)}</div>
  <button class="btn2 dash" data-a="excel" style="margin-top:4px"><i data-lucide="file-down"></i>Ekspor ke Excel</button>
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

const STACK_GAP = 64, OPEN_GAP = 196, ARM_GAP = 12;
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
    ${isPersonal() ? `<div id="planSec">${planHTML()}</div>` : ''}
    <div class="sec-h"><h3>Buku keuangan</h3><small>terpisah satu sama lain</small></div>
    <div class="books">${bookRows(true)}
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
    start(s) {
      cancelAnimationFrame(stackRaf); if (S.wsel) return false; const c = s.target.closest('.wcard'); if (!c) return false;
      s.k = c.dataset.id; s.i = [...st.children].indexOf(c); s.sc = PANELS[2].scrollTop; s.c = c;
      // At the top of the page a downward drag peeks right away. Once scrolled, a plain drag scrolls the page;
      // hold the card briefly (it lifts) and then drag down to peek.
      s.atTop = s.sc <= 4;
      if (!s.atTop) s.holdT = setTimeout(() => {
        if (s.lock) return;
        s.armed = true; c.classList.add('armed'); c.blur(); navigator.vibrate?.(8);
        peekLayout(s.i, ARM_GAP); [...st.children].forEach((x) => (x.style.transition = 'transform .5s cubic-bezier(.25,.8,.3,1)'));
      }, 300);
    },
    move(s, e) {
      if (!s.lock) { const ax = Math.abs(s.dx), ay = Math.abs(s.dy); if (ax < 6 && ay < 6) return; clearTimeout(s.holdT); s.lock = ax > ay ? 'h' : s.dy > 0 && (s.atTop || s.armed) ? 'peek' : 'scroll'; if (s.lock === 'peek') s.c.blur(); if (s.armed && s.lock !== 'peek') { s.c.classList.remove('armed'); layoutStack(); } }
      if (s.lock === 'scroll') { if (e.cancelable) e.preventDefault(); PANELS[2].scrollTop = s.sc - s.dy; }
      if (s.lock === 'peek') { if (e.cancelable) e.preventDefault(); const d = (s.armed ? ARM_GAP : 0) + rubber(Math.max(0, s.dy), 200); peekLayout(s.i, d); if (d > 60 && !s.shown) { s.shown = true; S.peekDrag = s.k; showCard(s.k); } }
    },
    end(s) {
      clearTimeout(s.holdT); s.c?.classList.remove('armed');
      if (s.armed && !s.lock) { [...st.children].forEach((c) => (c.style.transition = '')); layoutStack(); }
      if (s.lock === 'peek' || s.lock === 'scroll' || s.armed) markDragged();
      if (s.lock === 'peek') { S.peekDrag = null; [...st.children].forEach((c) => (c.style.transition = '')); layoutStack(); if (s.shown) hideCard(s.k, 120); }
      if (s.lock === 'scroll') { let v = -s.vy * 16; const p = PANELS[2]; const step = () => { p.scrollTop += v; v *= 0.94; if (Math.abs(v) > 0.4) stackRaf = requestAnimationFrame(step); }; stackRaf = requestAnimationFrame(step); }
    },
  });
}

function rulesCardHTML() {
  const rs = RULES();
  return `<div class="card"><h4>Transaksi berulang ${rs.length ? `<span class="status">${rs.length} jadwal</span>` : ''}</h4>
    ${rs.length ? rs.map((r) => { const c = ruleCat(r); return `<button class="set-row" data-a="ruleEdit" data-id="${r.id}"><span class="ic" style="--c:${c.c}"><i data-lucide="${c.i}"></i></span><div class="t"><b>${esc(r.note)}</b><small>${scheduleLabel(r)} · ${r.auto ? 'otomatis' : 'tanya dulu'} · berikutnya ${dayLabel(nextAfter(r, r.last), T())}</small></div><span class="amt ${r.type}">${money(r.amount)}</span></button>`; }).join('')
    : '<p class="about" style="margin:0">Gaji, cicilan, atau langganan bisa dicatat otomatis setiap bulan. Buka transaksinya (misalnya gaji) di Beranda, lalu ketuk <b>Jadikan berulang</b>.</p>'}</div>`;
}
function vLainnya() {
  const kw = Object.entries(store.data.learned), set = store.data.settings;
  return `<div class="inner">
  <header class="top"><h2 class="title">Lainnya</h2></header>
  <div class="card"><h4>Profil</h4>
    <button class="set-row" data-a="rename"><span class="ic" style="--c:#13A894"><i data-lucide="user"></i></span><div class="t"><b>${esc(set.name || 'Tanpa nama')}</b><small>Nama sapaan di Beranda · ketuk untuk mengubah</small></div><i data-lucide="chevron-right"></i></button></div>
  ${rulesCardHTML()}
  ${cloudCardHTML()}
  <div class="card"><h4>Cadangan manual <span class="status">${S.persisted ? 'Penyimpanan permanen aktif' : 'Di perangkat ini'}</span></h4>
    <p class="about" style="margin:0 0 4px">File cadangan (.json) bisa disimpan di Files atau Google Drive dan dipulihkan di perangkat mana pun.</p>
    <div class="btn-row"><button class="btn2" data-a="backup"><i data-lucide="download"></i>Ekspor cadangan</button><button class="btn2" data-a="restore"><i data-lucide="upload"></i>Pulihkan dari file</button></div>
    <input type="file" id="restoreFile" accept="application/json,.json" hidden></div>
  <div class="card"><h4>Keamanan</h4>
    <button class="set-row" data-a="pinToggle"><span class="ic" style="--c:#8B5CF6"><i data-lucide="lock"></i></span><div class="t"><b>Kunci PIN</b><small>${pinOn() ? `Aktif · PIN ${set.pinLen} digit diminta saat aplikasi dibuka` : 'Minta PIN setiap aplikasi dibuka'}</small></div><span class="toggle ${pinOn() ? 'on' : ''}"></span></button>
    ${pinOn() ? `<button class="set-row" data-a="pinChange"><span class="ic" style="--c:#3D8BFF"><i data-lucide="key-round"></i></span><div class="t"><b>Ubah PIN</b><small>Butuh PIN lama</small></div><i data-lucide="chevron-right"></i></button>
    ${S.bioAvail ? `<button class="set-row" data-a="bioToggle"><span class="ic" style="--c:#13A894"><i data-lucide="scan-face"></i></span><div class="t"><b>Face ID / Touch ID</b><small>${set.bioId ? 'Aktif di perangkat ini' : 'Buka tanpa mengetik PIN'}</small></div><span class="toggle ${set.bioId ? 'on' : ''}"></span></button>` : ''}
    <div class="set-row"><span class="ic" style="--c:#F0A010"><i data-lucide="hourglass"></i></span><div class="t"><b>Kunci otomatis</b><small>Setelah aplikasi ditinggal ke latar belakang</small></div></div>
    <div class="seg" id="lockSeg"><span class="pill"></span>${[[0, 'Langsung'], [60, '1 menit'], [300, '5 menit']].map(([v, l]) => `<button class="${set.lockAfter === v ? 'on' : ''}" data-a="lockAfter" data-v="${v}">${l}</button>`).join('')}</div>` : ''}
    <p class="about" style="margin:10px 0 0">Kunci PIN mencegah orang lain membuka Do it Dip di perangkat ini. Data tetap tersimpan di perangkat dan tidak dienkripsi, jadi tetap simpan cadangan di tempat aman.</p></div>
  <div class="card"><h4>Tampilan</h4>
    <div class="seg" id="themeSeg"><span class="pill"></span>${[['system', 'Sistem', 'monitor-smartphone'], ['light', 'Terang', 'sun'], ['dark', 'Gelap', 'moon']].map(([k, l, i]) => `<button class="${set.theme === k ? 'on' : ''}" data-a="theme" data-t="${k}"><i data-lucide="${i}"></i>${l}</button>`).join('')}</div></div>
  <div class="card"><h4>Kata kunci yang dipelajari</h4>
    <p class="about" style="margin:0">${kw.length ? 'Ketuk untuk melupakan satu kata kunci.' : 'Belum ada. Saat mencatat lewat kalimat, ganti kategori di pratinjau; aplikasi akan mengingatnya.'}</p>
    ${kw.length ? `<div class="kw">${kw.map(([w, v]) => `<button data-a="unlearn" data-w="${esc(w)}" style="--c:${CATS[v.cat]?.c || '#94A3B8'}">${esc(w)} → ${CATS[v.cat]?.n || v.cat}<i data-lucide="x"></i></button>`).join('')}</div>` : ''}</div>
  <div class="card"><h4>Data</h4>
    <button class="set-row" data-a="excel"><span class="ic" style="--c:#1E9E4F"><i data-lucide="file-down"></i></span><div class="t"><b>Ekspor ke Excel</b><small>Ringkasan, transaksi, dan per kategori (.xlsx)</small></div><i data-lucide="chevron-right"></i></button>
    <button class="set-row danger-row" data-a="wipe"><span class="ic" style="--c:#F43F5E"><i data-lucide="trash-2"></i></span><div class="t"><b>Hapus semua data</b><small>Transaksi, dompet, dan pengaturan di perangkat ini</small></div></button></div>
  <div class="card about"><h4>Tentang</h4>Do it Dip 0.6 · Tahap 6. ${store.data.txs.length.toLocaleString('id-ID')} transaksi tersimpan di semua buku. Berikutnya: buku keluarga bersama pasangan.</div></div>`;
}
function placePill(seg) { if (!seg) return; const on = seg.querySelector('button.on'), pill = seg.querySelector('.pill'); if (!on || !pill) return; pill.style.width = on.offsetWidth + 'px'; pill.style.transform = `translateX(${on.offsetLeft - 4}px)`; }

/* ================= panels: render + stacked "deck" ================= */
let PANELS = [];
const VIEWS = [vHome, vRekap, vDompet, vLainnya];
function renderPanel(i, arg) {
  const p = PANELS[i]; p.innerHTML = VIEWS[i](arg);
  if (i === 0) {
    setOdo($('odo'), S.dispTotal, true); bindHero();
    if (!store.data.settings.lpLearned) { const t = p.querySelector('.list .tx[data-id]'); if (t) t.insertAdjacentHTML('beforeend', '<span class="lp-hint"><i data-lucide="pointer"></i>Tahan</span>'); }
  }
  if (i === 2) { layoutStack(); initCards(); bindStack(); }
  if (i === 3) { placePill($('themeSeg')); placePill($('lockSeg')); }
}
function renderAll() { checkBudgets(); for (let i = 0; i < 4; i++) renderPanel(i); icons(); }
function refresh() { S.dispTotal = heroVal(); renderAll(); setOdo($('odo'), S.dispTotal, true); if (S.drill) rerenderDrill(); renderDesk(); }
function onPhoneShown() { tabCenters = []; refresh(); requestAnimationFrame(() => { measureTabs(); moveInd(S.pos); placePill($('themeSeg')); }); }
function playPanel(i) {
  const p = PANELS[i]; p.classList.remove('pre'); p.classList.remove('play'); void p.offsetWidth; p.classList.add('play');
  p.querySelectorAll('[data-count]').forEach(countUp);
  if (!reduced()) p.querySelectorAll('.seg[data-len]').forEach((s, j) => { const len = Number(s.dataset.len), C = Number(s.dataset.c); s.animate([{ strokeDasharray: `0 ${C}` }, { strokeDasharray: `${len} ${C}` }], { duration: 800, delay: 150 + j * 80, easing: 'cubic-bezier(.3,.9,.3,1)', fill: 'backwards' }); });
  if (i === 3) { placePill($('themeSeg')); placePill($('lockSeg')); }
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
  // Light on purpose (iPhone): three small circles grow with transform only (GPU-composited, tiny textures),
  // then the sheet fades/scales in from the touch point. No clip-path or border-radius animation, which forced
  // full-screen repaints every frame and could make Safari run out of memory and reload the app.
  const ph = app(), Wd = ph.clientWidth, H = ph.clientHeight, R = Math.hypot(Math.max(x, Wd - x), Math.max(y, H - y)), D = 80, k = (R * 2.1) / D, blobs = [];
  ['#BFF5E8', '#2CC4AB', '#0B7C8A'].forEach((col, i) => {
    const b = document.createElement('div'); b.className = 'splash'; b.style.cssText = `left:${x - D / 2}px;top:${y - D / 2}px;width:${D}px;height:${D}px;background:${col}`; ph.appendChild(b); blobs.push(b);
    b.animate([{ transform: 'scale(0)' }, { transform: `scale(${k.toFixed(2)})` }], { duration: 380, delay: i * 70, easing: 'cubic-bezier(.5,0,.2,1)', fill: 'both' });
  });
  sparks(x, y);
  const fab = $('fab'); if (fab) fab.animate([{ transform: 'translateY(-14px) rotate(-6deg)' }, { transform: 'translateY(-14px) rotate(135deg) scale(.6)' }], { duration: 380, easing: 'cubic-bezier(.3,1.4,.5,1)' });
  c.style.transformOrigin = `${x}px ${y}px`;
  const a = c.animate([{ opacity: 0, transform: 'scale(.94)' }, { opacity: 1, transform: 'none' }], { duration: 240, delay: 340, easing: 'ease-out', fill: 'backwards' });
  onEnd(a, 600, () => blobs.forEach((b) => b.remove()));
  [c.querySelector('.co-head'), $('modebody')].filter(Boolean).forEach((p, i) => p.animate([{ transform: 'translateY(28px)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 420, delay: 420 + i * 80, easing: 'cubic-bezier(.16,1,.3,1)', fill: 'backwards' }));
  if (mode === 'kalimat') later(700, focus);
}
function sparks(x, y) { if (reduced()) return; const ph = app(); for (let i = 0; i < 8; i++) { const s = document.createElement('span'); s.className = 'burst'; const a = (i / 8) * Math.PI * 2, r = 90 + Math.random() * 70; s.style.cssText = `left:${x}px;top:${y}px;background:#fff;width:7px;height:7px;border-radius:50%;--x:${Math.cos(a) * r}px;--y:${Math.sin(a) * r}px`; ph.appendChild(s); setTimeout(() => s.remove(), 950); } }
function closeComposer(to) {
  const c = $('composer'); if (c.hidden) return; clearTimers(); stopType();
  const done = () => { c.hidden = true; c.innerHTML = ''; S.editId = null; };
  const { x, y } = to || S.co || { x: c.clientWidth / 2, y: c.clientHeight - 40 };
  if (reduced()) { done(); return; }
  c.style.transformOrigin = `${x}px ${y}px`;
  const a = c.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'scale(.9)' }], { duration: 260, easing: 'cubic-bezier(.5,0,.75,0)', fill: 'forwards' });
  onEnd(a, 260, () => { done(); a.cancel(); });
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
/** Known chain decides first (Indomaret → Belanja); then the shop name; a long item list is a shopping trip; then the item names. */
const receiptGuess = (res) => res.storeCat || kwHit(res.merchant) || (res.items.length >= 3 ? { cat: 'belanja', sub: 'Kebutuhan harian' } : kwHit(res.items.map((i) => i.name).join(' '))) || { cat: 'belanja', sub: 'Kebutuhan harian' };
/** One item → its name ("VIT AIR MINERAL 19 L"); several → the shop. */
const receiptNote = (res) => (res.items.length === 1 ? res.items[0].name : res.merchant || 'Belanja');
/** Wallet from how the receipt says it was paid (TUNAI → cash, GOPAY → GoPay, DEBIT → main bank). */
function receiptWallet(pay) {
  const d = defaults();
  if (!pay || pay === 'cash') return d.cash;
  if (pay === 'card') return d.bank;
  const w = WL().find((x) => (x.aliases || [x.name.toLowerCase()]).some((a) => a.replace(/\s/g, '') === pay));
  return w ? w.id : d.cash;
}
const PAY_LABEL = { cash: 'tunai', card: 'kartu/debit', gopay: 'GoPay', ovo: 'OVO', dana: 'DANA', shopeepay: 'ShopeePay', linkaja: 'LinkAja' };
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
  <span class="lab">Tanggal${r.date ? '' : ' <em class="from-receipt warn">· tidak terbaca, diisi hari ini</em>'}</span><input class="field" type="date" id="stDate" value="${f.date}" max="${T()}">
  <span class="lab">Kategori</span><div class="hscroll">${OUTC().map((k) => `<button class="chip cat ${f.cat === k ? 'on' : ''}" style="--c:${CATS[k].c}" data-a="stset" data-k="cat" data-v="${k}"><i data-lucide="${CATS[k].i}"></i>${CATS[k].n}</button>`).join('')}</div>
  <div class="hscroll">${c.subs.map((x) => `<button class="chip ${f.sub === x ? 'on' : ''}" data-a="stset" data-k="sub" data-v="${esc(x)}">${esc(x)}</button>`).join('')}</div>
  <span class="lab">Dibayar pakai${r.pay ? ` <em class="from-receipt">· struk: ${PAY_LABEL[r.pay] || r.pay}</em>` : ''}</span><div class="hscroll">${wchips}</div>
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
    S.struk = { ...mine, phase: 'done', res, form: { amount: res.total || 0, note: receiptNote(res), date: res.date || T(), cat: g.cat, sub: g.sub, wallet: receiptWallet(res.pay) } };
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
      ${s.pick === i ? `<div class="picker">${(r.type === 'in' ? INC() : OUTC()).map((k) => `<button class="chip cat" style="--c:${CATS[k].c}" data-a="impSet" data-i="${i}" data-cat="${k}"><i data-lucide="${CATS[k].i}"></i>${CATS[k].n}</button>`).join('')}${r.type === 'out' ? WL().filter((w) => w.id !== s.wallet).map((w) => `<button class="chip" data-a="impSet" data-i="${i}" data-to="${w.id}"><i data-lucide="arrow-left-right"></i>Ke ${esc(w.name)}</button>`).join('') : ''}</div>` : ''}`;
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
    const pk = S.nlPick === i && p.type !== 'tf' ? `<div class="picker">${(p.type === 'in' ? INC().concat(OUTC()) : OUTC().concat(INC())).map((k, j) => `<button class="chip cat" style="--c:${CATS[k].c};--i:${j}" data-a="pvset" data-i="${i}" data-cat="${k}"><i data-lucide="${CATS[k].i}"></i>${CATS[k].n}</button>`).join('')}</div>` : '';
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
  const m = S.m, cats = m.type === 'in' ? INC() : OUTC(), amt = Number(m.amt) || 0, today = T();
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
  const land = () => { S.dispTotal = heroVal(); setOdo($('odo'), S.dispTotal); impact(to, label); toast(msg); };
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
    // Move with transform only (no left/top → no layout per frame); sparse trail without glow shadows.
    f.style.transform = `translate(${(x - from.x).toFixed(1)}px,${(y - from.y).toFixed(1)}px) translate(-50%,-50%) scale(${(sc * Math.max(0.12, Math.abs(spin))).toFixed(3)},${sc.toFixed(3)})`;
    if (now - lt > 32) { lt = now; const s = document.createElement('span'); s.className = 'trail'; const sz = 5 + Math.random() * 7 * (1 - e * 0.4); s.style.cssText = `left:${x + (Math.random() - 0.5) * 12}px;top:${y + (Math.random() - 0.5) * 12}px;width:${sz}px;height:${sz}px;background:${cols[(Math.random() * cols.length) | 0]}`; f.parentNode.appendChild(s); setTimeout(() => s.remove(), 640); }
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
  for (let i = 0; i < 18; i++) { const b = document.createElement('span'); b.className = 'burst'; const a = Math.random() * Math.PI * 2, r = 60 + Math.random() * 110; b.style.cssText = `left:${x}px;top:${y}px;background:${cols[i % cols.length]};--x:${Math.cos(a) * r}px;--y:${Math.sin(a) * r - 30}px;border-radius:${i % 2 ? '50%' : '3px'};width:${6 + Math.random() * 6}px;height:${6 + Math.random() * 6}px`; ph.appendChild(b); setTimeout(() => b.remove(), 950); }
}
let toastT;
function toast(msg, undo) {
  const el = $('toast'); el.innerHTML = `<i data-lucide="sparkles"></i><span>${esc(msg)}</span>${undo ? '<button class="undo" id="undoBtn">Urungkan</button>' : ''}`; icons();
  el.classList.remove('show'); void el.offsetWidth; el.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove('show'), undo ? 4500 : 2400);
  if (undo) $('undoBtn').onclick = () => { el.classList.remove('show'); undo(); };
  if (S.bNote) { clearTimeout(S.bNoteT); S.bNoteT = setTimeout(flushBudgetNote, undo ? 4700 : 2600); }
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
  const t = TX().find((x) => x.id === id); if (!t) return; const c = catOf(t), w = W(t.wallet), rule = t.rec ? store.data.rules.find((r) => r.id === t.rec) : null;
  openSheet('Detail transaksi', `<div class="det-top"><span class="ic" style="--c:${c.c}"><i data-lucide="${c.i}"></i></span><div class="a" style="color:${t.type === 'in' ? 'var(--in)' : t.type === 'tf' ? 'var(--transfer)' : 'var(--ink)'}">${t.type === 'in' ? '+' : t.type === 'out' ? '−' : ''}${money(t.amount)}</div><p>${esc(t.note)}</p></div>
  <div class="card" style="padding:4px 14px">
    <div class="kv" style="border-top:0"><span>Kategori</span><b>${t.type === 'tf' ? (t.debt ? c.n : 'Transfer') : `${c.n} · ${esc(t.sub)}`}</b></div>
    <div class="kv"><span>${t.type === 'tf' ? 'Dari → Ke' : 'Dompet'}</span><b>${t.type === 'tf' ? `${esc(w.name)} → ${esc(W(t.to).name)}` : esc(w.name)}</b></div>
    <div class="kv"><span>Tanggal</span><b>${longDate(t.date)}</b></div>
    <div class="kv"><span>Buku</span><b>${(BOOKS[t.book] || BOOKS.pribadi).n}</b></div>${rule ? `<div class="kv"><span>Berulang</span><b>${scheduleLabel(rule)} · ${rule.auto ? 'otomatis' : 'tanya dulu'}</b></div>` : ''}</div>
  ${t.debt ? `<button class="btn2 wide" data-a="debt" data-id="${t.debt}"><i data-lucide="hand-coins"></i>Buka catatan utang & piutang</button>` : txButtons(t, rule)}
  ${t.debtInit ? '' : `<button class="danger" data-a="del" data-id="${t.id}">Hapus transaksi</button>`}`);
}
function txButtons(t, rule) {
  return `  <div class="btn-row"><button class="btn2" data-a="edit" data-id="${t.id}"><i data-lucide="pencil"></i>Ubah</button><button class="btn2" data-a="dup" data-id="${t.id}"><i data-lucide="copy"></i>Duplikat hari ini</button></div>
  ${rule ? `<button class="btn2 wide" data-a="ruleEdit" data-id="${rule.id}"><i data-lucide="repeat"></i>Atur jadwal berulang</button>` : `<button class="btn2 wide" data-a="ruleNew" data-id="${t.id}"><i data-lucide="repeat"></i>Jadikan berulang (gaji, cicilan, langganan)</button>`}`;
}
function bookRows(asCards) {
  const on = store.data.settings.books || ['pribadi'], cur = BK();
  const row = (k) => { const b = BOOKS[k], active = on.includes(k), here = k === cur;
    if (asCards) return `<button class="book ${here ? 'on' : active ? '' : 'off'}" data-a="${active ? 'bookGo' : 'bookOn'}" data-b="${k}"><span class="ic" style="--c:${b.c}"><i data-lucide="${b.i}"></i></span><b>${b.n}</b><small>${here ? 'Sedang dibuka' : active ? 'Ketuk untuk membuka' : 'Aktifkan'}</small></button>`;
    return `<button class="tx" data-a="${active ? 'bookGo' : 'bookOn'}" data-b="${k}"><span class="ic" style="--c:${b.c}"><i data-lucide="${b.i}"></i></span><span class="tx-main"><b>${b.n}</b><small>${active ? b.d : 'Belum aktif · ketuk untuk mengaktifkan'}</small></span>${here ? '<i data-lucide="check" style="color:var(--brand)"></i>' : active ? '<i data-lucide="chevron-right"></i>' : '<i data-lucide="plus" style="color:var(--ink-3)"></i>'}</button>`; };
  return Object.keys(BOOKS).map(row).join('');
}
function sBooks() {
  openSheet('Pilih buku', `<p class="confirm-text">Setiap buku punya catatan, rekap, dan anggaran sendiri, jadi uang pribadi tidak tercampur dengan freelance atau usaha.</p>
  <div class="list">${bookRows(false)}
    <button class="tx" data-a="toast" data-msg="Buku bersama pasangan disiapkan untuk tahap berikutnya"><span class="ic" style="--c:#8B5CF6"><i data-lucide="users"></i></span><span class="tx-main"><b>Keluarga</b><small>Untuk nanti, bersama pasangan</small></span><i data-lucide="lock" style="color:var(--ink-3)"></i></button>
  </div>`);
}
function applyBookTint() { document.documentElement.dataset.book = BK(); }
function switchBook(b) {
  if (!BOOKS[b]) return;
  closeSheet(true);
  if (b === BK()) return;
  store.setSetting('curBook', b); applyBookTint();
  S.mk = null; S.drill = null; S.wsel = null; S.bSeen = null; closeDrill(true);
  refresh(); goTab(S.idx === 2 ? 2 : 0); toast(`Buku ${BOOKS[b].n}`);
}
function activateBook(b) {
  const B = BOOKS[b]; if (!B) return;
  sConfirm(`Aktifkan buku ${B.n}?`, `Buku <b>${B.n}</b> punya catatan, rekap, dan anggaran sendiri, dengan kategori khusus (${catsFor(b, true).filter((k) => CATS[k].book).concat(catsFor(b, false).filter((k) => CATS[k].book)).map((k) => CATS[k].n).join(', ')}).<br><br>Dompet yang sudah ada dipakai bersama semua buku, jadi saldonya tetap satu. Anda juga bisa menambah dompet khusus, misalnya kas ${b === 'usaha' ? 'toko' : 'proyek'}. Di Beranda buku ini, angka besar menunjukkan <b>laba bersih bulan ini</b>.`, 'Aktifkan', () => {
    store.setSetting('books', Array.from(new Set([...(store.data.settings.books || ['pribadi']), b])));
    switchBook(b);
  });
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
  WF = { book: w ? (w.book || 'pribadi') : BK(), id: w ? w.id : null, name: w ? w.name : '', group: w ? w.group : 'E-wallet', color: w ? w.color : WALLET_COLORS[store.data.wallets.length % WALLET_COLORS.length], no: w?.no || '', init: w ? String(w.init) : '' };
  const used = id ? TX().filter((t) => t.wallet === id || t.to === id).length : 0;
  openSheet(w ? 'Ubah dompet' : 'Tambah dompet', `
    <span class="lab">Nama</span><input class="field" id="wfName" maxlength="28" value="${esc(WF.name)}" placeholder="mis. BCA, OVO, Jenius" autocomplete="off">
    <span class="lab">Jenis</span><div class="seg" id="wfGroup" style="margin-bottom:12px"><span class="pill"></span>${['Bank', 'E-wallet', 'Tunai'].map((g) => `<button class="${WF.group === g ? 'on' : ''}" data-a="wfGroup" data-v="${g}">${g}</button>`).join('')}</div>
    ${isPersonal() && (!w || (w.book || 'pribadi') === 'pribadi') ? '' : `<span class="lab">Dipakai di</span><div class="seg" id="wfBook" style="margin-bottom:12px"><span class="pill"></span><button class="${WF.book === 'pribadi' ? 'on' : ''}" data-a="wfBook" data-v="pribadi">Semua buku</button><button class="${WF.book !== 'pribadi' ? 'on' : ''}" data-a="wfBook" data-v="${w && w.book !== 'pribadi' ? w.book : BK()}">Hanya ${BOOKS[w && w.book !== 'pribadi' ? w.book : BK()].n}</button></div>`}
    <span class="lab">Warna kartu</span><div class="swatches">${WALLET_COLORS.map((c) => `<button class="${WF.color === c ? 'on' : ''}" style="--c:${c}" data-a="wfColor" data-v="${c}" aria-label="Warna ${c}"></button>`).join('')}</div>
    <span class="lab">4 digit terakhir (opsional)</span><input class="field" id="wfNo" inputmode="numeric" maxlength="4" value="${esc(WF.no)}" placeholder="mis. 4821" autocomplete="off">
    <span class="lab">Saldo awal</span><input class="field" id="wfInit" inputmode="numeric" value="${WF.init ? fmtN(Number(WF.init)) : ''}" placeholder="0" autocomplete="off">
    <p class="form-note">Saldo awal adalah saldo sebelum transaksi pertama yang Anda catat di aplikasi ini.</p>
    <button class="primary" data-a="wfSave"><i data-lucide="check"></i>Simpan dompet</button>
    ${w ? (used ? `<p class="form-note" style="margin-top:12px">Dompet ini dipakai di ${used} transaksi, jadi tidak bisa dihapus.</p>` : `<button class="danger" data-a="wfDelete" data-id="${w.id}">Hapus dompet</button>`) : ''}`);
  later(60, () => { placePill($('wfGroup')); placePill($('wfBook')); });
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
  await saveFile(new File([json], name, { type: 'application/json' }), 'Cadangan Do it Dip', 'Cadangan siap disimpan');
}
async function readBackupFile(file) {
  let obj; try { obj = JSON.parse(await file.text()); } catch { toast('File tidak bisa dibaca sebagai cadangan'); return; }
  const err = store.checkBackup(obj); if (err) { toast(err); return; }
  const n = obj.data.tx.length, when = obj.exportedAt ? longDate(obj.exportedAt.slice(0, 10)) : 'tanggal tidak diketahui';
  const go = async () => { await store.importAll(obj); afterDataReset(); toast(`Cadangan dipulihkan: ${n} transaksi`); };
  if (!store.data.settings.onboarded || TX().length === 0) { closeSheet(true); await go(); return; }
  sConfirm('Pulihkan cadangan?', `Cadangan dari ${when} berisi <b>${n} transaksi</b>. Semua data di perangkat ini akan diganti dengan isi cadangan dan tidak bisa dibatalkan. Sebaiknya ekspor cadangan data saat ini dulu.`, 'Ganti dengan cadangan', go);
}
/* ================= files (share sheet on iPhone, download on laptop) ================= */
async function saveFile(file, title, doneMsg) {
  const touch = window.matchMedia && matchMedia('(pointer: coarse)').matches;
  try {
    if (touch && navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title }); toast(doneMsg); return; }
  } catch (e) { if (e && e.name === 'AbortError') return; }
  const a = document.createElement('a'); a.href = URL.createObjectURL(file); a.download = file.name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000); toast('Diunduh: ' + file.name);
}

/* ================= recurring transactions ================= */
const lc1 = (s) => s.charAt(0).toLowerCase() + s.slice(1);
const RULES = () => store.data.rules.slice().sort((a, b) => (nextAfter(a, a.last) < nextAfter(b, b.last) ? -1 : 1));
const ruleCat = (r) => (r.type === 'tf' ? { n: 'Transfer', c: '#3D7BFF', i: 'arrow-left-right' } : CATS[r.cat] || CATS.lain);
const ruleMeta = (r) => (r.type === 'tf' ? `${esc(W(r.wallet).name)} → ${esc(W(r.to).name)}` : `${esc(r.sub || ruleCat(r).n)} · ${esc(W(r.wallet).name)}`);
/** Rules waiting for confirmation on Beranda: the oldest due date of each "ask first" rule. */
const dueAsk = () => RULES().filter((r) => !r.auto && (r.book || 'pribadi') === BK()).map((r) => ({ r, d: dueDates(r, T()) })).filter((x) => x.d.length);
/** Record what is due for "automatic" rules. Ids are fixed per date, so running it twice (or on two devices) never duplicates. */
function runRecurring() {
  if (!store.data.settings.onboarded) return;
  const made = [];
  for (const r of store.data.rules) {
    if (!r.auto) continue;
    const ds = dueDates(r, T()); if (!ds.length) continue;
    for (const d of ds) if (store.addTxWithId(occurrenceTx(r, d, Date.now()))) made.push(r.note);
    store.saveRule({ ...r, last: ds[ds.length - 1] });
  }
  if (made.length) { refresh(); toast(made.length === 1 ? `${made[0]} dicatat otomatis` : `${made.length} transaksi berulang dicatat otomatis`); }
  else if (dueAsk().length && PANELS[0]) { renderPanel(0); icons(); setOdo($('odo'), S.dispTotal, true); }
}
function recordDue(id, amount) {
  const r = store.data.rules.find((x) => x.id === id); if (!r) return;
  const d = dueDates(r, T())[0]; if (!d) return;
  const t = occurrenceTx(r, d, Date.now(), amount || r.amount);
  store.addTxWithId(t); store.saveRule({ ...r, last: d });
  markFresh([t]); closeSheet(); refresh(); toast(`${r.note} dicatat · ${rp(t.amount)}`);
}
function dueCardHTML() {
  const list = dueAsk(); if (!list.length) return '';
  return `<div class="sec-h st" style="--i:4"><h3>Jatuh tempo</h3><small>${list.length} menunggu dicatat</small></div>
  <div class="list due st" style="--i:4">${list.map(({ r, d }) => { const c = ruleCat(r); return `<div class="tx due-row">
    <button class="due-main" data-a="dueOpen" data-id="${r.id}"><span class="ic" style="--c:${c.c}"><i data-lucide="${c.i}"></i></span><span class="tx-main"><b>${esc(r.note)}</b><small>${dayLabel(d[0], T())}${d.length > 1 ? ` · +${d.length - 1} lagi` : ''} · ${money(r.amount)}</small></span></button>
    <button class="due-go" data-a="dueRec" data-id="${r.id}" aria-label="Catat ${esc(r.note)}"><i data-lucide="check"></i>Catat</button></div>`; }).join('')}</div>`;
}
function sDue(id) {
  const r = store.data.rules.find((x) => x.id === id); if (!r) return; const d = dueDates(r, T())[0]; if (!d) return; const c = ruleCat(r);
  openSheet('Jatuh tempo', `<div class="det-top"><span class="ic" style="--c:${c.c}"><i data-lucide="${c.i}"></i></span><p>${esc(r.note)}</p><small class="rf-sub">${ruleMeta(r)} · ${longDate(d)}</small></div>
    <span class="lab">Nominal kali ini</span><input class="field" id="dueAmt" inputmode="numeric" value="${fmtN(r.amount)}" autocomplete="off">
    <p class="form-note">Ubah nominalnya kalau tagihan bulan ini berbeda. Jadwalnya tetap ${lc1(scheduleLabel(r))}.</p>
    <button class="primary" data-a="dueSave" data-id="${r.id}"><i data-lucide="check"></i>Catat</button>
    <div class="btn-row"><button class="btn2" data-a="dueSkip" data-id="${r.id}"><i data-lucide="skip-forward"></i>Lewati kali ini</button><button class="btn2" data-a="ruleEdit" data-id="${r.id}"><i data-lucide="repeat"></i>Atur jadwal</button></div>`);
}
let RF = null; // rule form: { r: draft rule, isNew, txId }
function rfInner() {
  const r = RF.r, next = nextAfter(r, r.last);
  const days = r.every === 'month'
    ? Array.from({ length: 31 }, (_, i) => i + 1).map((n) => `<button class="chip ${r.day === n ? 'on' : ''}" data-a="rfDay" data-v="${n}">${n === 31 ? 'Akhir bulan' : n}</button>`).join('')
    : HARI_P.map((h, i) => `<button class="chip ${r.day === i ? 'on' : ''}" data-a="rfDay" data-v="${i}">${h}</button>`).join('');
  return `<span class="lab">Nominal</span><input class="field" id="rfAmt" inputmode="numeric" value="${r.amount ? fmtN(r.amount) : ''}" placeholder="0" autocomplete="off">
    <span class="lab">Ulangi</span><div class="seg" id="rfEvery" style="margin-bottom:12px"><span class="pill"></span><button class="${r.every === 'month' ? 'on' : ''}" data-a="rfEvery" data-v="month">Tiap bulan</button><button class="${r.every === 'week' ? 'on' : ''}" data-a="rfEvery" data-v="week">Tiap minggu</button></div>
    <span class="lab">${r.every === 'month' ? 'Tanggal' : 'Hari'}</span><div class="hscroll" id="rfDays">${days}</div>
    <span class="lab">Saat jatuh tempo</span><div class="seg" id="rfAuto" style="margin-bottom:10px"><span class="pill"></span><button class="${r.auto ? 'on' : ''}" data-a="rfAuto" data-v="1">Catat otomatis</button><button class="${r.auto ? '' : 'on'}" data-a="rfAuto" data-v="0">Tanya dulu</button></div>
    <p class="form-note">Berikutnya <b>${longDate(next)}</b>. ${r.auto ? 'Langsung dicatat saat aplikasi dibuka pada hari itu atau sesudahnya. Cocok untuk gaji dan cicilan tetap.' : 'Muncul di Beranda untuk dikonfirmasi, dan nominalnya bisa diubah. Cocok untuk listrik atau tagihan yang berubah-ubah.'}</p>
    <button class="primary" data-a="rfSave"><i data-lucide="check"></i>${RF.isNew ? 'Jadikan berulang' : 'Simpan'}</button>
    ${RF.isNew ? '' : '<button class="danger" data-a="rfDelete">Hentikan pengulangan</button><p class="form-note" style="margin-top:10px;text-align:center">Transaksi yang sudah tercatat tidak ikut terhapus.</p>'}`;
}
function rfDraw() {
  const b = $('rfBody'); if (!b) return; const sc = b.closest('.sheet-body')?.scrollTop || 0;
  b.innerHTML = rfInner(); icons(); placePill($('rfEvery')); placePill($('rfAuto'));
  const on = b.querySelector('#rfDays .chip.on'); if (on) on.parentElement.scrollLeft = on.offsetLeft - 60;
  if (b.closest('.sheet-body')) b.closest('.sheet-body').scrollTop = sc;
}
function sRuleForm(r, isNew, txId) {
  RF = { r: { ...r }, isNew, txId }; const c = ruleCat(r);
  openSheet(isNew ? 'Jadikan berulang' : 'Transaksi berulang', `<div class="rf-top"><span class="ic" style="--c:${c.c}"><i data-lucide="${c.i}"></i></span><div class="tx-main"><b>${esc(r.note)}</b><small>${ruleMeta(r)}</small></div></div><div id="rfBody">${rfInner()}</div>`);
  later(60, rfDraw);
}
function sRuleFromTx(id) {
  const t = TX().find((x) => x.id === id); if (!t) return;
  const r = ruleFromTx(t, store.newRuleId(), 'month', Date.now());
  if (r.last < T()) r.last = T(); // never back-fill the months between an old transaction and today
  sRuleForm(r, true, t.id);
}

/* ================= savings goals & debts ================= */
const GOAL_ICONS = ['piggy-bank', 'shield-check', 'plane', 'house', 'car', 'bike', 'graduation-cap', 'heart', 'gift', 'laptop', 'baby', 'gem'];
const GOAL_COLORS = ['#13A894', '#3D8BFF', '#8B5CF6', '#E04BB5', '#F0A010', '#F25A24', '#2E9E58', '#0B7C8A'];
const GOALS = () => store.data.goals.slice().sort((a, b) => (a.done - b.done) || (b.createdAt - a.createdAt));
const DEBTS = () => store.data.debts.slice().sort((a, b) => (debtDone(a, TX()) - debtDone(b, TX())) || (a.date < b.date ? 1 : -1));
const freeCash = () => totalBalance() - allocated(store.data.goals);
const DEBT_C = { utang: '#E11D48', piutang: '#0EA5E9' };
const debtLabel = (d) => (d.kind === 'utang' ? 'Utang ke ' : 'Piutang ke ') + d.name;
function ring(p, c, size = 52, sw = 6, inner = '') {
  const r = (size - sw) / 2, C = 2 * Math.PI * r;
  return `<span class="gring" style="width:${size}px;height:${size}px"><svg viewBox="0 0 ${size} ${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${r}" stroke="color-mix(in srgb,${c} 18%,transparent)" stroke-width="${sw}" fill="none"/><circle class="gval" cx="${size / 2}" cy="${size / 2}" r="${r}" stroke="${c}" stroke-width="${sw}" fill="none" stroke-linecap="round" stroke-dasharray="${(C * p).toFixed(1)} ${C.toFixed(1)}" transform="rotate(-90 ${size / 2} ${size / 2})" style="--full:${C.toFixed(1)}"/></svg>${inner}</span>`;
}
function planHTML() {
  const nw = netWorth(totalBalance(), store.data.debts, TX()), gs = GOALS(), ds = DEBTS(), free = freeCash();
  const show = S.wall, mask = (n) => (show ? money(n) : '<span class="m">Rp ••••••</span>');
  const goalRow = (g) => {
    const p = goalPct(g), need = monthlyNeed(g, T()), reached = goalLeft(g) === 0;
    const sub = reached ? 'Tercapai, selamat!' : need ? `Sisihkan ${short(need)}/bulan sampai ${BLN[Number(g.deadline.slice(5, 7)) - 1]} ${g.deadline.slice(0, 4)}` : `Kurang ${short(goalLeft(g))}`;
    return `<button class="goal" data-a="goal" data-id="${g.id}" style="--c:${g.color}">${ring(p, g.color, 52, 6, `<i data-lucide="${g.icon}"></i>`)}
      <span class="tx-main"><b>${esc(g.name)}</b><small>${money(goalSaved(g))} dari ${short(g.target)} · ${pct(p)}</small><small class="${reached ? 'ok' : ''}">${sub}</small></span><i data-lucide="chevron-right"></i></button>`;
  };
  const debtRow = (d) => {
    const left = debtLeft(d, TX()), paid = d.amount ? 1 - left / d.amount : 1, done = left === 0;
    const due = !done && d.due ? ` · tempo ${dayLabel(d.due, T())}` : '';
    return `<button class="tx debt-row" data-a="debt" data-id="${d.id}"><span class="ic" style="--c:${DEBT_C[d.kind]}"><i data-lucide="${d.kind === 'utang' ? 'hand-coins' : 'handshake'}"></i></span>
      <span class="tx-main"><b>${esc(d.name)}</b><small>${done ? 'Lunas' : `${d.kind === 'utang' ? 'Sisa utang' : 'Belum kembali'} dari ${short(d.amount)}${due}`}</small><span class="dbar"><i style="width:${Math.round(paid * 100)}%;background:${DEBT_C[d.kind]}"></i></span></span>
      <span class="amt ${done ? 'done' : d.kind === 'utang' ? 'out' : 'in'}">${done ? '<i data-lucide="check"></i>' : money(left)}</span></button>`;
  };
  return `<div class="sec-h"><h3>Kekayaan bersih</h3><small>aset dikurangi utang</small></div>
  <div class="card nw-card">
    <div class="nw-big ${nw.net < 0 ? 'neg' : ''}">${mask(nw.net)}</div>
    <div class="nw-rows"><span>Saldo dompet</span><b>${mask(nw.cash)}</b><span>Piutang (uang Anda di orang lain)</span><b class="in">${show ? '+' : ''}${mask(nw.receivable)}</b><span>Utang</span><b class="out">${show ? '−' : ''}${mask(nw.owed)}</b></div>
    ${show ? '' : '<p class="form-note" style="margin:8px 0 0">Ketuk “Tampilkan semua saldo” di atas untuk melihat angkanya.</p>'}</div>
  <div class="sec-h"><h3>Target tabungan</h3>${gs.length ? `<small>saldo bebas ${short(free)}</small>` : ''}</div>
  ${gs.length ? `<div class="goals">${gs.map(goalRow).join('')}</div>` : '<div class="empty-card"><b>Belum ada target</b>Misalnya dana darurat 6× pengeluaran bulanan, liburan, atau DP rumah. Uangnya tetap di dompet; target hanya menandai berapa yang sudah disisihkan.</div>'}
  <button class="btn2 dash" data-a="goalNew" style="margin-top:10px"><i data-lucide="target"></i>Tambah target tabungan</button>
  <div class="sec-h"><h3>Utang & piutang</h3>${ds.length ? `<small>${ds.filter((d) => !debtDone(d, TX())).length} belum lunas</small>` : ''}</div>
  ${ds.length ? `<div class="list">${ds.map(debtRow).join('')}</div>` : '<div class="empty-card"><b>Belum ada catatan</b>Catat pinjaman, kredit motor, paylater, atau uang yang Anda pinjamkan ke teman. Cicilannya tercatat rapi dan sisanya selalu kelihatan.</div>'}
  <button class="btn2 dash" data-a="debtNew" style="margin-top:10px"><i data-lucide="hand-coins"></i>Catat utang atau piutang</button>`;
}

/* ---- goal sheets ---- */
let GF = null;
function gfInner() {
  return `<span class="lab">Nama target</span><input class="field" id="gfName" maxlength="28" value="${esc(GF.name)}" placeholder="mis. Dana darurat, Liburan Bali" autocomplete="off">
    <span class="lab">Ikon & warna</span><div class="hscroll">${GOAL_ICONS.map((i) => `<button class="chip ${GF.icon === i ? 'on' : ''}" data-a="gfIcon" data-v="${i}" aria-label="${i}"><i data-lucide="${i}"></i></button>`).join('')}</div>
    <div class="swatches">${GOAL_COLORS.map((c) => `<button class="${GF.color === c ? 'on' : ''}" style="--c:${c}" data-a="gfColor" data-v="${c}" aria-label="Warna ${c}"></button>`).join('')}</div>
    <span class="lab">Jumlah yang dituju</span><input class="field" id="gfTarget" inputmode="numeric" value="${GF.target ? fmtN(GF.target) : ''}" placeholder="0" autocomplete="off">
    ${GF.hint ? `<p class="form-note" style="margin-top:-4px">${GF.hint}</p>` : ''}
    <span class="lab">Tenggat (opsional)</span><input class="field" type="date" id="gfDeadline" value="${GF.deadline}" min="${T()}">
    <button class="primary" data-a="gfSave"><i data-lucide="check"></i>${GF.id ? 'Simpan' : 'Buat target'}</button>
    ${GF.id ? '<button class="danger" data-a="gfDelete">Hapus target</button>' : ''}`;
}
function gfDraw() { const b = $('gfBody'); if (!b) return; b.innerHTML = gfInner(); icons(); }
function sGoalForm(id) {
  const g = id ? store.data.goals.find((x) => x.id === id) : null;
  // suggest an emergency fund of 6 months of average spending (last 3 full months)
  const mk = T().slice(0, 7), avg = [1, 2, 3].map((i) => stats(TX(), addMonths(mk, -i)).out).reduce((s, v) => s + v, 0) / 3;
  GF = g ? { id: g.id, name: g.name, icon: g.icon, color: g.color, target: g.target, deadline: g.deadline, hint: '' }
    : { id: null, name: '', icon: 'piggy-bank', color: GOAL_COLORS[store.data.goals.length % GOAL_COLORS.length], target: 0, deadline: '', hint: avg > 0 ? `Patokan dana darurat: 6× pengeluaran rata-rata (${short(avg)}/bulan) ≈ <b>${short(Math.round(avg * 6 / 100000) * 100000)}</b>.` : '' };
  openSheet(g ? 'Ubah target' : 'Target tabungan baru', `<div id="gfBody">${gfInner()}</div>`);
  if (!g) later(350, () => $('gfName')?.focus());
}
function sGoal(id) {
  const g = store.data.goals.find((x) => x.id === id); if (!g) return;
  const p = goalPct(g), need = monthlyNeed(g, T()), eta = etaMonths(g, T()), left = goalLeft(g);
  const log = g.log.slice().reverse().slice(0, 8);
  openSheet(g.name, `<div class="det-top">${ring(p, g.color, 120, 11, `<i data-lucide="${g.icon}"></i><b class="gpct">${pct(p)}</b>`)}<div class="a">${money(goalSaved(g))}</div><p>dari ${money(g.target)}</p></div>
    <div class="card" style="padding:4px 14px">
      <div class="kv" style="border-top:0"><span>Kurang</span><b>${money(left)}</b></div>
      ${g.deadline ? `<div class="kv"><span>Tenggat</span><b>${longDate(g.deadline)}</b></div>` : ''}
      ${need ? `<div class="kv"><span>Perlu disisihkan</span><b>${money(need)}/bulan</b></div>` : ''}
      ${left && eta ? `<div class="kv"><span>Dengan laju 3 bulan terakhir</span><b>tercapai ±${eta} bulan lagi</b></div>` : ''}
      <div class="kv"><span>Saldo bebas (belum disisihkan)</span><b>${money(freeCash())}</b></div></div>
    <span class="lab">Nominal</span><input class="field" id="gAmt" inputmode="numeric" placeholder="${need ? fmtN(need) : '0'}" autocomplete="off">
    <div class="btn-row"><button class="btn2" data-a="gTake" data-id="${g.id}"><i data-lucide="arrow-up-right"></i>Ambil</button><button class="btn2 go" data-a="gPut" data-id="${g.id}"><i data-lucide="piggy-bank"></i>Sisihkan</button></div>
    <p class="form-note">Menyisihkan tidak memindahkan uang antar dompet, hanya menandai bagian saldo yang sudah punya tujuan.</p>
    ${log.length ? `<div class="sec-h"><h3>Riwayat</h3></div><div class="list">${log.map((e) => `<div class="tx"><span class="ic" style="--c:${e.amount > 0 ? g.color : '#94A3B8'}"><i data-lucide="${e.amount > 0 ? 'arrow-down-left' : 'arrow-up-right'}"></i></span><span class="tx-main"><b>${e.amount > 0 ? 'Disisihkan' : 'Diambil'}</b><small>${dayLabel(e.date, T())}</small></span><span class="amt ${e.amount > 0 ? 'in' : 'out'}">${e.amount > 0 ? '+' : '−'}${money(Math.abs(e.amount))}</span></div>`).join('')}</div>` : ''}
    <button class="btn2 wide" data-a="goalEdit" data-id="${g.id}" style="margin-top:12px"><i data-lucide="pencil"></i>Ubah target</button>`);
}
function goalMove(id, sign) {
  const g = store.data.goals.find((x) => x.id === id); if (!g) return;
  const raw = Number(digitsOnly($('gAmt')?.value || '')) || (sign > 0 ? monthlyNeed(g, T()) : 0);
  if (!raw) { toast('Isi nominalnya dulu'); $('gAmt')?.focus(); return; }
  if (sign > 0 && raw > freeCash()) { toast(`Melebihi saldo bebas (${rp(freeCash())})`); return; }
  if (sign < 0 && raw > goalSaved(g)) { toast(`Maksimal ${rp(goalSaved(g))}`); return; }
  const was = goalLeft(g);
  store.saveGoal({ ...g, log: [...g.log, { date: T(), amount: sign * raw }] });
  const ng = store.data.goals.find((x) => x.id === id);
  if (sign > 0 && was > 0 && goalLeft(ng) === 0) { closeSheet(); refresh(); toast(`Target ${g.name} tercapai! 🎉`); if (!reduced()) burst(app().clientWidth / 2, app().clientHeight / 3); return; }
  sGoal(id); refresh(); toast(sign > 0 ? `${rp(raw)} disisihkan untuk ${g.name}` : `${rp(raw)} diambil dari ${g.name}`);
}

/* ---- debt sheets ---- */
let DF = null;
function dfInner() {
  const isNew = !DF.id, u = DF.kind === 'utang';
  return `${isNew ? `<div class="seg" id="dfKind" style="margin-bottom:12px"><span class="pill"></span><button class="${u ? 'on' : ''}" data-a="dfKind" data-v="utang">Saya berutang</button><button class="${u ? '' : 'on'}" data-a="dfKind" data-v="piutang">Orang berutang</button></div>` : ''}
    <span class="lab">${u ? 'Berutang ke' : 'Siapa yang berutang'}</span><input class="field" id="dfName" maxlength="28" value="${esc(DF.name)}" placeholder="${u ? 'mis. Budi, Kredit motor, SPayLater' : 'mis. Andi'}" autocomplete="off">
    <span class="lab">Jumlah ${u ? 'utang' : 'piutang'}</span><input class="field" id="dfAmt" inputmode="numeric" value="${DF.amount ? fmtN(DF.amount) : ''}" placeholder="0" autocomplete="off">
    ${isNew ? `<span class="lab">${u ? 'Uangnya masuk ke' : 'Uangnya keluar dari'}</span><div class="hscroll">${WL().map((w) => `<button class="chip ${DF.wallet === w.id ? 'on' : ''}" data-a="dfWallet" data-v="${w.id}"><i data-lucide="${WALLET_ICON[w.group]}"></i>${esc(w.name)}</button>`).join('')}<button class="chip ${DF.wallet ? '' : 'on'}" data-a="dfWallet" data-v=""><i data-lucide="x"></i>${u ? 'Tidak ada (kredit/paylater)' : 'Tidak ada (jasa/barang)'}</button></div>
    <p class="form-note" style="margin-top:-4px">${DF.wallet ? (u ? 'Saldo dompet bertambah, tapi tidak dihitung sebagai pemasukan. Pembayarannya juga tidak dihitung pengeluaran (belanjanya sudah tercatat sendiri).' : 'Saldo dompet berkurang, tapi tidak dihitung sebagai pengeluaran. Uang yang kembali juga tidak dihitung pemasukan.') : (u ? 'Tidak ada uang yang masuk (misalnya beli motor secara kredit), jadi setiap cicilan dihitung sebagai pengeluaran Tagihan · Cicilan.' : 'Tidak ada uang yang keluar (misalnya jasa yang belum dibayar), jadi saat dibayar dihitung sebagai pemasukan.')}</p>
    <span class="lab">Tanggal</span><input class="field" type="date" id="dfDate" value="${DF.date}" max="${T()}">` : ''}
    <span class="lab">Cicilan per bulan (opsional)</span><input class="field" id="dfMonthly" inputmode="numeric" value="${DF.monthly ? fmtN(DF.monthly) : ''}" placeholder="0" autocomplete="off">
    <span class="lab">Jatuh tempo (opsional)</span><input class="field" type="date" id="dfDue" value="${DF.due}">
    <input class="note-in" id="dfNote" placeholder="Catatan (opsional)" value="${esc(DF.note)}" autocomplete="off">
    <button class="primary" data-a="dfSave"><i data-lucide="check"></i>${isNew ? 'Simpan' : 'Simpan perubahan'}</button>
    ${isNew ? '' : '<button class="danger" data-a="dfDelete">Hapus catatan ini</button>'}`;
}
function dfDraw() { const b = $('dfBody'); if (!b) return; b.innerHTML = dfInner(); icons(); placePill($('dfKind')); }
function dfRead() {
  DF.name = ($('dfName')?.value || '').trim(); DF.amount = Number(digitsOnly($('dfAmt')?.value || '')) || 0;
  DF.monthly = Number(digitsOnly($('dfMonthly')?.value || '')) || 0; DF.due = $('dfDue')?.value || ''; DF.note = ($('dfNote')?.value || '').trim();
  if ($('dfDate')?.value) DF.date = $('dfDate').value > T() ? T() : $('dfDate').value;
}
function sDebtForm(id) {
  const d = id ? store.data.debts.find((x) => x.id === id) : null;
  DF = d ? { ...d } : { id: null, kind: 'utang', name: '', amount: 0, date: T(), due: '', monthly: 0, wallet: defaults().bank, note: '' };
  openSheet(d ? 'Ubah catatan' : 'Utang atau piutang', `<div id="dfBody">${dfInner()}</div>`);
  later(60, () => placePill($('dfKind'))); if (!d) later(350, () => $('dfName')?.focus());
}
let PF = null; // payment form
function sDebt(id) {
  const d = store.data.debts.find((x) => x.id === id); if (!d) return;
  const left = debtLeft(d, TX()), paid = debtPaid(d, TX()), u = d.kind === 'utang', list = sorted(TX().filter((t) => t.debt === d.id));
  PF = { id, wallet: PF?.id === id ? PF.wallet : d.wallet || defaults().bank };
  const sug = Math.min(d.monthly || left, left);
  openSheet(debtLabel(d).replace(/^(Utang|Piutang) ke /, u ? 'Utang ke ' : 'Piutang: '), `<div class="det-top"><span class="ic" style="--c:${DEBT_C[d.kind]}"><i data-lucide="${u ? 'hand-coins' : 'handshake'}"></i></span>
      <div class="a" style="color:${left ? (u ? 'var(--out)' : 'var(--in)') : 'var(--ink)'}">${left ? money(left) : 'Lunas'}</div><p>${left ? (u ? 'sisa yang harus dibayar' : 'belum dikembalikan') : `${u ? 'sudah dibayar' : 'sudah kembali'} semua`}</p>
      <span class="dbar big"><i style="width:${d.amount ? Math.round((paid / d.amount) * 100) : 100}%;background:${DEBT_C[d.kind]}"></i></span></div>
    <div class="card" style="padding:4px 14px">
      <div class="kv" style="border-top:0"><span>Jumlah awal</span><b>${money(d.amount)}</b></div>
      <div class="kv"><span>${u ? 'Sudah dibayar' : 'Sudah kembali'}</span><b>${money(paid)}</b></div>
      <div class="kv"><span>Mulai</span><b>${longDate(d.date)}</b></div>
      ${d.due ? `<div class="kv"><span>Jatuh tempo</span><b>${longDate(d.due)}</b></div>` : ''}
      ${d.monthly ? `<div class="kv"><span>Cicilan</span><b>${money(d.monthly)}/bulan${left ? ` · ±${Math.ceil(left / d.monthly)} bulan lagi` : ''}</b></div>` : ''}
      <div class="kv"><span>Uang</span><b>${d.wallet ? `${u ? 'masuk ke' : 'keluar dari'} ${esc(W(d.wallet).name)}` : (u ? 'kredit, cicilan = pengeluaran' : 'jasa/barang, pembayaran = pemasukan')}</b></div>
      ${d.note ? `<div class="kv"><span>Catatan</span><b>${esc(d.note)}</b></div>` : ''}</div>
    ${left ? `<span class="lab">${u ? 'Bayar' : 'Terima'} sekarang</span><input class="field" id="pfAmt" inputmode="numeric" value="${fmtN(sug)}" autocomplete="off">
    <span class="lab">${u ? 'Dibayar dari' : 'Masuk ke'}</span><div class="hscroll">${WL().map((w) => `<button class="chip ${PF.wallet === w.id ? 'on' : ''}" data-a="pfWallet" data-v="${w.id}"><i data-lucide="${WALLET_ICON[w.group]}"></i>${esc(w.name)}</button>`).join('')}</div>
    <input class="field" type="date" id="pfDate" value="${T()}" max="${T()}" aria-label="Tanggal">
    <button class="primary" data-a="pfSave" data-id="${d.id}"><i data-lucide="check"></i>${u ? 'Catat pembayaran' : 'Catat uang kembali'}</button>` : ''}
    ${list.length ? `<div class="sec-h"><h3>Riwayat</h3><small>${list.length} transaksi</small></div>${grouped(list)}` : ''}
    <div class="btn-row" style="margin-top:12px"><button class="btn2" data-a="debtEdit" data-id="${d.id}"><i data-lucide="pencil"></i>Ubah</button></div>`);
}

/* ================= budgets ================= */
const BUDGETS = () => (isPersonal() ? store.data.settings.budgets : store.data.settings.bookBudgets?.[BK()]) || {};
function saveBudgets(b) { if (isPersonal()) store.setSetting('budgets', b); else store.setSetting('bookBudgets', { ...(store.data.settings.bookBudgets || {}), [BK()]: b }); }
const hasBudgets = () => Object.values(BUDGETS()).some((v) => v > 0);
/** Average spending per category over the last 3 full months (only months with data). */
function lastMonthsByCat() {
  const mk = T().slice(0, 7);
  return [1, 2, 3].map((i) => stats(TX(), addMonths(mk, -i)).byCat).filter((m) => Object.keys(m).length);
}
function bdBar(l) { return `<span class="bd-bar lv${l.level}"><i style="width:${Math.min(100, l.used * 100).toFixed(1)}%"></i>${l.pace > 0 && l.pace < 1 ? `<em style="left:${(l.pace * 100).toFixed(1)}%"></em>` : ''}</span>`; }
function budgetCardHTML(mk, st) {
  if (!hasBudgets()) return `<div class="card"><h4>Anggaran</h4><p class="about" style="margin:0 0 10px">Tetapkan batas pengeluaran per kategori setiap bulan. Saya ingatkan saat sudah terpakai 80% dan saat terlewati.</p><button class="btn2 wide" data-a="budget"><i data-lucide="target"></i>Atur anggaran</button></div>`;
  const s = budgetSummary(BUDGETS(), st.byCat, mk, T()), cur = isCurMonth(mk), tot = { level: levelOf(s.spent, s.limit), used: s.used, pace: s.pace };
  return `<div class="card"><h4>Anggaran <button class="h-link" data-a="budget">Atur</button></h4>
    <div class="bd-total"><div><small>${s.left >= 0 ? (cur ? 'Sisa bulan ini' : 'Tersisa') : 'Lewat anggaran'}</small><b class="${s.left < 0 ? 'neg' : ''}">${money(Math.abs(s.left))}</b></div>
      <small>${money(s.spent)} dari ${money(s.limit)}${cur && s.perDay ? `<br>±${short(s.perDay)}/hari sampai akhir bulan` : ''}</small></div>
    ${bdBar(tot)}
    <div class="bd-list">${s.lines.map((l) => { const c = CATS[l.cat]; return `<button class="bd-row" data-a="drill" data-cat="${l.cat}"><span class="ic" style="--c:${c.c}"><i data-lucide="${c.i}"></i></span><span class="bd-main"><span class="bd-top"><b>${c.n}</b><span class="${l.level === 2 ? 'neg' : ''}">${l.left >= 0 ? `sisa ${short(l.left)}` : `lewat ${short(-l.left)}`}</span></span>${bdBar(l)}<small>${short(l.spent)} dari ${short(l.limit)}${cur && l.ahead && l.level < 2 ? ' · lebih cepat dari jadwal' : ''}</small></span></button>`; }).join('')}</div>
    ${cur ? '<p class="form-note" style="margin:10px 0 0">Garis tipis di batang = posisi hari ini dalam bulan. Batang yang melewatinya berarti belanja lebih cepat dari jadwal.</p>' : ''}</div>`;
}
function budgetMiniHTML() {
  if (!hasBudgets()) return '';
  const mk = T().slice(0, 7), s = budgetSummary(BUDGETS(), stats(TX(), mk).byCat, mk, T());
  const hot = s.lines.filter((l) => l.level > 0), tot = { level: levelOf(s.spent, s.limit), used: s.used, pace: s.pace };
  return `<button class="card bd-mini st" style="--i:3" data-a="tab" data-t="1"><span class="bd-top"><small>Anggaran ${BLN[Number(mk.slice(5)) - 1]}</small><small>${hot.length ? `${hot.length} kategori ${hot.some((l) => l.level === 2) ? 'perlu perhatian' : 'hampir habis'}` : 'semua aman'}</small></span>
    <span class="bd-top"><b class="${s.left < 0 ? 'neg' : ''}">${s.left >= 0 ? 'Sisa ' : 'Lewat '}${money(Math.abs(s.left))}</b>${s.perDay ? `<small>±${short(s.perDay)}/hari</small>` : ''}</span>${bdBar(tot)}</button>`;
}
let BF = null;
function bfTotal() {
  const tot = Object.values(BF).reduce((s, v) => s + (v || 0), 0), months = lastMonthsByCat().length, mk = T().slice(0, 7);
  const inc = [1, 2, 3].map((i) => stats(TX(), addMonths(mk, -i)).inc).filter((v) => v > 0), avgInc = inc.length ? inc.reduce((a, b) => a + b, 0) / inc.length : 0;
  return `Total <b>${rp(tot)}</b>/bulan${avgInc ? ` · ${pct(tot / avgInc)} dari pemasukan rata-rata (${short(avgInc)})` : ''}${avgInc && tot > avgInc ? ' — melebihi pemasukan' : ''}${!months ? '' : ''}`;
}
function sBudget() {
  BF = { ...BUDGETS() };
  const hist = lastMonthsByCat(), avg = suggestBudgets(hist);
  openSheet('Anggaran bulanan', `<p class="confirm-text" style="margin-bottom:10px">Batas pengeluaran per kategori setiap bulan. Kosongkan kategori yang tidak ingin dibatasi.</p>
    ${hist.length ? `<button class="btn2 wide" data-a="bfSuggest" style="margin:0 0 12px"><i data-lucide="sparkles"></i>Isi dari rata-rata ${hist.length} bulan terakhir</button>` : ''}
    <div class="bf-list">${OUTC().map((k) => `<label class="bf-row"><span class="ic" style="--c:${CATS[k].c}"><i data-lucide="${CATS[k].i}"></i></span><span class="tx-main"><b>${CATS[k].n}</b><small>${avg[k] ? `rata-rata ±${short(avg[k])}` : 'belum ada riwayat'}</small></span><input class="field bf-in" id="bf-${k}" inputmode="numeric" placeholder="—" value="${BF[k] ? fmtN(BF[k]) : ''}" autocomplete="off"></label>`).join('')}</div>
    <p class="form-note" id="bfTotal">${bfTotal()}</p>
    <button class="primary" data-a="bfSave"><i data-lucide="check"></i>Simpan anggaran</button>`);
}
/** Tell the user once when a category passes 80% or its limit this month. */
function checkBudgets(announce = true) {
  const mk = T().slice(0, 7), s = budgetSummary(BUDGETS(), stats(TX(), mk).byCat, mk, T());
  const fresh = !S.bSeen || S.bSeenMk !== mk;
  const al = announce && !fresh ? newAlerts(S.bSeen, s.lines) : [];
  S.bSeen = Object.fromEntries(s.lines.map((l) => [l.cat, l.level])); S.bSeenMk = mk;
  if (al.length) { const l = al[0], n = CATS[l.cat].n; S.bNote = l.level === 2 ? `${n} lewat anggaran ${rp(-l.left)}` : `${n} sudah ${pct(l.used)} dari anggaran · sisa ${rp(l.left)}`; clearTimeout(S.bNoteT); S.bNoteT = setTimeout(flushBudgetNote, 3200); }
}
/** The budget warning waits for the save confirmation toast instead of being covered by it. */
function flushBudgetNote() {
  if (!S.bNote) return; const m = S.bNote; S.bNote = null; toast(m);
}

/* ================= Excel export ================= */
let EX = { range: 'month' };
function exPeriod(range) {
  const mk = S.mk || T().slice(0, 7);
  if (range === 'month') return { from: mk + '-01', to: `${mk}-${pad(daysIn(mk))}`, label: monthName(mk), file: mk };
  if (range === 'year') { const y = mk.slice(0, 4); return { from: y + '-01-01', to: y + '-12-31', label: 'Tahun ' + y, file: y }; }
  const ds = TX().map((t) => t.date).sort(), a = ds[0] || T(), b = ds[ds.length - 1] || T();
  return { from: a, to: b, label: `Semua data (${dayLabel(a, '')} – ${dayLabel(b, '')})`, file: 'semua-' + T() };
}
function exInner() {
  const p = exPeriod(EX.range), n = TX().filter((t) => t.date >= p.from && t.date <= p.to).length, mk = S.mk || T().slice(0, 7);
  return `<p class="confirm-text">File <b>.xlsx</b> berisi 3 lembar: <b>Ringkasan</b>, <b>Transaksi</b>, dan <b>Per kategori</b>. Bisa dibuka di Excel, Google Sheets, atau Numbers.</p>
    <div class="seg" id="exRange" style="margin-bottom:12px"><span class="pill"></span>${[['month', monthName(mk)], ['year', 'Tahun ' + mk.slice(0, 4)], ['all', 'Semua']].map(([k, l]) => `<button class="${EX.range === k ? 'on' : ''}" data-a="exRange" data-v="${k}">${esc(l)}</button>`).join('')}</div>
    <p class="form-note">${n ? `${n.toLocaleString('id-ID')} transaksi · ${esc(p.label)}` : 'Belum ada transaksi di periode ini.'}</p>
    <button class="primary" data-a="exGo" ${n ? '' : 'disabled'}><i data-lucide="file-down"></i>Buat file Excel</button>`;
}
function sExport() { EX = { range: 'month' }; openSheet('Ekspor ke Excel', `<div id="exBody">${exInner()}</div>`); later(60, () => placePill($('exRange'))); }
async function exportExcel(p) {
  try {
    const { buildSheets, toXlsx } = await import('./excel.ts');
    const blob = await toXlsx(buildSheets(TX(), WL(), p, (w) => bal(w), [store.data.settings.name, isPersonal() ? '' : 'Buku ' + BOOKS[BK()].n].filter(Boolean).join(' · ')));
    const file = new File([blob], `do-it-dip-${p.file}.xlsx`, { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    closeSheet(); await saveFile(file, 'Rekap Do it Dip', 'File Excel siap disimpan');
  } catch (e) { console.error(e); toast('Gagal membuat file Excel. Coba lagi.'); }
}

/* ================= online backup (Supabase) ================= */
const C = { state: 'idle', err: '', timer: null, form: { mode: 'in', email: '', busy: false, err: '', info: '' } };
const cloudOn = () => !!store.data.settings.cloudEmail;
const ts = (s) => (s ? Date.parse(s) : 0);
function ago(iso) {
  if (!iso) return 'belum pernah';
  const s = Math.round((Date.now() - Date.parse(iso)) / 1000);
  if (s < 60) return 'baru saja'; if (s < 3600) return `${Math.round(s / 60)} menit lalu`; if (s < 86400) return `${Math.round(s / 3600)} jam lalu`;
  return longDate(todayStr(new Date(iso)));
}
function cloudCardHTML() {
  const set = store.data.settings;
  if (!cloudOn()) return `<div class="card"><h4>Cadangan online <span class="status">Belum tersambung</span></h4>
    <p class="about" style="margin:0 0 10px">Cadangkan otomatis setiap ada perubahan, lalu buka data yang sama di laptop atau HP lain. Masuk dengan email dan kata sandi.</p>
    <button class="btn2 primaryish" style="width:100%" data-a="cloudConnect"><i data-lucide="cloud-upload"></i>Hubungkan dengan email</button></div>`;
  const st = C.state === 'syncing' ? ['Menyinkronkan…', ''] : C.state === 'error' ? ['Gagal', 'bad'] : set.cloudDirty ? ['Belum terkirim', 'warn'] : ['Tersinkron', 'good'];
  return `<div class="card"><h4>Cadangan online <span class="status ${st[1]}" id="cloudStatus">${st[0]}</span></h4>
    <p class="about" style="margin:0">Tersambung sebagai <b>${esc(set.cloudEmail)}</b>. Disinkronkan ${ago(set.cloudLastSync)}.${C.state === 'error' ? `<br><span style="color:var(--out)">${esc(C.err)}</span>` : ''}</p>
    <div class="btn-row"><button class="btn2" data-a="cloudSync"><i data-lucide="refresh-cw"></i>Sinkronkan sekarang</button><button class="btn2" data-a="cloudOut"><i data-lucide="log-out"></i>Putuskan</button></div></div>`;
}
const newForm = (mode = 'in', email = '') => ({ mode, email, busy: false, err: '', info: '' });
function cloudFormHTML() {
  const f = C.form, up = f.mode === 'up';
  return `<div class="seg" id="clSeg" style="margin-bottom:14px"><span class="pill"></span><button class="${up ? '' : 'on'}" data-a="cloudMode" data-v="in">Masuk</button><button class="${up ? 'on' : ''}" data-a="cloudMode" data-v="up">Buat akun</button></div>
    <span class="lab">Email</span><input class="field" id="clEmail" type="email" inputmode="email" autocomplete="username" autocapitalize="off" spellcheck="false" placeholder="nama@email.com" value="${esc(f.email)}">
    <span class="lab">Kata sandi</span><input class="field" id="clPw" type="password" autocomplete="${up ? 'new-password' : 'current-password'}" placeholder="${up ? 'Minimal 8 karakter' : 'Kata sandi akun'}">
    ${f.err ? `<p class="form-note" style="color:var(--out)">${esc(f.err)}</p>` : f.info ? `<p class="form-note" style="color:var(--in)">${esc(f.info)}</p>` : `<p class="form-note">${up ? 'Akun ini hanya untuk cadangan Do it Dip di proyek Supabase Anda sendiri. Simpan kata sandinya di iCloud Keychain supaya terisi otomatis.' : 'Pakai email dan kata sandi yang sama di iPhone dan laptop.'}</p>`}
    <button class="primary" data-a="cloudAuth" ${f.busy ? 'disabled' : ''}><i data-lucide="${up ? 'user' : 'log-in'}"></i>${f.busy ? 'Memproses…' : up ? 'Buat akun & sambungkan' : 'Masuk'}</button>`;
}
function redrawCloudForm() {
  if (S.ob && S.ob.step === 'cloud') { renderOnb(); }
  else { const b = document.querySelector('#layer .sheet-body'); if (b) { b.innerHTML = cloudFormHTML(); icons(); } }
  placePill($('clSeg'));
  later(80, () => (C.form.email ? $('clPw') : $('clEmail'))?.focus());
}
function redrawCloudCard() { if (PANELS[3]) { const sc = PANELS[3].scrollTop; renderPanel(3); icons(); PANELS[3].scrollTop = sc; } }
function markDirty() {
  if (!cloudOn()) return;
  if (!store.data.settings.cloudDirty) { store.setSetting('cloudDirty', true); redrawCloudCard(); }
  clearTimeout(C.timer); C.timer = setTimeout(() => pushNow(), 4000);
}
async function pushNow() {
  if (!cloudOn() || C.state === 'syncing') return;
  clearTimeout(C.timer); C.state = 'syncing'; redrawCloudCard();
  try { const at = await cloud.push(store.exportAll()); store.setSetting('cloudLastSync', at); store.setSetting('cloudDirty', false); C.state = 'ok'; C.err = ''; }
  catch (e) { C.state = 'error'; C.err = cloud.cloudError(e); console.error(e); }
  redrawCloudCard();
}
async function applyCloud() {
  const r = await cloud.pull(); if (!r) return false;
  const err = store.checkBackup(r.backup); if (err) throw new Error(err);
  await store.importAll(r.backup);
  store.setSetting('cloudLastSync', r.updated_at); store.setSetting('cloudDirty', false);
  afterDataReset(); return true;
}
/** Bring this device and the cloud copy in line: pull when only the cloud changed, push when only this device changed, ask when both did. */
async function syncNow(manual) {
  if (!cloudOn() || C.state === 'syncing') return;
  C.state = 'syncing'; redrawCloudCard(); let conflict = false;
  try {
    const m = await cloud.meta(), s = store.data.settings;
    C.state = 'idle';
    if (!m) { await pushNow(); if (manual && C.state === 'ok') toast('Cadangan online dibuat'); return; }
    const cloudNewer = ts(m.updated_at) > ts(s.cloudLastSync);
    if (cloudNewer && (!s.cloudDirty || TX().length === 0)) { await applyCloud(); C.state = 'ok'; toast(`Data diperbarui dari ${m.device || 'cloud'} (${m.tx_count} transaksi)`); }
    else if (cloudNewer) { conflict = true; sConflict(m); }
    else if (s.cloudDirty) { await pushNow(); }
    else { C.state = 'ok'; if (manual) toast('Sudah tersinkron'); }
  } catch (e) { C.state = 'error'; C.err = cloud.cloudError(e); console.error(e); }
  redrawCloudCard();
  if (!conflict) runRecurring(); // after pulling, so two devices don't both record the same due item
}
function sConflict(m) {
  openSheet('Data berbeda', `<p class="confirm-text">Data di perangkat ini dan di cloud sama-sama berubah sejak sinkron terakhir, jadi saya tidak menimpa salah satunya tanpa izin. Pilih yang ingin dipakai:</p>
    <div class="list">
      <button class="tx" data-a="conflictCloud"><span class="ic" style="--c:#3D8BFF"><i data-lucide="cloud-download"></i></span><span class="tx-main"><b>Pakai data cloud</b><small>${m.tx_count} transaksi · dari ${esc(m.device || 'perangkat lain')} · ${ago(m.updated_at)}</small></span></button>
      <button class="tx" data-a="conflictLocal"><span class="ic" style="--c:#13A894"><i data-lucide="cloud-upload"></i></span><span class="tx-main"><b>Pakai data perangkat ini</b><small>${TX().length} transaksi · menimpa data cloud</small></span></button>
    </div><p class="form-note" style="margin-top:12px">Yang tidak dipilih akan ditimpa. Kalau ragu, ekspor cadangan manual dulu dari Lainnya.</p>`);
}
async function afterCloudLogin(email) {
  store.setSetting('cloudEmail', email); store.setSetting('cloudLastSync', ''); store.setSetting('cloudDirty', TX().length > 0);
  C.form = newForm();
  if (S.ob) {
    try {
      const m = await cloud.meta();
      if (m && (await applyCloud())) { S.ob = null; toast(`Data dipulihkan dari cloud (${m.tx_count} transaksi)`); return; }
      toast('Belum ada cadangan di akun ini. Lanjutkan pengaturan awal.'); S.ob.step = 0; renderOnb();
    } catch (e) { toast(cloud.cloudError(e)); S.ob.step = 0; renderOnb(); }
    return;
  }
  closeSheet(); toast('Tersambung ke cadangan online'); await syncNow(true);
}

function afterDataReset() {
  applyBookTint(); S.bSeen = null; S.mk = null; S.drill = null; S.wsel = null; S.wall = false; S.nl = ''; S.nlOv = {}; S.m = null; closeDrill(true); closeComposer();
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
      <button class="btn2" style="margin-top:10px;width:100%" data-a="obCloud"><i data-lucide="cloud-download"></i>Sudah pakai di perangkat lain? Masuk ke cadangan online</button>
      <button class="btn2" style="margin-top:6px;width:100%;background:none" data-a="restore"><i data-lucide="upload"></i>Pulihkan dari file cadangan</button>
      <input type="file" id="restoreFile" accept="application/json,.json" hidden>`;
  } else if (ob.step === 'cloud') {
    el.innerHTML = `<div class="step"><div class="onb-hero"><img class="onb-logo" src="./icons/logo-152.png" alt="" width="76" height="76"><h1>Masuk ke <span>cadangan online</span></h1>
      <p>Data dari perangkat lain akan diambil ke perangkat ini.</p></div>${cloudFormHTML()}</div><div class="spacer"></div>
      <button class="btn2" style="margin-top:10px;width:100%;background:none" data-a="obBack"><i data-lucide="chevron-left"></i>Kembali</button>`;
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
    if (id.startsWith('bf-')) { const v = digitsOnly(e.target.value); e.target.value = v ? fmtN(v) : ''; BF[id.slice(3)] = Number(v) || 0; $('bfTotal').innerHTML = bfTotal(); }
    if (id === 'rfAmt' || id === 'dueAmt') { const v = digitsOnly(e.target.value); e.target.value = v ? fmtN(v) : ''; if (id === 'rfAmt') RF.r.amount = Number(v) || 0; }
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
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.id === 'clEmail') { e.preventDefault(); $('clPw')?.focus(); return; }
    if (e.key === 'Enter' && e.target.id === 'clPw') { e.preventDefault(); onClick({ target: document.querySelector('[data-a="cloudAuth"]') }); return; }
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
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { if (cloudOn() && store.data.settings.cloudDirty) pushNow(); return; }
    if (store.data.settings.onboarded && $('composer').hidden) refresh();
    if (cloudOn()) syncNow(false); else runRecurring();
  });
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
      { const ps = $('planSec'); if (ps) { ps.innerHTML = planHTML(); icons(); } }
      break;
    }
    case 'walletNew': sWalletForm(null); break;
    case 'walletEdit': sWalletForm(d.id); break;
    case 'wfGroup': WF.group = d.v; document.querySelectorAll('#wfGroup button').forEach((b) => b.classList.toggle('on', b.dataset.v === d.v)); placePill($('wfGroup')); break;
    case 'wfBook': WF.book = d.v; document.querySelectorAll('#wfBook button').forEach((b) => b.classList.toggle('on', b.dataset.v === d.v)); placePill($('wfBook')); break;
    case 'bookGo': switchBook(d.b); break;
    case 'bookOn': activateBook(d.b); break;
    case 'wfColor': WF.color = d.v; document.querySelectorAll('.swatches button').forEach((b) => b.classList.toggle('on', b.dataset.v === d.v)); break;
    case 'wfSave': {
      const name = $('wfName').value.trim(); if (!name) { toast('Isi nama dompet dulu'); $('wfName').focus(); break; }
      const no = $('wfNo').value.replace(/\D/g, '').slice(-4), init = digitsOnly($('wfInit').value), old = WF.id ? W(WF.id) : null;
      const words = name.toLowerCase();
      const w = { id: WF.id || store.newWalletId(), name, short: (old && old.name === name ? old.short : name.replace(/[^A-Za-z0-9]/g, '').slice(0, 3).toUpperCase() || 'W'), group: WF.group, color: WF.color, no: WF.group === 'Bank' && no ? no : undefined, init, order: old ? old.order : Math.max(-1, ...store.data.wallets.map((x) => x.order)) + 1, aliases: Array.from(new Set([...(old && old.name === name ? old.aliases : []), words])), book: WF.book || 'pribadi' };
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
    case 'wipe': sConfirm('Hapus semua data?', 'Semua transaksi, dompet, dan pengaturan di perangkat ini akan dihapus permanen dan <b>tidak bisa dibatalkan</b>. Ekspor cadangan dulu jika masih ingin menyimpannya.', 'Hapus semua', async () => { if (cloudOn()) { try { await cloud.signOut(); } catch {} } await store.wipe(); afterDataReset(); }); break;
    case 'confirmOk': { const fn = S.confirmFn; S.confirmFn = null; closeSheet(); if (fn) fn(); break; }
    case 'del': { const t = TX().find((x) => x.id === d.id); if (t?.debtInit) { closeSheet(); toast('Ini pinjaman awalnya. Hapus lewat catatan utang di Dompet.'); break; } deleteTx(d.id); break; }
    case 'pkDetail': closeSheet(true); sTx(d.id); break;
    case 'dup': {
      const t = TX().find((x) => x.id === d.id); closeSheet(); if (!t) break;
      if (t.debt) { toast('Catat pembayaran lewat catatan utang di Dompet'); break; }
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
      if (d.k === 'type' && d.v !== 'tf') { m.cat = d.v === 'in' ? INC()[0] : OUTC()[0]; m.sub = CATS[m.cat].subs[0]; if (d.v === 'in') m.wallet = defaults().bank; }
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
    /* online backup */
    case 'cloudConnect': C.form = newForm(); openSheet('Cadangan online', cloudFormHTML()); later(60, () => placePill($('clSeg'))); later(350, () => $('clEmail')?.focus()); break;
    case 'obCloud': S.ob.name = $('obName')?.value || S.ob.name; C.form = newForm(); S.ob.step = 'cloud'; renderOnb(); later(60, () => placePill($('clSeg'))); later(100, () => $('clEmail')?.focus()); break;
    case 'cloudMode': C.form = { ...newForm(d.v, ($('clEmail')?.value || '').trim()) }; redrawCloudForm(); break;
    case 'cloudAuth': {
      const email = ($('clEmail')?.value || '').trim().toLowerCase(), pw = $('clPw')?.value || '', up = C.form.mode === 'up';
      C.form.email = email; C.form.info = '';
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { C.form.err = 'Alamat email belum benar.'; redrawCloudForm(); break; }
      if (pw.length < (up ? 8 : 1)) { C.form.err = up ? 'Kata sandi minimal 8 karakter.' : 'Isi kata sandi.'; redrawCloudForm(); break; }
      C.form.busy = true; C.form.err = ''; redrawCloudForm();
      (up ? cloud.signUp(email, pw) : cloud.signIn(email, pw))
        .then((signed) => {
          if (signed) return afterCloudLogin(signed);
          // Supabase wants the email confirmed first.
          C.form = { ...newForm('in', email), info: 'Akun dibuat. Buka email dari Supabase dan ketuk tautan konfirmasinya, lalu kembali ke sini dan tekan Masuk.' }; redrawCloudForm();
        })
        .catch((e) => { C.form.busy = false; C.form.err = cloud.cloudError(e); redrawCloudForm(); });
      break;
    }
    case 'cloudSync': syncNow(true); break;
    case 'cloudOut': sConfirm('Putuskan cadangan online?', 'Data di perangkat ini tetap ada. Cadangan di cloud juga tidak dihapus, dan Anda bisa menyambungkannya lagi kapan saja.', 'Putuskan', async () => { try { await cloud.signOut(); } catch {} ['cloudEmail', 'cloudLastSync'].forEach((k) => store.setSetting(k, '')); store.setSetting('cloudDirty', false); C.state = 'idle'; redrawCloudCard(); toast('Cadangan online diputuskan'); }); break;
    case 'conflictCloud': closeSheet(); C.state = 'syncing'; applyCloud().then(() => { C.state = 'ok'; toast('Memakai data dari cloud'); runRecurring(); }).catch((e) => { C.state = 'error'; C.err = cloud.cloudError(e); }).finally(redrawCloudCard); break;
    case 'conflictLocal': closeSheet(); pushNow().then(() => { if (C.state === 'ok') toast('Data perangkat ini diunggah ke cloud'); runRecurring(); }); break;
    /* security + stories */
    case 'stories': openStories(); break;
    case 'pinToggle': {
      const redraw = () => { renderPanel(3); icons(); };
      if (pinOn()) verifyPin('Masukkan PIN untuk mematikan kunci', () => { ['pinHash', 'pinSalt', 'bioId'].forEach((k) => store.setSetting(k, '')); redraw(); toast('Kunci PIN dimatikan'); });
      else setupPin(redraw);
      break;
    }
    case 'pinChange': verifyPin('Masukkan PIN lama', () => setupPin(() => { renderPanel(3); icons(); })); break;
    case 'bioToggle':
      if (store.data.settings.bioId) { store.setSetting('bioId', ''); renderPanel(3); icons(); toast('Face ID dimatikan'); }
      else enableBio().then((ok) => { renderPanel(3); icons(); toast(ok ? 'Face ID aktif' : 'Face ID tidak diaktifkan'); });
      break;
    case 'lockAfter': store.setSetting('lockAfter', Number(d.v)); document.querySelectorAll('#lockSeg button').forEach((b) => b.classList.toggle('on', b.dataset.v === d.v)); placePill($('lockSeg')); break;
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
    case 'ruleNew': sRuleFromTx(d.id); break;
    case 'ruleEdit': { const r = store.data.rules.find((x) => x.id === d.id); if (r) sRuleForm(r, false); break; }
    case 'rfEvery': if (RF.r.every !== d.v) { RF.r.every = d.v; RF.r.day = d.v === 'week' ? toD(RF.r.last).getDay() : Number(RF.r.last.slice(8)); rfDraw(); } break;
    case 'rfDay': RF.r.day = Number(d.v); rfDraw(); break;
    case 'rfAuto': RF.r.auto = d.v === '1'; rfDraw(); break;
    case 'rfSave': {
      const r = RF.r; if (!r.amount) { toast('Isi nominalnya dulu'); $('rfAmt')?.focus(); break; }
      store.saveRule(r); if (RF.txId) store.updateTx(RF.txId, { rec: r.id });
      closeSheet(); refresh(); toast(`${r.note}: ${lc1(scheduleLabel(r))}${r.auto ? ', dicatat otomatis' : ''}`); runRecurring(); break;
    }
    case 'rfDelete': { const r = RF.r; sConfirm('Hentikan pengulangan?', `<b>${esc(r.note)}</b> tidak akan dicatat lagi ${lc1(scheduleLabel(r))}. Transaksi yang sudah tercatat tetap ada.`, 'Hentikan', () => { store.deleteRule(r.id); refresh(); toast('Pengulangan dihentikan'); }); break; }
    case 'dueOpen': sDue(d.id); break;
    case 'dueRec': recordDue(d.id); break;
    case 'dueSave': recordDue(d.id, Number(digitsOnly($('dueAmt')?.value || '')) || 0); break;
    case 'dueSkip': { const r = store.data.rules.find((x) => x.id === d.id), dd = r && dueDates(r, T())[0]; if (dd) { store.saveRule({ ...r, last: dd }); closeSheet(); refresh(); toast(`${r.note} dilewati untuk ${dayLabel(dd, T())}`); } break; }
    case 'goal': sGoal(d.id); break;
    case 'goalNew': sGoalForm(null); break;
    case 'goalEdit': sGoalForm(d.id); break;
    case 'gfIcon': case 'gfColor': GF.name = $('gfName').value; GF.target = Number(digitsOnly($('gfTarget').value)) || 0; GF.deadline = $('gfDeadline').value; GF[a === 'gfIcon' ? 'icon' : 'color'] = d.v; gfDraw(); break;
    case 'gfSave': {
      const name = $('gfName').value.trim(), target = Number(digitsOnly($('gfTarget').value)) || 0, deadline = $('gfDeadline').value || '';
      if (!name) { toast('Beri nama targetnya'); $('gfName').focus(); break; }
      if (!target) { toast('Isi jumlah yang dituju'); $('gfTarget').focus(); break; }
      const old = GF.id ? store.data.goals.find((x) => x.id === GF.id) : null;
      store.saveGoal(old ? { ...old, name, target, deadline, icon: GF.icon, color: GF.color } : { id: store.newRuleId(), name, icon: GF.icon, color: GF.color, target, deadline, log: [], done: false, createdAt: Date.now() });
      closeSheet(); refresh(); toast(old ? 'Target disimpan' : `Target ${name} dibuat`); break;
    }
    case 'gfDelete': { const g = store.data.goals.find((x) => x.id === GF.id); if (!g) break; sConfirm('Hapus target?', `Target <b>${esc(g.name)}</b> dan catatan ${money(goalSaved(g))} yang sudah disisihkan akan dihapus. Uang di dompet tidak berubah.`, 'Hapus target', () => { store.deleteGoal(g.id); refresh(); toast('Target dihapus'); }); break; }
    case 'gPut': goalMove(d.id, 1); break;
    case 'gTake': goalMove(d.id, -1); break;
    case 'debt': sDebt(d.id); break;
    case 'debtNew': sDebtForm(null); break;
    case 'debtEdit': sDebtForm(d.id); break;
    case 'dfKind': dfRead(); DF.kind = d.v; dfDraw(); break;
    case 'dfWallet': dfRead(); DF.wallet = d.v; dfDraw(); break;
    case 'dfSave': {
      dfRead();
      if (!DF.name) { toast('Isi namanya dulu'); $('dfName').focus(); break; }
      if (!DF.amount) { toast('Isi jumlahnya dulu'); $('dfAmt').focus(); break; }
      if (!DF.id) {
        const nd = { id: store.newRuleId(), kind: DF.kind, name: DF.name, amount: DF.amount, date: DF.date, due: DF.due, monthly: DF.monthly, wallet: DF.wallet, note: DF.note, createdAt: Date.now() };
        store.saveDebt(nd); const o = openingTx(nd); if (o) markFresh([store.addTx(o)]);
        closeSheet(); refresh(); toast(nd.kind === 'utang' ? `Utang ke ${nd.name} dicatat` : `Piutang ${nd.name} dicatat`);
      } else {
        const old = store.data.debts.find((x) => x.id === DF.id); if (!old) break;
        const nd = { ...old, name: DF.name, amount: DF.amount, due: DF.due, monthly: DF.monthly, note: DF.note }; store.saveDebt(nd);
        const init = TX().find((t) => t.debt === nd.id && t.debtInit), o = openingTx(nd); if (init && o) store.updateTx(init.id, { amount: o.amount, note: o.note });
        refresh(); sDebt(nd.id); toast('Perubahan disimpan');
      }
      break;
    }
    case 'dfDelete': { const dd = store.data.debts.find((x) => x.id === DF.id); if (!dd) break; const n = TX().filter((t) => t.debt === dd.id).length;
      sConfirm('Hapus catatan ini?', `Catatan <b>${esc(dd.name)}</b>${n ? ` beserta <b>${n} transaksi</b> terkait (pinjaman awal dan pembayarannya)` : ''} akan dihapus${n ? ', dan saldo dompet menyesuaikan' : ''}. Tidak bisa dibatalkan.`, 'Hapus', () => { store.deleteDebt(dd.id); refresh(); toast('Catatan dihapus'); }); break; }
    case 'pfWallet': PF.wallet = d.v; document.querySelectorAll('[data-a="pfWallet"]').forEach((b) => b.classList.toggle('on', b.dataset.v === d.v)); break;
    case 'pfSave': {
      const dd = store.data.debts.find((x) => x.id === d.id); if (!dd) break;
      const left = debtLeft(dd, TX()), amt = Number(digitsOnly($('pfAmt')?.value || '')) || 0, date = ($('pfDate')?.value || T()) > T() ? T() : $('pfDate')?.value || T();
      if (!amt) { toast('Isi nominalnya dulu'); $('pfAmt')?.focus(); break; }
      if (amt > left) { toast(`Maksimal sisa ${rp(left)}`); break; }
      markFresh([store.addTx(paymentTx(dd, amt, PF.wallet, date))]); refresh();
      if (amt === left) { closeSheet(); toast(dd.kind === 'utang' ? `Utang ke ${dd.name} lunas! 🎉` : `Piutang ${dd.name} sudah kembali semua 🎉`); if (!reduced()) burst(app().clientWidth / 2, app().clientHeight / 3); }
      else { sDebt(dd.id); toast(`${rp(amt)} dicatat · sisa ${rp(left - amt)}`); }
      break;
    }
    case 'budget': sBudget(); break;
    case 'bfSuggest': { const avg = suggestBudgets(lastMonthsByCat()); Object.assign(BF, avg); OUTC().forEach((k) => { const f = $('bf-' + k); if (f) f.value = BF[k] ? fmtN(BF[k]) : ''; }); $('bfTotal').innerHTML = bfTotal(); toast('Diisi dari rata-rata. Sesuaikan bila perlu.'); break; }
    case 'bfSave': { const clean = Object.fromEntries(Object.entries(BF).filter(([, v]) => v > 0)); saveBudgets(clean); S.bSeen = null; closeSheet(); refresh(); toast(Object.keys(clean).length ? `Anggaran ${Object.keys(clean).length} kategori disimpan` : 'Anggaran dikosongkan'); break; }
    case 'excel': sExport(); break;
    case 'exRange': EX.range = d.v; $('exBody').innerHTML = exInner(); icons(); placePill($('exRange')); break;
    case 'exGo': el.disabled = true; el.innerHTML = '<i data-lucide="hourglass"></i>Membuat file…'; icons(); exportExcel(exPeriod(EX.range)); break;
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
  <div class="sbar-fade" aria-hidden="true"></div>
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
  applyTheme(store.data.settings.theme); applyBookTint();
  app().innerHTML = SHELL;
  PANELS = [0, 1, 2, 3].map((i) => $('p' + i));
  bindEvents(); bindTrack(); bindDrill();
  initDesk({ icons, onPhoneShown, exportExcel });
  initLock({ icons, toast, onWipe: async () => { await store.wipe(); afterDataReset(); } });
  initStories({ icons, toast, goRekap: () => goTab(1) });
  if (store.data.settings.onboarded) lockNow(); // lock screen first, before anything is visible
  store.onChange(markDirty);
  if (store.data.settings.onboarded && cloudOn()) setTimeout(() => syncNow(false), 800);
  else if (store.data.settings.onboarded) setTimeout(runRecurring, 600);
  store.requestPersist().then((ok) => { S.persisted = ok; });
  checkBudgets(false);
  bioAvailable().then((ok) => { S.bioAvail = ok; if (ok && PANELS[3]) { renderPanel(3); icons(); } });
  renderAll(); setPos(0); PANELS[0].classList.add('play');
  requestAnimationFrame(() => { measureTabs(); moveInd(0); });
  if (!store.data.settings.onboarded) { showOnboarding(); return; }
  setTimeout(() => { S.dispTotal = heroVal(); setOdo($('odo'), S.dispTotal); }, 450);
  setTimeout(() => app().classList.remove('boot'), 1600);
}
