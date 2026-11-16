import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFileSync} from 'node:fs';
import {chromium} from 'playwright-core';
import {initialState,previewDiaryItem} from '../server/domain/workspace.mjs';
import {libraryItem} from '../server/library-view.mjs';
import {photoMacros,photoNutritionSummary} from '../public/photo-nutrition.js';

test('photo summary keeps unknown macros unknown and formats account energy units',()=>{
 const known={energy:{value:418.4,unit:'kJ'},nutrition:{totals:{protein:10,carbs:20,fat:2}}};
 assert.match(photoMacros(known),/418.4 kJ/);
 assert.match(photoNutritionSummary([known,known]),/836.8 kJ/);
 assert.match(photoNutritionSummary([known,{...known,nutrition:{totals:{protein:null,carbs:0,fat:0}}}]),/— g/);
 assert.doesNotMatch(photoNutritionSummary([known,null]),/NaN|undefined/);
 assert.equal(photoNutritionSummary([]),'');
});

test('photo recognition flows into compact macros, editable amounts and discard-on-close',async()=>{
 const state=initialState(),day='2026-11-16';state.settings.groups=['Uncategorized','Lunch'];state.foods=[{id:'rice',name:'Fixture rice',serving:'100 g',grams:100,nutrients:{calories:200,protein:10,carbs:30,fat:4}}];
 const image='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=';
 let previews=0,analyses=0,failPreview=false;
 const analysis={photo:{id:'a'.repeat(64),dataUrl:image},reviewToken:'fixture',suggestions:[{kind:'observation',description:'Rice',observationIndex:0,portionEstimate:{grams:100},selection:{id:'rice',kind:'food'},candidates:[{ref:{id:'rice',kind:'food'},name:'Fixture rice',grams:100}]}]};
 const server=createServer(async(req,res)=>{try{
  const url=new URL(req.url,'http://fixture'),path=url.pathname;
  if(path==='/'){
   res.setHeader('Content-Type','text/html');res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; font-src 'self'");
   return res.end('<meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/mobile-theme.css"><link rel="stylesheet" href="/diary.css"><link rel="stylesheet" href="/photo-log.css"><body class="discover-mobile dark"><button id="open">Open photo log</button><dialog id="sheet"><div id="sheet-content"></div></dialog><script type="module" src="/fixture.js"></script>');
  }
  if(path==='/fixture.js'){res.setHeader('Content-Type','text/javascript');return res.end(`import {mountPhotoLog} from '/photo-log.js';const sheet=document.querySelector('#sheet'),content=document.querySelector('#sheet-content');window.saved=[];const close=()=>{sheet.close();content.replaceChildren()};document.querySelector('#open').onclick=()=>mountPhotoLog({show:html=>{content.innerHTML=html;sheet.showModal()},close,header:title=>'<header class="sheet-header"><button data-close>Close</button><h2>'+title+'</h2></header>',content,date:()=>'${day}',groups:['Uncategorized','Lunch'],save:async input=>{if(window.failSave){window.failSave=false;throw Error("Fixture save unavailable")}window.saved.push(input)}});content.onclick=e=>{if(e.target.closest('[data-close]'))close()};sheet.oncancel=e=>{e.preventDefault();close()};`);}
  if(path==='/api/photos/analyze'){analyses++;res.setHeader('Content-Type','application/json');return res.end(JSON.stringify(analysis));}
  if(path==='/api/diary/preview'){
   previews++;let raw='';for await(const chunk of req)raw+=chunk;
   if(failPreview){failPreview=false;res.writeHead(503,{'Content-Type':'application/json'});return res.end(JSON.stringify({error:'Fixture unavailable'}));}
   const result=previewDiaryItem(state,JSON.parse(raw));res.setHeader('Content-Type','application/json');return res.end(JSON.stringify({...result,energy:{value:result.nutrition.totals.calories,unit:'kcal'}}));
  }
  if(path==='/api/library/item'){res.setHeader('Content-Type','application/json');return res.end(JSON.stringify(libraryItem(state,'food',state.foods[0])));}
  if(!/^\/[a-zA-Z0-9/_.-]+\.(?:m?js|css|svg|woff2)$/.test(path)||path.includes('..'))return res.writeHead(404).end();
  res.setHeader('Content-Type',/\.m?js$/.test(path)?'text/javascript':path.endsWith('.css')?'text/css':path.endsWith('.svg')?'image/svg+xml':'font/woff2');res.end(readFileSync(new URL('../public'+path,import.meta.url)));
 }catch(error){res.writeHead(500,{'Content-Type':'application/json'}).end(JSON.stringify({error:error.message}));}});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let browser;
 try{
  browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});const page=await browser.newPage({viewport:{width:412,height:915}}),errors=[];page.setDefaultTimeout(10000);page.on('pageerror',error=>errors.push(error.message));page.on('console',message=>{if(message.text().includes('Content Security Policy'))errors.push(message.text());});
  await page.goto(`http://127.0.0.1:${server.address().port}`);await page.locator('#open').click();
  const upload=()=>page.locator('[data-photo-gallery]').setInputFiles({name:'meal.png',mimeType:'image/png',buffer:Buffer.from(image.split(',')[1],'base64')});
  await upload();await page.locator('.photo-macros').filter({hasText:'200 kcal'}).waitFor().catch(async error=>{console.log(JSON.stringify({errors,body:await page.locator('body').innerText(),previews}));throw error;});assert.equal(analyses,1);assert.equal(previews,1);assert.equal(await page.getByLabel('Group',{exact:true}).inputValue(),'Uncategorized');
  await page.locator('[data-quantity]').click();await page.getByRole('spinbutton',{name:'Amount',exact:true}).fill('50');await page.getByRole('button',{name:'Done',exact:true}).click();await page.locator('.photo-macros').filter({hasText:'100 kcal'}).waitFor();assert.equal(previews,2);
  await page.locator('[data-quantity]').click();await page.getByRole('button',{name:'Back',exact:true}).click();await page.locator('.photo-macros').filter({hasText:'100 kcal'}).waitFor();assert.equal(previews,2,'unchanged reviewed amount reuses preview');
  failPreview=true;await page.getByLabel('Group',{exact:true}).selectOption('Lunch');await page.getByRole('button',{name:'Retry nutrition'}).click();await page.locator('.photo-macros').filter({hasText:'100 kcal'}).waitFor();
  await page.getByRole('button',{name:'Create…',exact:true}).click();
  await page.getByRole('dialog',{name:'Create'}).waitFor();await page.getByLabel('Save to',{exact:true}).selectOption('recipe');await page.getByLabel('Recipe name',{exact:true}).fill('Rice bowl');await page.getByLabel('Servings',{exact:true}).fill('2');await page.keyboard.press('Escape');
  assert.equal(await page.getByRole('dialog',{name:'Create'}).count(),0);assert.equal(await page.evaluate(()=>window.saved.length),0);assert.equal(await page.getByLabel('Group',{exact:true}).inputValue(),'Lunch');
  await page.getByRole('button',{name:'Create…',exact:true}).click();await page.mouse.click(10,10);assert.equal(await page.getByRole('dialog',{name:'Create'}).count(),0);assert.equal(await page.evaluate(()=>window.saved.length),0);
  await page.screenshot({path:'.local/photo-compact-review.png'});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.getByRole('button',{name:'Add to diary',exact:true}).click();await page.locator('#sheet').waitFor({state:'hidden'});const saved=await page.evaluate(()=>window.saved);assert.equal(saved.length,1);assert.equal(saved[0].rows[0].quantity,50);assert.equal(saved[0].group,'Lunch');
  for(const kind of ['meal','recipe']){
   await page.locator('#open').click();await upload();await page.locator('.photo-macros').filter({hasText:'200 kcal'}).waitFor();await page.getByRole('button',{name:'Create…',exact:true}).click();await page.getByLabel('Save to',{exact:true}).selectOption(kind);await page.getByLabel(kind==='recipe'?'Recipe name':'Meal name',{exact:true}).fill('Rice bowl');if(kind==='recipe')await page.getByLabel('Servings',{exact:true}).fill('2');if(kind==='recipe'){await page.screenshot({path:'.local/photo-create-sheet.png'});await page.evaluate(()=>window.failSave=true);await page.getByRole('button',{name:'Create Recipe',exact:true}).click();await page.getByText('Fixture save unavailable',{exact:true}).waitFor();assert.equal(await page.getByLabel('Recipe name',{exact:true}).inputValue(),'Rice bowl');}
   await page.getByRole('button',{name:kind==='recipe'?'Create Recipe':'Create Meal',exact:true}).click();await page.locator('#sheet').waitFor({state:'hidden'});
   const created=await page.evaluate(()=>window.saved.at(-1));assert.deepEqual(created.destination,{kind,name:'Rice bowl',...(kind==='recipe'?{servings:2}:{})});assert.equal(created.rows[0].quantity,100);
  }
  await page.locator('#open').click();await upload();await page.locator('.photo-macros').filter({hasText:'200 kcal'}).waitFor();await page.getByRole('button',{name:'Close',exact:true}).click();await page.locator('#open').click();await page.getByRole('button',{name:'Choose photo',exact:true}).waitFor();assert.equal(await page.locator('.photo-thumb').count(),0);assert.equal(await page.evaluate(()=>window.saved.length),3);assert.deepEqual(errors,[]);
 }finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
});
