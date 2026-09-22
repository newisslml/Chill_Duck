import path from 'node:path';
import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, normalizePath, type Plugin } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

const srcDir = fileURLToPath(new URL('./src', import.meta.url));

/**
 * `vite --mode demo`: cambia la capa de datos (Supabase) por datos de ejemplo en memoria
 * para recorrer la app sin backend. No afecta el build de producción.
 */
function demoData(): Plugin {
  const swaps: Record<string, string> = {
    'lib/queries.ts': 'demo/queries.ts',
    'lib/session.ts': 'demo/session.ts',
    'lib/supabase.ts': 'demo/supabase.ts',
  };
  return {
    name: 'chill-duck-demo',
    enforce: 'pre',
    async resolveId(source, importer, options) {
      if (!importer || normalizePath(importer).includes('/src/demo/')) return null;
      const resolved = await this.resolve(source, importer, { ...options, skipSelf: true });
      if (!resolved) return null;
      const target = swaps[normalizePath(path.relative(srcDir, resolved.id))];
      return target ? normalizePath(path.join(srcDir, target)) : null;
    },
  };
}

export default defineConfig(({ mode }) => ({
  resolve: {
    alias: {
      // Lógica compartida con las Edge Functions (montos, fechas, informe, categorías).
      '@shared': fileURLToPath(new URL('../supabase/functions/_shared', import.meta.url)),
    },
  },
  plugins: [
    mode === 'demo' && demoData(),
    react(),
    tailwindcss(),
    VitePWA({
      // Service worker propio para manejar las notificaciones push.
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,png,svg,webmanifest}'],
      },
      manifest: {
        name: 'Chill Duck',
        short_name: 'Chill Duck',
        description: 'Control de gastos con CMR Falabella y Mercado Pago',
        lang: 'es-CL',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#f9f9f7',
        theme_color: '#f9f9f7',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
  server: {
    fs: { allow: ['..'] },
  },
}));
