// @ts-nocheck
// PIN lock screen: unlock on open / after the app was in the background, set or change the PIN,
// optional Face ID / Touch ID. Sits above everything (phone app and laptop dashboard).
import * as store from './store.ts';
import { bioAvailable, bioRegister, bioVerify, hashPin, newSalt, sameHash } from './pin.ts';

let api = null;
const L = { mode: null, entry: '', first: '', len: 4, onOk: null, attempts: 0, until: 0, title: '', forgot: false, offerBio: false };
let el = null, hiddenAt = 0, tick = null;
const S = () => store.data.settings;
export const pinOn = () => !!S().pinHash;

function dots() { return Array.from({ length: L.len }, (_, i) => `<i class="${i < L.entry.length ? 'on' : ''}"></i>`).join(''); }
function render() {
  const wait = Math.max(0, Math.ceil((L.until - Date.now()) / 1000));
  const sub = {
    unlock: wait ? `Terlalu banyak percobaan. Coba lagi dalam ${wait} detik.` : 'Masukkan PIN untuk membuka',
    new: `Buat PIN ${L.len} digit untuk membuka Do it Dip`,
    confirm: 'Ketik PIN yang sama sekali lagi',
    verify: L.title,
  }[L.mode];
  const head = { unlock: 'Do it Dip terkunci', new: 'Buat PIN', confirm: 'Konfirmasi PIN', verify: 'Masukkan PIN' }[L.mode];
  const bioKey = L.mode === 'unlock' && S().bioId ? `<button data-k="bio" aria-label="Buka dengan Face ID"><i data-lucide="scan-face"></i></button>` : L.mode !== 'unlock' ? `<button data-k="cancel" class="txt">Batal</button>` : '<span></span>';
  el.innerHTML = L.offerBio
    ? `<div class="lk-in"><img class="lk-logo" src="./icons/logo-152.png" alt=""><h2>PIN tersimpan</h2><p>Mau membuka Do it Dip dengan Face ID atau Touch ID juga? PIN tetap bisa dipakai.</p>
       <div class="lk-actions"><button class="primary" data-k="bioYes"><i data-lucide="scan-face"></i>Aktifkan Face ID</button><button class="btn2" data-k="bioNo">Nanti saja</button></div></div>`
    : L.forgot
    ? `<div class="lk-in"><img class="lk-logo" src="./icons/logo-152.png" alt=""><h2>Lupa PIN?</h2>
       <p>PIN tidak bisa dipulihkan, karena hanya bentuk acaknya yang disimpan. Satu-satunya jalan adalah menghapus semua data di perangkat ini lalu mulai ulang. Setelah itu data bisa dipulihkan dari file cadangan (Lainnya → Pulihkan dari file).</p>
       <div class="lk-actions"><button class="danger" data-k="wipe">Hapus data di perangkat ini & mulai ulang</button><button class="btn2" data-k="back">Kembali</button></div></div>`
    : `<div class="lk-in"><img class="lk-logo" src="./icons/logo-152.png" alt=""><h2>${head}</h2><p class="lk-sub ${wait ? 'warn' : ''}">${sub}</p>
       <div class="lk-dots" id="lkDots">${dots()}</div>
       <div class="lk-pad">${['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((k) => `<button data-k="${k}">${k}</button>`).join('')}${bioKey}<button data-k="0">0</button><button data-k="del" aria-label="Hapus angka"><i data-lucide="delete"></i></button></div>
       ${L.mode === 'unlock' ? '<button class="lk-link" data-k="forgot">Lupa PIN?</button>' : L.mode === 'new' ? `<button class="lk-link" data-k="len">Pakai PIN ${L.len === 4 ? 6 : 4} digit</button>` : ''}</div>`;
  api.icons();
  clearTimeout(tick); if (wait) tick = setTimeout(render, 1000);
}
function show(mode, opts = {}) {
  Object.assign(L, { mode, entry: '', first: '', forgot: false, offerBio: false, onOk: opts.onOk || null, title: opts.title || '', len: mode === 'new' ? L.len || 4 : S().pinLen || 4 });
  el.hidden = false; document.body.classList.add('locked'); document.body.classList.remove('veil');
  ['app', 'desk'].forEach((id) => document.getElementById(id)?.setAttribute('inert', ''));
  render();
  // Try Face ID right away. Safari may refuse it without a tap; then the face button stays as the fallback.
  if (mode === 'unlock' && S().bioId) setTimeout(() => { if (!el.hidden && L.mode === 'unlock' && document.visibilityState === 'visible') tryBio(true); }, 350);
}
let bioBusy = false;
async function tryBio(auto) {
  if (bioBusy) return; bioBusy = true;
  try {
    if (await bioVerify(S().bioId)) { L.attempts = 0; hide(); }
  } catch {
    if (!auto) { const s = el.querySelector('.lk-sub'); if (s) s.textContent = 'Face ID gagal atau dibatalkan. Gunakan PIN.'; }
    else el.querySelector('[data-k="bio"]')?.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.15)' }, { transform: 'scale(1)' }], { duration: 600, iterations: 2 });
  } finally { bioBusy = false; }
}
/** Close the lock screen; `then` runs only after it is fully gone (so it may open the lock screen again). */
function hide(then = null) {
  const done = () => { el.hidden = true; document.body.classList.remove('locked'); ['app', 'desk'].forEach((id) => document.getElementById(id)?.removeAttribute('inert')); if (then) then(); };
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return done();
  const a = el.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'scale(1.06)' }], { duration: 260, easing: 'ease-in', fill: 'forwards' });
  let ran = false; const go = () => { if (ran) return; ran = true; done(); a.cancel(); }; a.onfinish = go; setTimeout(go, 400);
}
function shake(msg) {
  L.entry = '';
  const d = el.querySelector('#lkDots'); if (d) { d.innerHTML = dots(); d.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(-12px)' }, { transform: 'translateX(10px)' }, { transform: 'translateX(-6px)' }, { transform: 'translateX(0)' }], { duration: 380 }); }
  const s = el.querySelector('.lk-sub'); if (s && msg) { s.textContent = msg; s.classList.add('warn'); }
}
async function complete() {
  const pin = L.entry;
  if (L.mode === 'new') { L.first = pin; L.mode = 'confirm'; L.entry = ''; render(); return; }
  if (L.mode === 'confirm') {
    if (pin !== L.first) { L.mode = 'new'; render(); shake('PIN tidak sama. Ulangi dari awal.'); return; }
    const salt = newSalt(), hash = await hashPin(pin, salt);
    store.setSetting('pinSalt', salt); store.setSetting('pinHash', hash); store.setSetting('pinLen', L.len); store.setSetting('bioId', '');
    if (await bioAvailable()) { L.offerBio = true; render(); return; }
    finishSetup(); return;
  }
  if (Date.now() < L.until) { shake(); return; }
  const ok = sameHash(await hashPin(pin, S().pinSalt), S().pinHash);
  if (!ok) {
    L.attempts++;
    if (L.attempts >= 5) { L.until = Date.now() + 30_000; L.attempts = 0; render(); shake(); return; }
    shake(`PIN salah. Sisa ${5 - L.attempts} percobaan sebelum dijeda.`); return;
  }
  L.attempts = 0;
  if (L.mode === 'verify') { hide(L.onOk); return; }
  hide();
}
function finishSetup() { const fn = L.onOk; hide(() => { api.toast('Kunci PIN aktif'); fn && fn(); }); }

async function onKey(k) {
  if (/^\d$/.test(k)) { if (L.entry.length >= L.len) return; L.entry += k; const d = el.querySelector('#lkDots'); if (d) d.innerHTML = dots(); if (L.entry.length === L.len) setTimeout(complete, 120); return; }
  if (k === 'del') { L.entry = L.entry.slice(0, -1); const d = el.querySelector('#lkDots'); if (d) d.innerHTML = dots(); return; }
  if (k === 'cancel') { hide(); return; }
  if (k === 'len') { L.len = L.len === 4 ? 6 : 4; L.entry = ''; render(); return; }
  if (k === 'forgot') { L.forgot = true; render(); return; }
  if (k === 'back') { L.forgot = false; render(); return; }
  if (k === 'wipe') { L.forgot = false; hide(() => api.onWipe()); return; }
  if (k === 'bio') { tryBio(false); return; }
  if (k === 'bioYes') { try { store.setSetting('bioId', await bioRegister()); api.toast('Face ID aktif'); } catch { api.toast('Face ID tidak diaktifkan'); } L.offerBio = false; finishSetup(); return; }
  if (k === 'bioNo') { L.offerBio = false; finishSetup(); return; }
}

/* ---------- public ---------- */
export function initLock(a) {
  api = a;
  el = document.createElement('div'); el.id = 'lock'; el.className = 'lock'; el.hidden = true; el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', 'Kunci aplikasi');
  document.body.appendChild(el);
  el.addEventListener('click', (e) => { const b = e.target.closest('[data-k]'); if (b) { e.stopPropagation(); onKey(b.dataset.k); } });
  document.addEventListener('keydown', (e) => {
    if (el.hidden) return;
    if (/^\d$/.test(e.key)) { e.preventDefault(); e.stopPropagation(); onKey(e.key); }
    else if (e.key === 'Backspace') { e.preventDefault(); e.stopPropagation(); onKey('del'); }
    else if (e.key === 'Escape' && L.mode !== 'unlock') onKey('cancel');
    else if (L.mode === 'unlock') e.stopPropagation();
  }, true);
  // Cover the app as soon as it goes to the background (the iOS app switcher shows a snapshot), lock again after a while.
  document.addEventListener('visibilitychange', () => {
    if (!pinOn()) return;
    if (document.hidden) { hiddenAt = Date.now(); document.body.classList.add('veil'); return; }
    document.body.classList.remove('veil');
    if (el.hidden && Date.now() - hiddenAt >= (S().lockAfter ?? 60) * 1000) show('unlock');
  });
}
export function lockNow() { if (pinOn()) show('unlock'); }
export function setupPin(onOk) { L.len = 4; show('new', { onOk }); }
export function verifyPin(title, onOk) { show('verify', { title, onOk }); }
export async function enableBio() { try { store.setSetting('bioId', await bioRegister()); return true; } catch { return false; } }
export { bioAvailable };
