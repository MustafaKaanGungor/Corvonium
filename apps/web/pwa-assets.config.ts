import { defineConfig } from '@vite-pwa/assets-generator/config';

/** The app's own ground colour, so a padded icon bleeds to the edge. */
const BACKGROUND = '#0A0E0C';

/**
 * Every icon size is rendered from one file, `public/logo.svg`, by `pnpm icons`.
 *
 * The output is committed rather than generated during the build: a production
 * build should not depend on an image toolchain being installed, and the icons
 * change roughly never.
 *
 * This is `minimal2023Preset` with one correction. The stock preset leaves the
 * padding it adds **transparent**, which is wrong for a maskable icon: Android
 * crops those to a circle, and a transparent margin means a dark square floating
 * in a void rather than a shape that fills its badge. Both padded variants are
 * therefore given the app's own background to bleed into.
 *
 * Sizes are deliberately few — 64 for the favicon, 192 and 512 for the manifest,
 * one maskable and one apple-touch — rather than the two dozen browsers stopped
 * needing years ago.
 */
export default defineConfig({
  headLinkOptions: { preset: '2023' },
  images: ['public/logo.svg'],
  preset: {
    transparent: {
      sizes: [64, 192, 512],
      favicons: [[64, 'favicon.ico']],
    },
    maskable: {
      sizes: [512],
      padding: 0.3,
      resizeOptions: { background: BACKGROUND },
    },
    apple: {
      sizes: [180],
      padding: 0.3,
      resizeOptions: { background: BACKGROUND },
    },
  },
});
