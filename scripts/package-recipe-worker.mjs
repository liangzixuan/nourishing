import {readFile} from 'node:fs/promises';
import {posix} from 'node:path';

const assets = ['recipe-jsonld-worker.mjs', 'schemaorg-context.json', 'schemaorg-context-source.json'];
/** Keep the unchanged Node worker and its verified context beside its emitted SSR owner. */
export function recipeWorkerPackaging() {
  let packaged = false;
  return {name: 'nourishing-recipe-worker', hooks: {'astro:build:setup': ({target, updateConfig}) => {
    if (target !== 'server') return;
    updateConfig({plugins: [{name: 'nourishing-recipe-worker-assets', async generateBundle(_, bundle) {
      const owner = Object.values(bundle).filter(chunk => chunk.type === 'chunk' && chunk.moduleIds.some(id => id.replaceAll('\\', '/').endsWith('/server/domain/recipe-jsonld-expand.mjs')));
      if (!owner.length) return; // Astro also emits a separate middleware graph.
      if (owner.length !== 1) throw Error('Recipe worker must have one emitted SSR owner.');
      const directory = posix.dirname(owner[0].fileName);
      for (const name of assets) this.emitFile({type: 'asset', fileName: posix.join(directory, name), source: await readFile(new URL('../server/domain/' + name, import.meta.url))});
      this.emitFile({type: 'asset', fileName: 'recipe-worker-manifest.json', source: JSON.stringify({parent: owner[0].fileName, assets: assets.map(name => posix.join(directory, name))})});
      packaged = true;
    }}]});
  }, 'astro:build:done': () => {if (!packaged) throw Error('The SSR recipe worker was not packaged.');}}};
}
