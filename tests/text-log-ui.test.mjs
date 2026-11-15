import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFileSync} from 'node:fs';
import {resolve,extname} from 'node:path';
import {chromium} from 'playwright-core';
import {initialState,act} from '../server/domain/workspace.mjs';
import {parseTextFoodLog} from '../server/text-log.mjs';
import {digest} from '../server/data-codec.mjs';
import {libraryItem} from '../server/library-view.mjs';
import {applyWorkspaceCommand} from '../server/workspace-commands.mjs';

test('mobile text review edits unresolved amounts, retries once and cleans up browser dictation',async()=>{
 const state=initialState();state.foods=[];state.settings.groups.unshift('Uncategorized');act(state,'food.save',{name:'Rice, cooked',serving:'100 g',grams:100,nutrients:{calories:130}});
 const catalog={get:()=>null,projectInsights:()=>[]},receipts=new Map(),commands=[];let parseCount=0,loseNext=true,browser;
 const bootstrap=`import {mountTextLog} from '/text-log.js';const content=document.querySelector('#sheet-content');let mounted;const close=()=>content.replaceChildren();document.querySelector('#open').onclick=()=>{mounted?.dispose();mounted=mountTextLog({show:html=>content.innerHTML=html,close,header:title=>'<h1>'+title+'</h1>',content,date:()=> '2026-11-15',groups:['Uncategorized','Lunch']});};document.querySelector('#close').onclick=close;`;
 const publicRoot=resolve('public'),server=createServer(async(req,res)=>{try{
  const url=new URL(req.url,'http://localhost'),path=url.pathname;res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'");
  if(path==='/'){res.setHeader('Content-Type','text/html');return res.end('<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/diary.css"><link rel="stylesheet" href="/text-log.css"><button id="open">Open text log</button><button id="close">Close</button><div id="sheet-content"></div><script type="module" src="/fixture.js"></script>');}
  if(path==='/fixture.js'){res.setHeader('Content-Type','text/javascript');return res.end(bootstrap);}
  if(path.startsWith('/api/')){res.setHeader('Content-Type','application/json');let text='';for await(const chunk of req)text+=chunk;const input=text?JSON.parse(text):null;
   if(path==='/api/text-log/parse'){parseCount++;return res.end(JSON.stringify(parseTextFoodLog(state,catalog,input)));}
   if(path==='/api/library/item')return res.end(JSON.stringify(libraryItem(state,'food',state.foods.find(food=>food.id===url.searchParams.get('id')))));
   if(path==='/api/workspace/command'){commands.push(input);if(receipts.has(input.requestId))return res.end(JSON.stringify(receipts.get(input.requestId)));if(input.revision!==digest(state))throw {status:409,message:'Refresh the diary.'};const result=applyWorkspaceCommand(state,{type:input.type,payload:input.payload}),reply={revision:digest(state),result};receipts.set(input.requestId,reply);if(loseNext){loseNext=false;throw {status:503,message:'Connection interrupted. Try again.'};}return res.end(JSON.stringify(reply));}
   throw {status:404,message:'Unknown fixture route'};
  }
  const file=resolve(publicRoot,'.'+path);if(!file.startsWith(publicRoot+'\\')&&!file.startsWith(publicRoot+'/'))throw {status:404};res.setHeader('Content-Type',extname(file)==='.js'?'text/javascript':'text/css');res.end(readFileSync(file));
 }catch(error){res.statusCode=typeof error.code==='number'?error.code:error.status??500;res.setHeader('Content-Type','application/json');res.end(JSON.stringify({error:error.message??'Request failed.'}));}});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{
  browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});const page=await browser.newPage({viewport:{width:412,height:915},isMobile:true,hasTouch:true});page.setDefaultTimeout(5000);const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.addInitScript(()=>{window.SpeechRecognition=undefined;window.webkitSpeechRecognition=undefined;});await page.goto('http://127.0.0.1:'+server.address().port);await page.getByRole('button',{name:'Open text log'}).click();assert.equal(await page.getByRole('button',{name:'Speak',exact:true}).count(),0);
  await page.getByLabel('Foods & amounts').fill('150 g cooked rice\ncooked rice');await page.getByRole('button',{name:'Find foods'}).click();await page.getByRole('button',{name:'Set amount'}).waitFor();assert.equal(await page.getByRole('button',{name:'Add to diary'}).isDisabled(),true);assert.equal(await page.getByLabel('Group').inputValue(),'Uncategorized');
  await page.getByRole('button',{name:'Set amount'}).click();await page.getByLabel('Amount',{exact:true}).fill('50');await page.getByLabel('Serving',{exact:true}).selectOption('g');await page.getByRole('button',{name:'Done',exact:true}).click();await page.getByRole('button',{name:'50 g',exact:true}).waitFor();await page.getByRole('button',{name:'Add to diary'}).click();await page.getByRole('status').filter({hasText:'Connection interrupted'}).waitFor();assert.equal(state.entries.length,2);await page.getByRole('button',{name:'Add to diary'}).click();await page.locator('.text-log').waitFor({state:'detached'});assert.equal(state.entries.length,2);assert.equal(commands[0].requestId,commands[1].requestId);assert.deepEqual(state.entries.map(row=>row.quantity),[150,50]);assert.ok(state.entries.every(row=>row.group==='Uncategorized'));assert.ok(state.entries.every(row=>row.textReview.originalText==='150 g cooked rice\ncooked rice'&&row.textReview.rows[0].confirmed));assert.deepEqual(state.entries.map(row=>row.textReview.observations[0].override.quantity),[150,50]);assert.deepEqual(state.entries.map(row=>row.textReview.observations[0].phrase),['150 g cooked rice','cooked rice']);
  await page.evaluate(()=>{window.speechAborts=0;window.SpeechRecognition=class{constructor(){window.testSpeech=this;}start(){this.onstart?.();}abort(){window.speechAborts++;}};});await page.getByRole('button',{name:'Open text log'}).click();assert.equal(await page.getByLabel('Foods & amounts').inputValue(),'');await page.getByRole('button',{name:'Speak',exact:true}).click();await page.getByRole('status').filter({hasText:'Listening'}).waitFor();await page.evaluate(()=>window.testSpeech.onresult({results:[Object.assign([{transcript:'75 g cooked rice'}],{isFinal:true})]}));await page.getByRole('button',{name:'Speak',exact:true}).waitFor();assert.equal(await page.getByLabel('Foods & amounts').inputValue(),'75 g cooked rice');assert.equal(parseCount,1);
  await page.getByRole('button',{name:'Find foods'}).click();await page.getByRole('button',{name:'75 g',exact:true}).waitFor();await page.getByRole('button',{name:'Edit text'}).click();await page.getByRole('button',{name:'Speak',exact:true}).click();await page.getByRole('button',{name:'Close',exact:true}).click();await page.waitForFunction(()=>window.speechAborts===2);assert.equal(await page.evaluate(()=>window.testSpeech.onresult),null);
  await page.getByRole('button',{name:'Open text log'}).click();assert.equal(await page.getByLabel('Foods & amounts').inputValue(),'');await page.getByLabel('Foods & amounts').fill('1 g <img src=x>');await page.getByRole('button',{name:'Find foods'}).click();await page.getByRole('button',{name:'Choose a match',exact:true}).waitFor();assert.equal(await page.locator('.text-log img').count(),0);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert.deepEqual(errors,[]);
 }finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
});
