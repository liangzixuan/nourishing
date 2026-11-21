import {defineConfig} from 'astro/config';
import node from '@astrojs/node';
import {diaryStylesPackaging} from './scripts/package-diary-styles.mjs';
import {diaryBundlePackaging} from './scripts/package-diary-bundle.mjs';
import {offlinePackaging} from './scripts/package-offline-assets.mjs';
import {barcodePackaging} from './scripts/package-barcode-assets.mjs';
import {recipeWorkerPackaging} from './scripts/package-recipe-worker.mjs';

// server/http owns streaming route limits after authentication. The adapter's
// competing stream limit throws an untyped error before that boundary can return 413.
export default defineConfig({
  output: 'server',
  adapter: node({mode: 'standalone', bodySizeLimit: 0}),
  integrations: [
    diaryStylesPackaging(),
    diaryBundlePackaging(),
    offlinePackaging(),
    recipeWorkerPackaging(),
    barcodePackaging(),
  ],
  server: {host: '127.0.0.1', port: 4291},
});
