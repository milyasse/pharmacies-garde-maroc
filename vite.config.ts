import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

// Chemin de base : "/<nom-du-depot>/" sur https://<utilisateur>.github.io/<nom-du-depot>/
// Défini par le workflow (BASE_PATH). En local : "/".
const base = process.env.BASE_PATH || '/';

// Informations de version affichées dans l'app (Paramètres et pied de page)
const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };
let sha = (process.env.GITHUB_SHA || '').slice(0, 7);
if (!sha) {
  try { sha = execSync('git rev-parse --short HEAD').toString().trim(); } catch { sha = 'local'; }
}

export default defineConfig({
  base,
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __BUILD_SHA__: JSON.stringify(sha),
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
  },
  build: {
    target: 'es2020',
    cssCodeSplit: true,
    rollupOptions: {
      output: {
        // Bibliothèques séparées : mises en cache par le navigateur d'une version à l'autre
        manualChunks: { react: ['react', 'react-dom'], leaflet: ['leaflet'] },
      },
    },
  },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/favicon.svg', 'icons/apple-touch-icon.png'],
      manifest: {
        name: 'Pharmacies de Garde Maroc',
        short_name: 'Pharma Garde',
        description: 'Pharmacies de garde autour de vous à Rabat, Salé et Témara, avec sources datées et itinéraires.',
        lang: 'fr',
        start_url: base,
        scope: base,
        display: 'standalone',
        background_color: '#0A1628',
        theme_color: '#0B5D3B',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,webp,woff2}'],
        globIgnores: ['**/data/**'],
        navigateFallbackDenylist: [/\/data\//],
        runtimeCaching: [
          {
            // Données de garde : toujours tenter le réseau d'abord (fraîcheur), cache en secours hors-ligne
            urlPattern: ({ url }) => url.pathname.includes('/data/') && url.pathname.endsWith('.json'),
            handler: 'NetworkFirst',
            options: { cacheName: 'garde-data', networkTimeoutSeconds: 6, expiration: { maxEntries: 20, maxAgeSeconds: 2 * 24 * 3600 } },
          },
        ],
      },
    }),
  ],
});
