import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

const normalizeBase = (value: string | undefined) => {
  if (!value) return '/';
  let base = value;
  if (!base.startsWith('/')) {
    base = `/${base}`;
  }
  if (!base.endsWith('/')) {
    base = `${base}/`;
  }
  return base;
};

const pagesBase = normalizeBase(process.env.VITE_BASE);

export default defineConfig({
  base: pagesBase,
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'Our Health',
        short_name: 'Our Health',
        start_url: pagesBase,
        display: 'standalone',
        background_color: '#f6f1e7',
        theme_color: '#f6f1e7',
        icons: [
          {
            src: '/icon-192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: '/icon-512.png',
            sizes: '512x512',
            type: 'image/png'
          }
        ]
      },
      includeAssets: ['icon-192.png', 'icon-512.png'],
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,svg}']
      }
    })
  ]
});
