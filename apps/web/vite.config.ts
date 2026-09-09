/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),

    VitePWA({
      /*
        `prompt`, not `autoUpdate`. A reload nobody asked for interrupts a running
        Work Mode clock and drops the calendar's in-memory mode; the session
        survives in the database, but *when* to take the interruption is the
        user's call — so a bar offers it instead.
      */
      registerType: 'prompt',

      // Off in dev on purpose: a service worker there serves stale code and turns
      // every edit into a puzzle. The shell is verified against `pnpm preview`.
      devOptions: { enabled: false },

      includeAssets: ['favicon.ico', 'apple-touch-icon-180x180.png'],

      manifest: {
        name: 'Corvonium',
        short_name: 'Corvonium',
        description: 'Plan your work, then follow through on it.',
        // The app paints its own dark ground; matching it here stops the splash
        // screen flashing white before the first frame.
        background_color: '#0A0E0C',
        theme_color: '#0A0E0C',
        display: 'standalone',
        start_url: '/',
        scope: '/',
        // No orientation lock: the same build is the desktop app, and §3.8
        // designs the wide layout for landscape.
        icons: [
          { src: 'pwa-64x64.png', sizes: '64x64', type: 'image/png' },
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'maskable-icon-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },

      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
        /*
          The hash router means every route is the same document, so an
          unmatched navigation should fall back to it rather than 404 offline.
        */
        navigateFallback: 'index.html',
      },
    }),
  ],

  /*
    Tests live in this config rather than their own, so they run through the same
    React and Tailwind plugins the app is built with and the two cannot drift.

    `TZ` is pinned exactly as `packages/shared` pins it: these components render
    dates, and an unpinned zone makes assertions pass or fail by machine.
  */
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    env: { TZ: 'Europe/Istanbul' },
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
