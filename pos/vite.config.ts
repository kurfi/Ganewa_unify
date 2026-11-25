/// <reference types="vitest" />
import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/postcss';
import autoprefixer from 'autoprefixer';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  return {
    server: {
      port: 3000,
      host: '0.0.0.0',
    },
    plugins: [
      react(),
      VitePWA({
        strategies: 'injectManifest',
        srcDir: 'src',
        filename: 'sw.ts',
        registerType: 'autoUpdate',
        injectRegister: 'inline',
        includeAssets: ['favicon.ico', 'icon.png', 'pwa-192x192.png', 'pwa-512x512.png'],
        injectManifest: {
          maximumFileSizeToCacheInBytes: 5 * 1024 * 1024, // 5 MB limit
        },
        manifest: {
          name: 'Ganewa Shopping Mall Kurfi',
          short_name: 'Ganewa Mall',
          description: 'POS and Inventory Management System',
          theme_color: '#10b981',
          icons: [
            {
              src: 'pwa-192x192.png',
              sizes: '192x192',
              type: 'image/png'
            },
            {
              src: 'pwa-512x512.png',
              sizes: '512x512',
              type: 'image/png'
            }
          ]
        }
      })
    ],
    css: {
      postcss: {
        plugins: [
          tailwindcss(),
          autoprefixer,
        ],
      },
    },
    define: {
      'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY)
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      }
    },
    test: {
      environment: 'happy-dom',
      globals: true,
      testTimeout: 30000,
      fileParallelism: false,
      include: ['src/**/__tests__/**/*.test.ts', 'src/tests/**/*.test.ts'],
    }
  };
});
