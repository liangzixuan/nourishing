import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createServer} from 'node:http';
import {chromium} from 'playwright-core';

const script=readFileSync(new URL('../app/src/main/assets/nourishing-bridge.js',import.meta.url),'utf8');
const server=createServer((request,response)=>{
 if(request.url==='/bridge.js'){response.setHeader('Content-Type','application/javascript');response.end(script);}
 else if(request.url==='/report-source/print-en.css'){response.setHeader('Content-Type','text/css');response.end('body{font-size:17px}h1{color:rgb(0,100,90)}');}
 else {response.setHeader('Content-Type','text/html');response.end('<!doctype html><body><script src="/bridge.js"></script></body>');}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let browser;
try{
 browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 const page=await browser.newPage();await page.goto(`http://127.0.0.1:${server.address().port}`);
 await page.evaluate(()=>{
  window.printTransfers=[];let incoming;const channel=new MessageChannel();
  channel.port1.onmessage=event=>{const message=JSON.parse(event.data);
   if(message.op==='start')incoming={...message,parts:[]};
   if(message.op==='chunk')incoming.parts.push(atob(message.data));
   if(message.op==='end'){window.printTransfers.push({...incoming,html:incoming.parts.join('')});incoming=null;}
   channel.port1.postMessage(JSON.stringify({id:message.id,ok:true}));
  };window.postMessage('nourishing-native-port','*',[channel.port2]);
  const frame=document.createElement('iframe');frame.dataset.printAccountId='fixture-owner';
  frame.srcdoc='<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="default-src &#39;none&#39;; style-src &#39;self&#39;"><link rel="stylesheet" href="/report-source/print-en.css"></head><body><h1>Reviewed report</h1></body></html>';
  document.body.append(frame);
 });
 await page.waitForFunction(()=>getComputedStyle(document.querySelector('iframe').contentDocument.body).fontSize==='17px');
 await page.evaluate(()=>document.querySelector('iframe').contentWindow.print());
 await page.waitForFunction(()=>window.printTransfers.length===1);
 const captured=await page.evaluate(()=>({transfer:window.printTransfers[0],previewHasLink:!!document.querySelector('iframe').contentDocument.querySelector('link[rel=stylesheet]')}));
 assert.equal(captured.transfer.kind,'print');assert.equal(captured.transfer.accountId,'fixture-owner');
 assert.match(captured.transfer.html,/<style[\s>]/);assert.match(captured.transfer.html,/font-size: 17px/);assert.doesNotMatch(captured.transfer.html,/<link[^>]+stylesheet/);
 assert.match(captured.transfer.html,/style-src 'unsafe-inline'/);assert.equal(captured.previewHasLink,true);
 await page.evaluate(()=>{window.printErrors=[];window.alert=value=>window.printErrors.push(value);delete document.querySelector('iframe').dataset.printAccountId;return document.querySelector('iframe').contentWindow.print();});
 assert.equal(await page.evaluate(()=>window.printTransfers.length),1);assert.match(await page.evaluate(()=>window.printErrors.at(-1)),/signed-in account/);
 await page.evaluate(()=>{const frame=document.querySelector('iframe');frame.dataset.printAccountId='fixture-owner';frame.contentDocument.querySelector('link').href='/report-source/print-en.css?unexpected=1';return frame.contentWindow.print();});
 assert.equal(await page.evaluate(()=>window.printTransfers.length),1);assert.match(await page.evaluate(()=>window.printErrors.at(-1)),/stylesheet/);
 console.log('Native print bridge: account metadata, captured CSS, strict offline document, unchanged preview and missing-account/untrusted-style rejection passed.');
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
