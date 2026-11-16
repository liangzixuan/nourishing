import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFileSync,readdirSync} from 'node:fs';
import {chromium} from 'playwright-core';
import {createWebHandler} from '../server/http.mjs';
import {barcodeAssets} from '../scripts/package-barcode-assets.mjs';
test('Account follows saved appearance and device changes while auth starts dark',async()=>{
 const assets=new Map((await barcodeAssets()).map(asset=>['/'+asset.path,asset]));
 function visit(dir,prefix=''){for(const entry of readdirSync(dir,{withFileTypes:true})){if(entry.isDirectory())visit(dir+'/'+entry.name,prefix+'/'+entry.name);else assets.set(prefix+'/'+entry.name,{body:readFileSync(dir+'/'+entry.name),type:entry.name.endsWith('.css')?'text/css':/\.m?js$/.test(entry.name)?'text/javascript':entry.name.endsWith('.svg')?'image/svg+xml':entry.name.endsWith('.html')?'text/html':'application/octet-stream'});}}visit('public');assets.set('/',assets.get('/index.html'));
 let base,handler,browser,theme='light',unavailable=false;
 const server=createServer(async(req,res)=>{const result=await handler(new Request(base+req.url,{method:req.method,headers:req.headers}));res.writeHead(result.status,Object.fromEntries(result.headers));res.end(Buffer.from(await result.arrayBuffer()));});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));base='http://127.0.0.1:'+server.address().port;
 handler=createWebHandler({config:{origin:base},assets,service:{current:async()=>({id:'appearance-fixture',name:'Fixture',email:'appearance@example.com',emailVerified:true,profile:{timeZone:'UTC',units:'metric'}}),display:async()=>{if(unavailable)throw {code:503,publicMessage:'Unavailable'};return {settings:{theme}};}}});
 try{
  browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});const page=await browser.newPage({viewport:{width:412,height:915},extraHTTPHeaders:{Cookie:'__Host-nourishing_session=fixture'}}),errors=[];page.on('pageerror',error=>errors.push(error.message));await page.addInitScript(()=>{window.cspErrors=[];document.addEventListener('securitypolicyviolation',event=>window.cspErrors.push(event.violatedDirective));});
  await page.goto(base+'/account');await page.getByRole('heading',{name:'Account',exact:true}).waitFor();assert.equal(await page.locator('body').evaluate(el=>el.classList.contains('dark')),false);assert.equal(await page.locator('body').evaluate(el=>getComputedStyle(el).colorScheme),'light');assert.equal(await page.getByText('Cloud preview',{exact:true}).count(),0);assert.equal(await page.getByRole('link',{name:'Back to diary',exact:false}).getAttribute('href'),'/diary');
  theme='system';await page.emulateMedia({colorScheme:'dark'});await page.reload();await page.getByRole('heading',{name:'Account',exact:true}).waitFor();assert.equal(await page.locator('body').evaluate(el=>getComputedStyle(el).colorScheme),'dark');await page.emulateMedia({colorScheme:'light'});await page.waitForFunction(()=>!document.body.classList.contains('dark'));
  unavailable=true;await page.reload();await page.getByRole('heading',{name:'Account',exact:true}).waitFor();assert.equal(await page.locator('body').evaluate(el=>getComputedStyle(el).colorScheme),'dark');await page.goto(base+'/login');await page.getByRole('heading',{name:'Sign in',exact:true}).waitFor();assert.equal(await page.locator('body').evaluate(el=>getComputedStyle(el).colorScheme),'dark');assert.deepEqual(errors,[]);assert.deepEqual(await page.evaluate(()=>window.cspErrors),[]);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 }finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
});
