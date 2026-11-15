// Real browser checks against public build assets; no account or provider access.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,sep,extname} from 'node:path';
import {chromium} from 'playwright-core';
import sharp from 'sharp';

const root=resolve('dist/client'),types={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.webmanifest':'application/manifest+json'};
const manifest=JSON.parse(await readFile(resolve(root,'manifest.webmanifest'),'utf8'));
assert.equal(manifest.name,'Nourishing');assert.equal(manifest.display,'standalone');assert.equal(manifest.start_url,'/diary');assert.equal(manifest.scope,'/');
for(const icon of manifest.icons){const metadata=await sharp(await readFile(resolve(root,'.'+icon.src))).metadata();assert.equal(`${metadata.width}x${metadata.height}`,icon.sizes);}
const server=createServer(async(req,res)=>{
 try{
  const path=new URL(req.url,'http://localhost').pathname;
  if(path==='/api/private'){res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end('{"private":"fixture"}');return;}
  if(path.startsWith('/api/')){res.writeHead(401,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end('{"error":"Please sign in."}');return;}
  const file=resolve(root,'.'+(path==='/'||path==='/login'?'/index.html':path==='/diary'?'/diary.html':path));
  if(!file.startsWith(root+sep))throw Error('Outside public assets');
  res.writeHead(200,{'Content-Type':types[extname(file)]??'application/octet-stream','Cache-Control':'no-cache'});res.end(await readFile(file));
 }catch{if(!res.headersSent)res.writeHead(404);res.end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin=`http://127.0.0.1:${server.address().port}`;let browser;
try{
 browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 const context=await browser.newContext({viewport:{width:412,height:915},isMobile:true,hasTouch:true}),page=await context.newPage();
 await page.goto(origin+'/login');await page.evaluate(()=>navigator.serviceWorker.ready);
 await page.waitForFunction(()=>navigator.serviceWorker.controller!==null);
 assert.equal(await page.locator('link[rel=manifest]').getAttribute('href'),'/manifest.webmanifest');
 const privateData=await page.evaluate(()=>fetch('/api/private').then(response=>response.json()));assert.equal(privateData.private,'fixture');
 const cacheUrls=await page.evaluate(async()=>{const result=[];for(const name of await caches.keys())for(const request of await(await caches.open(name)).keys())result.push(new URL(request.url).pathname);return result.sort();});
 const assetManifest=await page.evaluate(()=>fetch('/offline-assets.js').then(r=>r.text()).then(text=>JSON.parse(text.slice(text.indexOf('=')+1).replace(/;\s*$/,''))));
 assert.deepEqual(cacheUrls,assetManifest.files.slice().sort());assert.ok(cacheUrls.every(path=>!path.startsWith('/api/')&&!['/diary','/account','/login'].includes(path)));
 await context.setOffline(true);
 assert.equal(await page.evaluate(()=>fetch('/api/private').then(()=>false,()=>true)),true,'private API must not fall back to stale data');
 await page.goto(origin+'/diary');await page.getByRole('heading',{name:'Offline diary'}).waitFor();
 assert.equal(await page.getByRole('link',{name:'Open online diary'}).getAttribute('href'),'/diary');
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 await context.setOffline(false);await page.goto(origin+'/login');await page.getByRole('heading',{name:'Sign in',exact:true}).waitFor();
 console.log(JSON.stringify({ok:true,checks:['install manifest','generated icon dimensions','service worker registration','public-only cache','private API offline rejection','offline navigation','mobile width','online recovery']}));
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
