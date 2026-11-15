import {defineConfig} from 'astro/config';
import node from '@astrojs/node';
import {recipeWorkerPackaging} from './scripts/package-recipe-worker.mjs';
export default defineConfig({output:'server',adapter:node({mode:'standalone',bodySizeLimit:20_000_000}),integrations:[recipeWorkerPackaging()],server:{host:'127.0.0.1',port:4291}});
