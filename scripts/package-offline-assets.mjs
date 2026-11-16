import {readFile,writeFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {posix} from 'node:path';
import {init,parse} from 'es-module-lexer';
import {barcodeAssets} from './package-barcode-assets.mjs';
const publicRoot=new URL('../public/',import.meta.url);
export async function buildOfflineAssets(){
 await init;const contents=new Map();
 async function visit(path){
  if(!path.startsWith('/')||path.includes('..')||path.startsWith('/api/')||/[?#]/.test(path))throw Error('Offline assets must be public static paths.');
  if(contents.has(path))return;
  const bytes=await readFile(new URL(path.slice(1),publicRoot));contents.set(path,bytes);
  if(!/\.(m?js)$/.test(path))return;
  for(const row of parse(bytes.toString('utf8'))[0]){
   if(row.type==='import-meta')continue;
   if(row.type!=='static')throw Error('Offline asset imports must be static: '+path);
   const spec=row.specifier;
   if(!spec.startsWith('.')&&!spec.startsWith('/'))throw Error('Offline dependency must be locally packaged: '+spec);
   await visit(spec.startsWith('/')?spec:posix.resolve(posix.dirname(path),spec));
  }
 }
 for(const path of ['/offline.html','/offline.css','/offline-diary.css','/favicon.svg','/offline-page.js'])await visit(path);
 const precache=[...contents.keys()].sort();
 // The complete public asset inventory is versioned, but only the offline shell
 // is eagerly downloaded. Each online screen is cached as it is first used.
 async function inventory(prefix=''){
  for(const row of await readdir(new URL('.'+prefix+'/',publicRoot),{withFileTypes:true})){
   const path=prefix+'/'+row.name;
   if(row.isDirectory()){await inventory(path);continue;}
   if(['/sw.js','/offline-assets.js','/pwa-update.js','/pwa-update.css'].includes(path)||! /\.(?:m?js|css|svg|png|jpg|webp|woff2?|wasm)$/.test(path))continue;
   if(!contents.has(path))contents.set(path,await readFile(new URL(path.slice(1),publicRoot)));
  }
 }
 await inventory();for(const asset of await barcodeAssets())contents.set('/'+asset.path,asset.body);
 const hash=createHash('sha256'),files=[...contents.keys()].sort();for(const file of files){hash.update(file+'\0');hash.update(contents.get(file));}
 const manifest={cache:'nourishing-public-offline-'+hash.digest('hex').slice(0,20),files,precache};
 await writeFile(new URL('offline-assets.js',publicRoot),'self.NOURISHING_OFFLINE='+JSON.stringify(manifest)+';\n');return manifest;
}
export function offlinePackaging(){return {name:'nourishing-offline-assets',hooks:{'astro:config:setup':buildOfflineAssets}};}
if(process.argv[1]===fileURLToPath(import.meta.url))console.log(JSON.stringify(await buildOfflineAssets()));
