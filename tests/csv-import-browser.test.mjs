import {CHROME_EXECUTABLE} from './_chrome.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFileSync,existsSync} from 'node:fs';
import {accountCloudMessages} from '../public/account-cloud-messages.js';
import {uiMessages} from '../public/report-source/public/locales/index.js';
import {chromium} from 'playwright-core';

for(const locale of ['en','fr'])test('CSV '+locale+' form previews before import and retains the same command after an uncertain reply and reopen',async()=>{
 const m=key=>accountCloudMessages[locale]['accountCloud.'+key];
 const imports=[],previewRequests=[];let committed=false,loseReply=true;
 const server=createServer(async(req,res)=>{try{
  const path=new URL(req.url,'http://localhost').pathname;
  if(path==='/'){
   res.setHeader('Content-Type','text/html');return res.end(`<button id="open">Open import</button><div id="sheet"></div><div id="saved"></div><script type="module">import {openImports} from '/imports.js';const content=document.querySelector('#sheet');document.querySelector('#open').onclick=()=>openImports({content,show:html=>{content.innerHTML=html;content.querySelector('[data-close]').onclick=()=>content.replaceChildren();},close:()=>content.replaceChildren(),header:title=>'<h1>'+title+'</h1><button data-close>Close</button>',onChange:async()=>{document.querySelector('#saved').textContent='Imported';}});document.querySelector('#open').click();</script>`);
  }
  if(req.method==='POST'){
   let raw='';for await(const chunk of req)raw+=chunk;const input=JSON.parse(raw);res.setHeader('Content-Type','application/json');
   if(path==='/api/imports/csv/preview'){previewRequests.push(input);return res.end(JSON.stringify({kind:input.kind,count:2,revision:'a'.repeat(64),reviewToken:'review-token'}));}
   if(path==='/api/imports/csv/import'){
    imports.push(input);committed=true;
    if(loseReply){loseReply=false;res.writeHead(503);return res.end(JSON.stringify({error:'Connection interrupted. Try again.'}));}
    return res.end(JSON.stringify({ok:true,count:2,revision:'b'.repeat(64)}));
   }
  }
  const name=path.slice(1),file=new URL('../public/'+name,import.meta.url);
  if(!/^[\w./-]+\.m?js$/.test(name)||!existsSync(file)){res.writeHead(404).end();return;}
  res.setHeader('Content-Type','text/javascript');res.end(readFileSync(file));
 }catch(error){res.writeHead(500).end(JSON.stringify({error:error.message}));}});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let browser;
 try{
  browser=await chromium.launch({executablePath:CHROME_EXECUTABLE,headless:true});
  const page=await browser.newPage({locale,viewport:{width:412,height:915}});page.setDefaultTimeout(10000);const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page.getByLabel(m('importType')).selectOption('biometrics');
  const source='date,type,value,unit\n2026-11-14,Weight,70,kg\n2026-11-15,Weight,71,kg';
  await page.getByLabel(m('csvFile'),{exact:true}).setInputFiles({name:'metrics.csv',mimeType:'text/csv',buffer:Buffer.from(source)});
  assert.equal(previewRequests.length,0);assert.equal(imports.length,0);
  await page.getByRole('button',{name:uiMessages[locale]['bodyPanel.preview'],exact:true}).click();await page.getByText(m('importReadyMany').replace('{{count}}','2'),{exact:true}).waitFor();
  assert.deepEqual(previewRequests,[{kind:'biometrics',text:source}]);assert.equal(await page.locator('[data-columns]').textContent(),'date, type, value, unit, time');assert.equal(committed,false);
  await page.getByRole('button',{name:m('importAction'),exact:true}).click();await page.getByRole('button',{name:m('importRetry'),exact:true}).waitFor();assert.equal(committed,true);
  await page.getByRole('button',{name:'Close',exact:true}).click();await page.getByRole('button',{name:'Open import',exact:true}).click();
  await page.getByRole('button',{name:m('importRetry'),exact:true}).click();await page.getByText('Imported',{exact:true}).waitFor();
  assert.equal(imports.length,2);assert.deepEqual(imports[0],imports[1]);assert.deepEqual(errors,[]);
 }finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
});
