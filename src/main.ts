import '@fontsource-variable/bricolage-grotesque/opsz.css';
import '@fontsource-variable/plus-jakarta-sans/wght.css';
import './styles.css';
import './lock-stories.css';
import { registerSW } from 'virtual:pwa-register';
import { start } from './app.ts';

// A new version is announced to the app, which offers "Perbarui" (see app.ts: update bar, Lainnya → Segarkan).
const updateSW = registerSW({
  immediate: true,
  onNeedRefresh() { window.dispatchEvent(new Event('dip-update')); },
  onRegisteredSW(_url, reg) { (window as unknown as { __dipSW?: ServiceWorkerRegistration }).__dipSW = reg; },
});
(window as unknown as { __dipUpdate?: () => void }).__dipUpdate = () => { void updateSW(true); };
start().catch((e) => {
  console.error(e);
  const app = document.getElementById('app');
  if (app) app.innerHTML = '<div class="boot-msg" style="padding:24px;text-align:center">Aplikasi gagal dimuat. Muat ulang halaman; jika masih gagal, pastikan browser tidak dalam mode privat.</div>';
});
