/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],

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
