import {cpSync,mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';

// Include only deployable source and build inputs; credentials and local evidence stay here.
const destination=resolve('.local/deploy-site-'+Date.now());
mkdirSync(destination,{recursive:true});
for(const name of ['public','server','src','package.json','package-lock.json','astro.config.mjs'])cpSync(name,destination+'/'+name,{recursive:true});
mkdirSync(destination+'/scripts');
for(const name of ['package-recipe-worker.mjs','package-barcode-assets.mjs','package-pwa-icons.mjs'])cpSync('scripts/'+name,destination+'/scripts/'+name);
writeFileSync('.local/site-stage.json',JSON.stringify({destination},null,2));
console.log(destination);
