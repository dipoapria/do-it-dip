import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

// base './' keeps the build working on GitHub Pages (sub-path) and Cloudflare Pages (root) alike.
export default defineConfig({
  base: './',
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.png', 'icons/apple-touch-icon.png', 'icons/logo-152.png'],
      manifest: {
        name: 'Do it Dip',
        short_name: 'Do it Dip',
        description: 'Pencatat keuangan pribadi: catat lewat kalimat, rekap yang bisa ditelusuri.',
        lang: 'id',
        start_url: '.',
        scope: '.',
        display: 'standalone',
        orientation: 'portrait',
        theme_color: '#13A894',
        background_color: '#F1F6F5',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          // The logo is full-bleed with the wallet reaching past the maskable safe zone, so it is not marked "maskable".
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,mjs,css,html,svg,png,woff2}'],
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
        // Receipt OCR downloads its engine + Indonesian language data from CDNs on first use; keep them for offline use.
        runtimeCaching: [
          {
            urlPattern: ({ url }) => /(^|\.)jsdelivr\.net$|(^|\.)unpkg\.com$|tessdata\.projectnaptha\.com$/.test(url.hostname),
            handler: 'CacheFirst',
            options: {
              cacheName: 'ocr-engine',
              expiration: { maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 * 180 },
              cacheableResponse: { statuses: [0, 200] }
            }
          }
        ]
      }
    })
  ]
});
