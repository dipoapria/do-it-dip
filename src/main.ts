import '@fontsource-variable/bricolage-grotesque/opsz.css';
import '@fontsource-variable/plus-jakarta-sans/wght.css';
import './styles.css';
import './lock-stories.css';
import { registerSW } from 'virtual:pwa-register';
import { start } from './app.ts';

registerSW({ immediate: true });
start().catch((e) => {
  console.error(e);
  const app = document.getElementById('app');
  if (app) app.innerHTML = '<div class="boot-msg" style="padding:24px;text-align:center">Aplikasi gagal dimuat. Muat ulang halaman; jika masih gagal, pastikan browser tidak dalam mode privat.</div>';
});
