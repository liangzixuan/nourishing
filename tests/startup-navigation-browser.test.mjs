import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFileSync,existsSync} from 'node:fs';
import {resolve,extname} from 'node:path';
import {chromium} from 'playwright-core';
import {barcodeAssets} from '../scripts/package-barcode-assets.mjs';
import {createWebHandler} from '../server/http.mjs';
import {initialState} from '../server/domain/workspace.mjs';
import {createDataRepository} from '../server/data-repository.mjs';
import {diaryStoreFixture} from './fixtures/diary-store.mjs';
import {dashboardView} from '../server/dashboard-view.mjs';
import {chartSurfaceView} from '../server/dashboard-pinned-charts.mjs';
import {reportView} from '../server/nutrition-views.mjs';

async function fixture(){
 const state=initialState(),data=diaryStoreFixture(state),repository=createDataRepository(data.db,'fixture'),clock={now:new Date(),timeZone:'UTC'};
 let hold=null,denied=false,base,handle;
 const service={current:async secret=>{await hold;if(denied)throw {code:401};return {id:secret};},readDiary:async(_,day)=>repository.diary(day,clock),dashboard:async(_,date)=>dashboardView(state,{date},clock),charts:async(_,input)=>chartSurfaceView(state,input,clock),nutritionReport:async(_,input)=>reportView(state,input,clock),snapshots:async()=>({items:[]})};
 const vendor=new Map((await barcodeAssets()).map(a=>['/'+a.path,a])),root=resolve('public');
 const assets={get(path){if(vendor.has(path))return vendor.get(path);if(path==='/login')return {type:'text/html',body:'<!doctype html><title>Sign in</title>'};const file=resolve(root,'.'+(path==='/diary'?'/diary.html':path)),ext=extname(file);if((file.startsWith(root+'/')||file.startsWith(root+'\\'))&&existsSync(file)&&['.html','.js','.mjs','.css','.svg','.woff2'].includes(ext))return {body:readFileSync(file),type:ext==='.html'?'text/html':ext==='.css'?'text/css':ext==='.svg'?'image/svg+xml':ext==='.woff2'?'font/woff2':'text/javascript'};}};
 const server=createServer(async(req,res)=>{const response=await handle(new Request(base+req.url,{method:req.method,headers:req.headers,...(req.method==='GET'?{}:{body:req,duplex:'half'})}));res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));});await new Promise(r=>server.listen(0,'127.0.0.1',r));base='http://127.0.0.1:'+server.address().port;handle=createWebHandler({config:{origin:base},service,assets});
 const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true}),context=await browser.newContext({viewport:{width:412,height:915},isMobile:true,hasTouch:true,extraHTTPHeaders:{Cookie:'__Host-nourishing_session=alice'}}),page=await context.newPage();page.setDefaultTimeout(8000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
 let release;return {page,context,base,errors,hold(){hold=new Promise(r=>release=r);},release(){release?.();hold=null;},deny(){denied=true;},close:async()=>{release?.();await browser.close();server.closeAllConnections();await new Promise(r=>server.close(r));}};
}

test('saved diary renders before delayed session revalidation, while changed and revoked sessions cannot retain it',async()=>{
 const f=await fixture();try{const {page}=f;await page.goto(f.base+'/diary');await page.locator('.md-diary').waitFor();
  f.hold();await page.reload({waitUntil:'domcontentloaded'});await page.locator('.md-diary').waitFor({timeout:1500});f.release();
  await f.context.setExtraHTTPHeaders({Cookie:'__Host-nourishing_session=bob'});f.hold();await page.reload({waitUntil:'domcontentloaded'});assert.equal(await page.locator('.md-diary').count(),0);f.release();await page.locator('.md-diary').waitFor();
  const context=await page.locator('meta[name="nourishing-session"]').getAttribute('content');f.hold();f.deny();await page.reload({waitUntil:'domcontentloaded'});await page.locator('.md-diary').waitFor({timeout:1500});f.release();await page.waitForURL('**/login');assert.equal(await page.evaluate(async context=>{const m=await import('/offline-store.js');return (await m.resumePrivateResponses(context))??null;},context),null);
  assert.deepEqual(f.errors,[]);
 }finally{await f.close();}
});

test('first center swipe works in both directions after Diary to Discover remounts',async()=>{
 const f=await fixture();try{const {page}=f;await page.goto(f.base+'/diary');await page.locator('.md-diary').waitFor();const cdp=await page.context().newCDPSession(page);
  for(const [from,to,direction] of [['dashboard','charts',-1],['charts','report',-1],['report','snapshots',-1],['snapshots','report',1],['report','charts',1],['charts','dashboard',1]]){
   await page.locator('#diary-tab').click();await page.locator('#discover-tab').click();if(from!=='dashboard')await page.locator('[data-tab='+from+']').click();await page.waitForFunction(()=>!document.documentElement.classList.contains('discover-transition'));await page.evaluate(()=>scrollTo(0,0));
   const y=457,x=direction<0?300:110;await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});for(let i=1;i<=5;i++)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x+direction*190*i/5,y}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await page.waitForFunction(()=>!document.documentElement.classList.contains('discover-transition'));assert.equal(await page.locator('[data-tab='+to+']').getAttribute('aria-current'),'page',from+' -> '+to);
  }assert.deepEqual(f.errors,[]);
 }finally{await f.close();}
});
