// Browser regression for editor loads overlapping a background library refresh.
// Local fixture responses verify UI ownership; they do not verify Appwrite.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFileSync} from 'node:fs';
import {chromium} from 'playwright-core';
let releaseItem;
const item={id:'fixture',name:'Refresh fixture',grams:100,serving:'100 g',nutrients:{calories:100}};
const server=createServer(async(req,res)=>{
 if(req.url==='/'){res.setHeader('Content-Type','text/html');res.end(`<div id="page"></div><div id="content"></div><script type="module">import {mountLibrary} from '/library.js';const page=document.querySelector('#page'),content=document.querySelector('#content');window.library=mountLibrary({page,content,header:title=>'<h2>'+title+'</h2>',show:html=>content.innerHTML=html,close:()=>content.replaceChildren(),date:()=>'2026-11-14',openEntry:()=>{},onChange:async()=>{}});</script>`);return;}
 if(req.url.startsWith('/api/')){res.setHeader('Content-Type','application/json');if(req.url.startsWith('/api/library/item')){await new Promise(resolve=>{releaseItem=resolve;});res.end(JSON.stringify({kind:'food',resource:item,ingredients:[]}));}else if(req.url==='/api/library')res.end(JSON.stringify({revision:'a'.repeat(64),items:[{...item,kind:'food'}],nutrients:[{id:'calories',name:'Energy',unit:'kcal'}]}));else res.end(JSON.stringify({nutrition:{totals:{calories:100}}}));return;}
 const files=['library.js','diary-api.js','html.js','quantity.js','food-picker.js'];const name=req.url.slice(1);if(!files.includes(name)){res.writeHead(404).end();return;}res.setHeader('Content-Type','text/javascript');res.end(readFileSync(new URL('../public/'+name,import.meta.url)));
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let browser;
try{
 browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});const page=await browser.newPage();page.setDefaultTimeout(5000);await page.goto(`http://127.0.0.1:${server.address().port}/`);
 await page.locator('[data-library-item]').click();await page.getByText('Loading…',{exact:true}).waitFor();await page.evaluate(()=>window.library.reload());releaseItem();await page.getByRole('heading',{name:'Edit Custom Food',exact:true}).waitFor();assert.equal(await page.getByLabel('Name',{exact:true}).inputValue(),item.name);
 await page.locator('[data-library-item]').click();await page.getByText('Loading…',{exact:true}).waitFor();await page.evaluate(()=>document.querySelector('#content').replaceChildren());releaseItem();await page.waitForLoadState('networkidle');assert.equal(await page.locator('#content').textContent(),'');
 console.log('PASS: refresh does not cancel item load; dismissed editor stays closed');
}finally{releaseItem?.();await browser?.close();await new Promise(resolve=>server.close(resolve));}
