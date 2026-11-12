// @ts-nocheck
// "Rekap kilat": a weekly recap told as full-screen story cards with a cube transition (from mockup v2).
// Light for iPhone: decoration uses gradients and transforms only (no CSS blur filters).
import { CATS } from './model.ts';
import { addDays, BULAN, HARI, HARI_P, dayLabel, esc, pct, rp, toD, todayStr } from './format.ts';
import { stats } from './stats.ts';
import * as store from './store.ts';

let api = null, el = null;
const SS = { i: 0, slides: [], hold: null, held: false };
const SDUR = 5200;
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const outOn = (d) => store.data.txs.filter((t) => t.date === d && t.type === 'out').reduce((s, t) => s + t.amount, 0);
const sumDays = (from, to) => { const T = todayStr(); let s = 0; for (let i = from; i <= to; i++) s += outOn(addDays(T, -i)); return s; };

/** Enough data for a meaningful recap: at least 3 expenses in the last 7 days. */
export function storiesReady(): boolean {
  const T = todayStr(), from = addDays(T, -6);
  return store.data.txs.filter((t) => t.type === 'out' && t.date >= from && t.date <= T).length >= 3;
}

function deco(i) {
  const m = 'REKAP KILAT ✦ DO IT DIP ✦ MINGGU INI ✦ ';
  return `<i class="sglow g1"></i><i class="sglow g2"></i><i class="oring"></i><i class="dots"></i><b class="bignum">0${i + 1}</b><i class="shp s1"></i><i class="shp s2"></i><i class="shp s3"></i><i class="shp s4"></i><span class="tw t1">✦</span><span class="tw t2">✦</span><span class="tw t3">✦</span><div class="marq"><span>${m.repeat(3)}</span><span>${m.repeat(3)}</span></div>`;
}
function slides() {
  const T = todayStr(), name = store.data.settings.name;
  const out7 = sumDays(0, 6), prev7 = sumDays(7, 13);
  const days = []; for (let i = 6; i >= 0; i--) { const d = addDays(T, -i); days.push({ d, v: outOn(d) }); }
  const mx = days.reduce((a, b) => (b.v > a.v ? b : a)), dmax = Math.max(...days.map((x) => x.v), 1);
  const cnt = {}, sum = {};
  store.data.txs.filter((t) => t.type === 'out' && t.date >= addDays(T, -6) && t.date <= T).forEach((t) => { cnt[t.cat] = (cnt[t.cat] || 0) + 1; sum[t.cat] = (sum[t.cat] || 0) + t.amount; });
  const topC = Object.entries(cnt).sort((a, b) => b[1] - a[1])[0], tc = CATS[topC[0]] || CATS.lain;
  const st = stats(store.data.txs, T.slice(0, 7)), rate = st.inc ? Math.max(0, (st.inc - st.out) / st.inc) : null, RR = 70, CC = 2 * Math.PI * RR;
  const cmp = prev7 ? `${out7 <= prev7 ? 'Lebih hemat' : 'Lebih banyak'} <b>${pct(Math.abs(out7 - prev7) / prev7)}</b> dibanding 7 hari sebelumnya (${rp(prev7)}).` : 'Belum ada data minggu sebelumnya untuk dibandingkan.';
  return [
    { bg: 'linear-gradient(160deg,#2CC4AB,#0B7C8A)', h: `<div class="bigic sa" style="--i:0"><i data-lucide="sparkles"></i></div><div class="kick sa" style="--i:1">Rekap kilat</div><h2 class="sa" style="--i:2">${name ? esc(name) + ', ini' : 'Ini'} minggumu dalam 30 detik.</h2><p class="sa" style="--i:3">${dayLabel(addDays(T, -6), T)} sampai hari ini. Ketuk kanan untuk lanjut, tahan untuk jeda.</p>` },
    { bg: 'linear-gradient(160deg,#0B3B4A,#0E7C86)', h: `<div class="kick sa" style="--i:0">7 hari terakhir kamu mengeluarkan</div><div class="huge m sa" style="--i:1" data-count="${out7}">${rp(out7)}</div><p class="sa" style="--i:2">${cmp}</p>` },
    { bg: `linear-gradient(160deg,${tc.c},#0B2A30)`, h: `<div class="bigic sa" style="--i:0"><i data-lucide="${tc.i}"></i></div><div class="kick sa" style="--i:1">Paling sering kamu catat</div><h2 class="sa" style="--i:2">${tc.n}</h2><p class="sa" style="--i:3"><b>${topC[1]} kali</b> dalam seminggu, total ${rp(sum[topC[0]])}.</p>` },
    { bg: 'linear-gradient(160deg,#1A9AA6,#245F86)', h: `<div class="kick sa" style="--i:0">Hari paling boros</div><h2 class="sa" style="--i:1">${HARI_P[toD(mx.d).getDay()]}</h2><p class="sa" style="--i:2">${rp(mx.v)} keluar di hari itu.</p><div class="sbars sa" style="--i:3">${days.map((x, j) => `<div class="${x.d === mx.d ? 'mx' : ''}"><i style="height:${Math.max(6, (x.v / dmax) * 100)}px;--j:${j}"></i>${HARI[toD(x.d).getDay()]}</div>`).join('')}</div>` },
    rate === null
      ? { bg: 'linear-gradient(160deg,#1E9E4F,#0F5C55)', h: `<div class="bigic sa" style="--i:0"><i data-lucide="piggy-bank"></i></div><div class="kick sa" style="--i:1">Rasio tabungan ${BULAN[Number(T.slice(5, 7)) - 1]}</div><h2 class="sa" style="--i:2">Belum ada pemasukan</h2><p class="sa" style="--i:3">Catat gaji atau pemasukan bulan ini supaya rasio tabunganmu bisa dihitung.</p>` }
      : { bg: 'linear-gradient(160deg,#1E9E4F,#0F5C55)', h: `<div class="kick sa" style="--i:0">Rasio tabungan ${BULAN[Number(T.slice(5, 7)) - 1]}</div><svg class="sring sa" style="--i:1" viewBox="0 0 170 170"><circle cx="85" cy="85" r="${RR}" stroke="rgba(255,255,255,.25)"/><circle class="val" cx="85" cy="85" r="${RR}" stroke="#fff" stroke-linecap="round" stroke-dasharray="${CC}" stroke-dashoffset="${CC * (1 - rate)}" style="--full:${CC}" transform="rotate(-90 85 85)"/><text x="85" y="96" text-anchor="middle" fill="#fff" style="font:800 34px var(--f-display)">${pct(rate)}</text></svg><p class="sa" style="--i:2">${rate >= 0.2 ? 'Di atas patokan aman 20%. Kamu di jalur yang benar.' : 'Di bawah patokan 20%. Coba pangkas satu kategori minggu depan.'}</p>` },
    { bg: 'linear-gradient(160deg,#FFC93C,#13A894)', h: `<div class="bigic sa" style="--i:0"><i data-lucide="party-popper"></i></div><h2 class="sa" style="--i:1">Terus catat, ${esc(name || 'kamu')}!</h2><p class="sa" style="--i:2">Makin rutin kamu mencatat, makin tajam rekap dan sarannya.</p><button class="story-cta sa" style="--i:3" data-s="rekap"><i data-lucide="chart-pie"></i>Buka rekap lengkap</button>` },
  ];
}
function countUp(n) {
  const to = Number(n.dataset.count); if (reduced()) { n.textContent = rp(to); return; }
  const t0 = performance.now(); const f = (t) => { const k = Math.min(1, (t - t0) / 1000), e = 1 - Math.pow(1 - k, 4); n.textContent = rp(to * e); if (k < 1) requestAnimationFrame(f); }; requestAnimationFrame(f);
}
function showSlide(i, dir) {
  const W = el.clientWidth, prev = SS.i; SS.i = i;
  el.querySelectorAll('.story-bars span').forEach((b, j) => { b.className = j < i ? 'done' : ''; const bi = b.firstElementChild; bi.style.animation = 'none'; void bi.offsetWidth; bi.style.animation = ''; });
  const bar = el.querySelectorAll('.story-bars span')[i]; requestAnimationFrame(() => (bar.className = 'run'));
  bar.firstElementChild.onanimationend = () => { if (SS.i === i && !el.hidden) next(1); };
  const cur = el.querySelector('#sl' + i); cur.style.visibility = 'visible'; cur.classList.remove('live'); void cur.offsetWidth; cur.classList.add('live');
  cur.querySelectorAll('[data-count]').forEach(countUp);
  if (dir && prev !== i && !reduced()) {
    const old = el.querySelector('#sl' + prev), h = W / 2, ease = 'cubic-bezier(.45,.05,.25,1)';
    const a = old.animate([{ transform: `translateZ(-${h}px) rotateY(0deg) translateZ(${h}px)` }, { transform: `translateZ(-${h}px) rotateY(${-90 * dir}deg) translateZ(${h}px)` }], { duration: 560, easing: ease });
    a.onfinish = () => { old.style.visibility = 'hidden'; old.classList.remove('live'); };
    cur.animate([{ transform: `translateZ(-${h}px) rotateY(${90 * dir}deg) translateZ(${h}px)` }, { transform: `translateZ(-${h}px) rotateY(0deg) translateZ(${h}px)` }], { duration: 560, easing: ease });
  } else if (prev !== i) { const old = el.querySelector('#sl' + prev); old.style.visibility = 'hidden'; old.classList.remove('live'); }
}
function next(d) { const n = SS.i + d; if (n < 0) { showSlide(0, 0); return; } if (n >= SS.slides.length) { close(); return; } showSlide(n, d); }
function close() {
  if (el.hidden) return;
  const done = () => { el.hidden = true; el.innerHTML = ''; };
  if (reduced()) return done();
  const a = el.animate([{ transform: 'none', opacity: 1 }, { transform: 'translateY(30%) scale(.8)', opacity: 0 }], { duration: 300, easing: 'ease-in', fill: 'forwards' });
  let ran = false; const go = () => { if (ran) return; ran = true; done(); a.cancel(); }; a.onfinish = go; setTimeout(go, 450);
}
export function openStories() {
  if (!storiesReady()) { api.toast('Rekap kilat muncul setelah ada minimal 3 pengeluaran dalam 7 hari terakhir'); return; }
  SS.slides = slides(); SS.i = 0;
  el.innerHTML = `<div class="story-bars">${SS.slides.map(() => '<span><i></i></span>').join('')}</div><button class="story-x" data-s="close" aria-label="Tutup rekap kilat"><i data-lucide="x"></i></button>
    ${SS.slides.map((s, i) => `<div class="slide" id="sl${i}" style="background:${s.bg};visibility:hidden;--k:${i}"><div class="deco" aria-hidden="true">${deco(i)}</div><div class="sc">${s.h}</div></div>`).join('')}`;
  el.querySelectorAll('.slide h2').forEach((h) => { h.innerHTML = h.textContent.trim().split(/\s+/).map((w, j) => `<span class="w"><span style="--w:${j}">${esc(w)}</span></span>`).join(' '); });
  el.hidden = false; el.style.setProperty('--dur', SDUR + 'ms'); api.icons();
  if (!reduced()) el.animate([{ transform: 'scale(.7)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 420, easing: 'cubic-bezier(.16,1,.3,1)' });
  showSlide(0, 0);
}
export function initStories(a) {
  api = a;
  el = document.createElement('div'); el.className = 'stories'; el.id = 'stories'; el.hidden = true; el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', 'Rekap kilat');
  (document.getElementById('app') || document.body).appendChild(el);
  let sx = 0, sy = 0;
  el.addEventListener('click', (e) => { const b = e.target.closest('[data-s]'); if (!b) return; e.stopPropagation(); if (b.dataset.s === 'close') close(); if (b.dataset.s === 'rekap') { close(); setTimeout(() => api.goRekap(), 250); } });
  el.addEventListener('pointerdown', (e) => { if (e.target.closest('button')) return; sx = e.clientX; sy = e.clientY; SS.held = false; SS.hold = setTimeout(() => { SS.held = true; el.classList.add('paused'); }, 220); });
  el.addEventListener('pointerup', (e) => {
    if (e.target.closest('button')) return; clearTimeout(SS.hold); el.classList.remove('paused');
    const dy = e.clientY - sy, dx = e.clientX - sx; if (dy > 90 && Math.abs(dy) > Math.abs(dx)) { close(); return; }
    if (SS.held) return; const r = el.getBoundingClientRect(); if (Math.abs(dx) > 60) { next(dx < 0 ? 1 : -1); return; } next(e.clientX - r.left < r.width * 0.3 ? -1 : 1);
  });
  el.addEventListener('pointercancel', () => { clearTimeout(SS.hold); el.classList.remove('paused'); });
  document.addEventListener('keydown', (e) => { if (el.hidden) return; if (e.key === 'ArrowRight') next(1); if (e.key === 'ArrowLeft') next(-1); if (e.key === 'Escape') close(); });
}
