import {CHROME_EXECUTABLE} from './_chrome.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFileSync,existsSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {chromium} from 'playwright-core';
import {initialState,act} from '../server/domain/workspace.mjs';
import {coachView,coachAnswer,applyCoachCommand} from '../server/coach-view.mjs';
import {digest} from '../server/data-codec.mjs';

test('Coach phone UI shows recorded facts, preserves custom preferences, and ignores a response after closing',async()=>{
 const state=initialState(),day='2026-11-15',writes=[],requests=[];state.settings.coachPreferences={goals:'Custom goal',dietaryPreferences:'Vegetarian',notes:'Existing note'};
 act(state,'entry.add',{date:day,amount:1,name:'Meal',nutrients:{calories:200,protein:12}});
 let held=false,release;
 const root=resolve('public'),server=createServer(async(req,res)=>{try{
  const path=new URL(req.url,'http://localhost').pathname;
  if(path==='/'){res.setHeader('Content-Type','text/html');return res.end(`<meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/coach.css"><style>body{margin:0;background:#111322;color:#f4f4ff;font:16px system-ui}*{box-sizing:border-box}input,textarea,button{font:inherit;color:inherit;background:#252839;padding:.6rem;border:1px solid #555}</style><button id="exit">Close</button><div id="panel"></div><script type="module">import {openCoach} from '/coach.js';const content=document.querySelector('#panel');document.querySelector('#exit').onclick=()=>content.replaceChildren();openCoach({date:()=> '${day}',content,show:html=>content.innerHTML=html,header:title=>'<h1>'+title+'</h1>',close:()=>content.replaceChildren(),onReport:date=>document.body.dataset.report=date});</script>`);}
  if(path.startsWith('/api/')){requests.push(path);let raw='';for await(const chunk of req)raw+=chunk;const input=raw?JSON.parse(raw):null;res.setHeader('Content-Type','application/json');
   if(path==='/api/coach/preferences')return res.end(JSON.stringify(coachView(state)));
   if(path==='/api/coach/answer'){if(held)await new Promise(resolve=>{release=resolve;});return res.end(JSON.stringify(coachAnswer(state,input)));}
   if(path==='/api/workspace/command'){writes.push(input);assert.equal(input.revision,digest(state));applyCoachCommand(state,input);return res.end(JSON.stringify({ok:true,revision:digest(state)}));}
   throw Error('Unexpected API request '+path);
  }
  const file=resolve(root,'.'+path);if(!file.startsWith(root+'/')&&!file.startsWith(root+'\\')||!existsSync(file)){res.writeHead(404).end();return;}res.setHeader('Content-Type',file.endsWith('.css')?'text/css':'text/javascript');res.end(readFileSync(file));
 }catch(error){res.writeHead(error.code??500).end(JSON.stringify({error:error.message}));}});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let browser;
 try{
  browser=await chromium.launch({executablePath:CHROME_EXECUTABLE,headless:true});const page=await browser.newPage({viewport:{width:412,height:915}});page.setDefaultTimeout(10000);const errors=[];page.on('pageerror',error=>errors.push(error.message));await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page.getByRole('heading',{name:'Protein',exact:true}).waitFor();assert.equal(await page.locator('.coach-preferences').count(),0);assert.equal(await page.locator('.coach-details').getAttribute('open'),null);assert.equal(writes.length,0);
  await page.getByRole('button',{name:'Protein',exact:true}).click();await page.waitForFunction(()=>document.querySelectorAll('.coach-results article').length===1);assert.equal(await page.locator('.coach-value').textContent(),'12 g');
  await page.getByText('Goals & preferences',{exact:true}).click();await page.getByRole('button',{name:'Strength',exact:true}).click();await page.getByLabel('Notes',{exact:true}).fill('Updated note');await page.getByRole('button',{name:'Save',exact:true}).click();await page.locator('[data-coach-edit]').waitFor();await page.waitForFunction(()=>!document.querySelector('[data-coach-edit]').disabled);assert.equal(writes.length,1);assert.equal(state.settings.coachPreferences.goals,'Custom goal, Strength');assert.equal(state.settings.coachPreferences.dietaryPreferences,'Vegetarian');assert.equal(state.settings.targets.protein,100);
  await page.getByRole('button',{name:'Overview',exact:true}).click();await page.getByRole('heading',{name:'Energy balance'}).waitFor();assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);mkdirSync('.local',{recursive:true});await page.screenshot({path:'.local/coach-mobile.png',fullPage:true});
  held=true;await page.getByRole('button',{name:'Water',exact:true}).click();await page.waitForFunction(()=>document.querySelector('[data-question="Water"]').disabled);await page.getByRole('button',{name:'Close',exact:true}).click();while(!release)await new Promise(resolve=>setTimeout(resolve,5));release();await page.waitForTimeout(50);assert.equal(await page.locator('#panel').textContent(),'');assert.deepEqual(errors,[]);assert.ok(requests.every(path=>['/api/coach/preferences','/api/coach/answer','/api/workspace/command'].includes(path)));
 }finally{release?.();await browser?.close();await new Promise(resolve=>server.close(resolve));}
});
