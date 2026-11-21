import {licenseNotices} from '../public/more-source/license-notices.js';
import {readFile,writeFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {posix} from 'node:path';
import {init,parse} from 'es-module-lexer';
import {load} from 'cheerio';
import {buildPwaIcons} from './package-pwa-icons.mjs';
import {barcodeAssets} from './package-barcode-assets.mjs';
const publicRoot=new URL('../public/',import.meta.url);
export async function buildOfflineAssets(){
 await init;const contents=new Map(),vendor=new Map((await barcodeAssets()).map(asset=>['/'+asset.path,asset.body]));
 async function visit(path){
  if(!path.startsWith('/')||path.includes('..')||path.startsWith('/api/')||/[?#]/.test(path))throw Error('Offline assets must be public static paths.');
  if(contents.has(path))return;
  const bytes=vendor.get(path)??await readFile(new URL(path.slice(1),publicRoot));contents.set(path,bytes);
  if(!/\.(m?js)$/.test(path))return;
  for(const row of parse(bytes.toString('utf8'))[0]){
   if(row.type==='import-meta'||(row.type==='dynamic'&&row.glob))continue; // Runtime-selected optional vendors stay on demand.
   if(!['static','dynamic'].includes(row.type)||typeof row.specifier!=='string')throw Error('Offline asset imports must use literal local paths: '+path);
   const spec=row.specifier;
   if(!spec.startsWith('.')&&!spec.startsWith('/'))throw Error('Offline dependency must be locally packaged: '+spec);
   await visit(spec.startsWith('/')?spec:posix.resolve(posix.dirname(path),spec));
  }
 }
 const source=await readFile(new URL('diary.html',publicRoot),'utf8'),shell=load(source);
 shell('head').append('<meta name="nourishing-offline-shell" content="public">');
 shell('script[src="/pwa-update.js"],link[href="/pwa-update.css"]').remove();
 await writeFile(new URL('diary-shell.html',publicRoot),shell.html());
 for(const path of ['/diary-shell.html','/offline.html','/favicon.svg','/offline-page.js'])await visit(path);
 // Prepare every module in the authenticated diary entry graph before the
 // worker can become waiting and offer Reload. Authenticated HTML stays network-only.
 const diary=load(await readFile(new URL('diary.html',publicRoot),'utf8'));
 for(const script of diary('script[src]').toArray()){
  const path=diary(script).attr('src');if(path!=='/pwa-update.js')await visit(path);
 }
 const manifestPath=diary('link[rel="manifest"]').attr('href');
 await visit(manifestPath);
 const manifestIcons=JSON.parse(contents.get(manifestPath).toString('utf8')).icons;
 const generated=await buildPwaIcons();
 for(const {path,body} of generated)contents.set('/'+path,body);
 for(const path of [diary('link[rel="apple-touch-icon"]').attr('href'),...manifestIcons.map(icon=>icon.src)])await visit(path);
 for(const [,path] of licenseNotices)await visit(path);
 await visit('/general-walking.html');
 const startup=new Set(contents.keys());
 // Styles and their fonts/icons are small shared presentation assets. Cache the
 // full inventory so nested CSS imports cannot stall the updated shell.
 async function inventory(prefix=''){
  for(const row of await readdir(new URL('.'+prefix+'/',publicRoot),{withFileTypes:true})){
   const path=prefix+'/'+row.name;
   if(row.isDirectory()){await inventory(path);continue;}
   if(['/sw.js','/offline-assets.js','/pwa-update.js','/pwa-update.css'].includes(path)||! /\.(?:m?js|css|svg|png|jpg|webp|woff2?|wasm)$/.test(path))continue;
   if(!contents.has(path))contents.set(path,await readFile(new URL(path.slice(1),publicRoot)));
  }
 }
 await inventory();for(const [path,body] of vendor)contents.set(path,body);
 const hash=createHash('sha256'),files=[...contents.keys()].sort();
 const precache=files.filter(file=>startup.has(file)||/\.(?:css|woff2?|svg)$/.test(file));
 hash.update(JSON.stringify(precache));
 for(const file of files){hash.update(file+'\0');hash.update(contents.get(file));}
 const manifest={cache:'nourishing-public-offline-'+hash.digest('hex').slice(0,20),files,precache};
 await writeFile(new URL('offline-assets.js',publicRoot),'self.NOURISHING_OFFLINE='+JSON.stringify(manifest)+';\n');return manifest;
}
export function offlinePackaging(){return {name:'nourishing-offline-assets',hooks:{'astro:config:setup':buildOfflineAssets}};}
if(process.argv[1]===fileURLToPath(import.meta.url))console.log(JSON.stringify(await buildOfflineAssets()));
