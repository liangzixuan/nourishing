import {defineConfig} from 'astro/config';
import node from '@astrojs/node';
import {recipeWorkerPackaging} from './scripts/package-recipe-worker.mjs';
// server/http owns streaming route limits after authentication. The adapter's
// competing stream limit throws an untyped error before that boundary can return 413.
export default defineConfig({output:'server',adapter:node({mode:'standalone',bodySizeLimit:0}),integrations:[recipeWorkerPackaging()],server:{host:'127.0.0.1',port:4291}});
