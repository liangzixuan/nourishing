import {CHROME_EXECUTABLE} from './_chrome.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFileSync} from 'node:fs';
import {chromium} from 'playwright-core';
import {initialState,previewDiaryItem} from '../server/domain/workspace.mjs';
import {libraryItem} from '../server/library-view.mjs';
import {photoMacros,photoNutritionSummary,previewPhotoFood} from '../public/photo-nutrition.js';

test('photo summary keeps unknown macros unknown and formats account energy units',()=>{
 const known={energy:{value:418.4,unit:'kJ'},nutrition:{totals:{protein:10,carbs:20,fat:2}}};
 assert.match(photoMacros(known),/418.4 kJ/);
 assert.match(photoNutritionSummary([known,known]),/836.8 kJ/);
 assert.match(photoNutritionSummary([known,{...known,nutrition:{totals:{protein:null,carbs:0,fat:0}}}]),/— g/);
 assert.doesNotMatch(photoNutritionSummary([known,null]),/NaN|undefined/);
 assert.equal(photoNutritionSummary([]),'');
});

test('photo portions and the review use complete net measurements under the saved definition',()=>{
 const state=initialState();
 state.settings.carbohydratePolicy={mode:'total',netExcluded:['fiber','sugarAlcohol']};
 const food={id:'oats',name:'Oats',serving:'100 g',grams:100,portions:[{id:'cup',label:'cup',grams:150}],nutrients:{calories:200,protein:8,carbs:34,fiber:7,sugarAlcohol:2,fat:3}};
 state.foods=[food];
 const preview=quantity=>previewPhotoFood(libraryItem(state,'food',food),quantity);
 const one=preview({amount:1}),half=preview({quantity:50,unit:'g'}),cup=preview({quantity:1,unit:'portion',portionId:'cup'});
 assert.deepEqual([one,half,cup].map(row=>row.nutrition.carbohydrates.net.value),[25,12.5,37.5]);
 assert.equal(cup.nutrition.entries[0].grams,150);
 assert.match(photoMacros(one),/34 g Carbs/);
 assert.match(photoNutritionSummary([one,half]),/Net Carbs<\/dt><dd>37.5 g<\/dd><dd class="photo-macro-percent">62.9%/);
 assert.match(photoNutritionSummary([one],'total'),/Carbs<\/dt><dd>34 g/);
 const unknown=rows=>{
  const html=photoNutritionSummary(rows);
  assert.match(html,/Net Carbs<\/dt><dd>— g/);
  assert.doesNotMatch(html,/stroke-dasharray/);
 };
 delete food.nutrients.sugarAlcohol;
 unknown([one,preview({amount:1})]);
 unknown([{...one,nutrition:{...one.nutrition,carbohydrates:{net:{value:25,coverage:{complete:false}}}}}]);
 delete state.settings.carbohydratePolicy;
 unknown([preview({amount:1})]);
 state.settings.carbohydratePolicy={mode:'net',netExcluded:[]};
 assert.equal(preview({amount:1}).nutrition.carbohydrates.net.value,34);
 food.nutrients.carbs=0;
 assert.match(photoNutritionSummary([preview({amount:1})]),/Net Carbs<\/dt><dd>0 g<\/dd><dd class="photo-macro-percent">0%/);
});

test('photo recognition flows into compact macros, editable amounts and discard-on-close',async()=>{
 const state=initialState(),day='2026-11-16';state.settings.groups=['Uncategorized','Lunch'];state.foods=[{id:'rice',name:'Fixture rice',serving:'100 g',grams:100,portions:[{id:'cup',label:'cup',grams:150}],nutrients:{calories:200,protein:10,carbs:30,fiber:6,sugarAlcohol:2,fat:4}}];
 state.settings.carbohydratePolicy={mode:'net',netExcluded:['fiber','sugarAlcohol']};
 const image='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=';
 let previews=0,analyses=0,failPreview=false;
 const analysis={photo:{id:'a'.repeat(64),dataUrl:image},reviewToken:'fixture',suggestions:[{kind:'observation',description:'Rice',observationIndex:0,portionEstimate:{grams:100},selection:{id:'rice',kind:'food'},candidates:[{ref:{id:'rice',kind:'food'},name:'Fixture rice',grams:100}]}]};
 analysis.suggestions.push({kind:'possible-addition',description:'Extra rice',additionIndex:0,portionEstimate:{grams:20},selection:null,candidates:[]});
 const server=createServer(async(req,res)=>{try{
  const url=new URL(req.url,'http://fixture'),path=url.pathname;
  if(path==='/'){
   res.setHeader('Content-Type','text/html');res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; font-src 'self'");
   return res.end('<meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/mobile-theme.css"><link rel="stylesheet" href="/diary.css"><link rel="stylesheet" href="/photo-log.css"><body class="discover-mobile dark"><button id="open">Open photo log</button><dialog id="sheet"><div id="sheet-content"></div></dialog><script type="module" src="/fixture.js"></script>');
  }
  if(path==='/fixture.js'){res.setHeader('Content-Type','text/javascript');return res.end(`import {mountPhotoLog} from '/photo-log.js';import {initializeDeviceCache} from '/device-cache.js';await initializeDeviceCache('fixture');const sheet=document.querySelector('#sheet'),content=document.querySelector('#sheet-content');window.saved=[];const close=()=>{sheet.close();content.replaceChildren()};document.querySelector('#open').onclick=()=>mountPhotoLog({show:html=>{content.innerHTML=html;sheet.showModal()},close,header:title=>'<header class="sheet-header"><button data-close>Close</button><h2>'+title+'</h2></header>',content,date:()=>'${day}',groups:['Uncategorized','Lunch'],initialGroup:window.initialGroup,...(window.optimistic?{onOptimisticSave:async value=>window.optimisticSaved=value}:{}),save:async input=>{if(window.failSave){window.failSave=false;throw Error("Fixture save unavailable")}window.saved.push(input)}});content.onclick=e=>{if(e.target.closest('[data-close]'))close()};sheet.oncancel=e=>{e.preventDefault();close()};`);}
  if(path==='/api/library/favorites'){res.setHeader('Content-Type','application/json');return res.end(JSON.stringify({items:[],revision:'fixture'}));}
  if(path==='/api/photos/analyze'){analyses++;res.setHeader('Content-Type','application/json');return res.end(JSON.stringify(analysis));}
  if(path==='/api/diary/preview'){
   previews++;let raw='';for await(const chunk of req)raw+=chunk;
   if(failPreview){failPreview=false;res.writeHead(503,{'Content-Type':'application/json'});return res.end(JSON.stringify({error:'Fixture unavailable'}));}
   const result=previewDiaryItem(state,JSON.parse(raw));res.setHeader('Content-Type','application/json');return res.end(JSON.stringify({...result,energy:{value:result.nutrition.totals.calories,unit:'kcal'}}));
  }
  if(path==='/api/food-search'){res.setHeader('Content-Type','application/json');return res.end(JSON.stringify({items:[{id:'rice',kind:'foods',sourceType:'custom',name:'Fixture rice',serving:'100 g'}],databases:[],offset:0,total:1,nextOffset:null}));}
  if(path==='/api/library/item'){res.setHeader('Content-Type','application/json');return res.end(JSON.stringify(libraryItem(state,'food',state.foods[0])));}
  if(!/^\/[a-zA-Z0-9/_.-]+\.(?:m?js|css|svg|woff2)$/.test(path)||path.includes('..'))return res.writeHead(404).end();
  res.setHeader('Content-Type',/\.m?js$/.test(path)?'text/javascript':path.endsWith('.css')?'text/css':path.endsWith('.svg')?'image/svg+xml':'font/woff2');res.end(readFileSync(new URL('../public'+path,import.meta.url)));
 }catch(error){res.writeHead(500,{'Content-Type':'application/json'}).end(JSON.stringify({error:error.message}));}});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let browser;
 try{
  browser=await chromium.launch({executablePath:CHROME_EXECUTABLE,headless:true});const page=await browser.newPage({viewport:{width:412,height:915}}),errors=[];page.setDefaultTimeout(10000);page.on('pageerror',error=>errors.push(error.message));page.on('console',message=>{if(message.text().includes('Content Security Policy'))errors.push(message.text());});
  await page.goto(`http://127.0.0.1:${server.address().port}`);await page.locator('#open').click();
  const upload=()=>page.locator('[data-photo-gallery]').setInputFiles({name:'meal.png',mimeType:'image/png',buffer:Buffer.from(image.split(',')[1],'base64')});
  await upload();await page.locator('.photo-macros').filter({hasText:'200 kcal'}).waitFor().catch(async error=>{console.log(JSON.stringify({errors,body:await page.locator('body').innerText(),previews}));throw error;});assert.equal(analyses,1);assert.equal(previews,0);assert.equal(await page.getByLabel('Group',{exact:true}).inputValue(),'Uncategorized');
  const netAmount=page.locator('.photo-log-body .photo-energy dl div').filter({hasText:'Net Carbs'}).locator('dd').first();
  await netAmount.filter({hasText:'22 g'}).waitFor();assert.match(await page.locator('[data-macros]').innerText(),/30 g Carbs/);
  await page.locator('.photo-food-main strong').first().click();assert.equal(await page.locator('.photo-thumb').isVisible(),true);await page.getByRole('spinbutton',{name:'Amount',exact:true}).fill('50');await page.locator('.photo-portion-sheet').getByText('100 kcal',{exact:true}).first().waitFor();assert.equal(previews,0);assert.equal(await page.getByRole('combobox',{name:'Serving Size',exact:true}).count(),1);await page.locator('.photo-portion-sheet [data-favorite-id]').click();await page.locator('.photo-portion-sheet [data-favorite-id][aria-pressed=true]').waitFor();assert.match(await page.locator('.photo-macro-percent').first().innerText(),/%/);await page.screenshot({path:'.local/photo-portion-sheet.png'});await page.getByRole('button',{name:'Save',exact:true}).click();await page.locator('.photo-macros').filter({hasText:'100 kcal'}).waitFor();assert.equal(previews,0);
  await page.locator('[data-macros]').first().click();await page.getByRole('button',{name:'Cancel',exact:true}).click();await page.locator('.photo-macros').filter({hasText:'100 kcal'}).waitFor();assert.equal(previews,0,'unchanged reviewed amount reuses preview');
  await page.locator('[data-quantity]').click({position:{x:5,y:5}});await page.getByRole('spinbutton',{name:'Amount',exact:true}).fill('');assert.equal(await page.getByRole('button',{name:'Save',exact:true}).isEnabled(),false);await page.mouse.click(10,10);assert.equal(await page.locator('[data-save]').isEnabled(),true);
  await page.locator('[data-quantity]').focus();await page.keyboard.press('Enter');await page.keyboard.press('Escape');assert.equal(await page.locator('[data-save]').isEnabled(),true);
  assert.equal(await page.locator('[data-replace] svg').count(),1);await page.locator('.photo-thumb [data-gallery]').click();assert.equal(await page.getByRole('button',{name:'Take New Photo',exact:true}).isVisible(),true);assert.equal(await page.getByRole('button',{name:'Upload New Photo',exact:true}).isVisible(),true);await page.keyboard.press('Escape');
  // Cancelling a suggested addition must not leave an unmatched row blocking save.
  await page.locator('[data-addition]').click();await page.locator('[data-back]').click();assert.equal(await page.locator('[data-save]').isEnabled(),true);assert.equal(await page.locator('.photo-food-row').count(),1);
  await page.locator('[data-addition]').click();await page.locator('.mfs-result').click();await page.getByRole('spinbutton',{name:'Amount',exact:true}).fill('25');await page.getByRole('button',{name:'Cancel',exact:true}).click();assert.equal(await page.locator('[data-save]').isEnabled(),true);assert.equal(await page.locator('.photo-food-row').count(),1);
  await page.locator('[data-replace="0"]').click();await page.getByRole('menuitem',{name:'Fixture rice'}).click();await page.getByRole('button',{name:'Cancel',exact:true}).click();
  await page.locator('[data-replace="0"]').click();await page.screenshot({path:'.local/photo-swap.png'});await page.getByRole('menuitem',{name:'Search for more'}).click();await page.locator('.mfs-result').click();await page.getByRole('button',{name:'Cancel',exact:true}).click();assert.equal(await page.locator('[data-save]').isEnabled(),true);assert.match(await page.locator('[data-quantity="0"]').textContent(),/50/);
  await page.locator('[data-addition]').click();await page.locator('.mfs-result').click();await page.getByRole('button',{name:'Save',exact:true}).click();assert.equal(await page.locator('[data-save]').isEnabled(),true);assert.equal(await page.locator('.photo-food-row').count(),2);assert.equal(await page.locator('[data-addition]').count(),0);
  await netAmount.filter({hasText:'15.4 g'}).waitFor();
  await page.locator('.photo-log-body .photo-nutrition-summary summary').click();
  await page.screenshot({path:'.local/photo-suggestion-undo.png'});await page.locator('[data-undo-addition]').click();
  await netAmount.filter({hasText:'11 g'}).waitFor({state:'attached'});
  assert.equal(await page.locator('.photo-food-row').count(),1);assert.equal(await page.locator('[data-optional-quantity]').count(),1);
  await page.locator('[data-addition]').click();assert.equal(await page.locator('.photo-food-row').count(),2);assert.equal(await page.locator('.photo-log-body .photo-nutrition-summary').evaluate(node=>node.open),false);
  await page.locator('[data-dismiss-addition]').click();assert.equal(await page.locator('[data-undo-addition]').count(),0);
  await page.getByLabel('Group',{exact:true}).selectOption('Lunch');await page.locator('.photo-macros').filter({hasText:'100 kcal'}).waitFor();
  await page.getByRole('button',{name:'Create',exact:true}).click();
  const createSheet=page.getByRole('dialog',{name:'Create',exact:true});
  assert.equal(await createSheet.locator('button>svg[aria-hidden=true]').count(),2);
  await page.evaluate(()=>history.back());await createSheet.waitFor({state:'detached'});assert.equal(await page.locator('[data-create]').evaluate(n=>n===document.activeElement),true);
  const photoButton=page.locator('.photo-thumb [data-gallery]');await photoButton.click();
  const photoSheet=page.locator('.photo-action-menu');assert.deepEqual(await photoSheet.getByRole('button').allTextContents(),['Take New Photo','Upload New Photo']);
  assert.equal(await photoSheet.locator('img[alt=""],svg[aria-hidden=true]').count(),2);
  const picker=page.waitForEvent('filechooser');await photoSheet.getByRole('button',{name:'Upload New Photo'}).click();assert.ok(await (await picker).element().evaluate(input=>input.hasAttribute('data-photo-gallery')));
  await page.locator('[data-create]').click();
  await page.getByRole('dialog',{name:'Create'}).waitFor();await page.getByRole('button',{name:'Create Recipe',exact:true}).click();await page.getByLabel('Recipe Name',{exact:true}).fill('Rice bowl');await page.getByLabel('Servings',{exact:true}).fill('2');await page.keyboard.press('Escape');
  assert.equal(await page.getByRole('dialog',{name:'Create'}).count(),0);assert.equal(await page.evaluate(()=>window.saved.length),0);assert.equal(await page.getByLabel('Group',{exact:true}).inputValue(),'Lunch');
  await page.getByRole('button',{name:'Create',exact:true}).click();await page.mouse.click(10,10);assert.equal(await page.getByRole('dialog',{name:'Create'}).count(),0);assert.equal(await page.evaluate(()=>window.saved.length),0);
  await page.screenshot({path:'.local/photo-compact-review.png'});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.getByRole('button',{name:'Add to diary',exact:true}).click();await page.locator('#sheet').waitFor({state:'hidden'});const saved=await page.evaluate(()=>window.saved);assert.equal(saved.length,1);assert.equal(saved[0].rows[0].quantity,50);assert.equal(saved[0].group,'Lunch');assert.equal(saved[0].rows.length,2);assert.deepEqual(saved[0].rows[1],{foodId:'rice',additionIndex:0,quantity:20,unit:'g'});
  analysis.suggestions[1]={...analysis.suggestions[1],selection:{id:'rice',kind:'food'},candidates:analysis.suggestions[0].candidates};
  for(const kind of ['meal','recipe']){
   await page.locator('#open').click();await upload();await page.locator('[data-macros]').filter({hasText:'200 kcal'}).waitFor();await page.locator('[data-optional-macros]').filter({hasText:'40 kcal'}).waitFor();await page.locator('[data-optional-quantity]').click();await page.getByRole('spinbutton',{name:'Amount',exact:true}).fill('30');await page.getByRole('button',{name:'Save',exact:true}).click();assert.equal(await page.locator('.photo-food-row').count(),1);await page.locator('[data-optional-macros]').filter({hasText:'60 kcal'}).waitFor();await page.getByRole('button',{name:'Create',exact:true}).click();await page.getByRole('button',{name:kind==='recipe'?'Create Recipe':'Create Meal',exact:true}).click();await page.getByLabel(kind==='recipe'?'Recipe Name':'Meal Name',{exact:true}).fill('Rice bowl');if(kind==='recipe')await page.getByLabel('Servings',{exact:true}).fill('2');if(kind==='recipe'){await page.screenshot({path:'.local/photo-create-sheet.png'});await page.evaluate(()=>window.failSave=true);await page.getByRole('button',{name:'Create Recipe',exact:true}).click();await page.getByText('Fixture save unavailable',{exact:true}).waitFor();assert.equal(await page.getByLabel('Recipe Name',{exact:true}).inputValue(),'Rice bowl');}
   await page.getByRole('button',{name:kind==='recipe'?'Create Recipe':'Create Meal',exact:true}).click();await page.locator('#sheet').waitFor({state:'hidden'});
   const created=await page.evaluate(()=>window.saved.at(-1));assert.deepEqual(created.destination,{kind,name:'Rice bowl',...(kind==='recipe'?{servings:2}:{})});assert.equal(created.rows[0].quantity,100);
  }
  await page.evaluate(()=>window.initialGroup='Lunch');await page.locator('#open').click();await upload();await page.locator('.photo-macros').filter({hasText:'200 kcal'}).waitFor();assert.equal(await page.getByLabel('Group',{exact:true}).inputValue(),'Lunch');await page.getByRole('button',{name:'Close',exact:true}).click();await page.locator('#open').click();await page.getByRole('button',{name:'Choose photo',exact:true}).waitFor();assert.equal(await page.locator('.photo-thumb').count(),0);assert.equal(await page.evaluate(()=>window.saved.length),3);await page.getByRole('button',{name:'Close',exact:true}).click();
  await page.evaluate(()=>window.optimistic=true);await page.locator('#open').click();await upload();await page.locator('[data-quantity]').click();await page.locator('.photo-portion-sheet [name=unit]').selectOption('portion:cup');await page.getByRole('spinbutton',{name:'Amount',exact:true}).fill('2');await page.locator('.photo-portion-sheet').getByText('600 kcal',{exact:true}).waitFor();await page.getByRole('button',{name:'Save',exact:true}).click();await page.getByRole('button',{name:'Add to diary',exact:true}).click();await page.locator('#sheet').waitFor({state:'hidden'});const optimistic=await page.evaluate(()=>window.optimisticSaved);assert.equal(optimistic.payload.rows[0].portionId,'cup');assert.equal(optimistic.rows[0].portionId,'cup');assert.deepEqual(optimistic.rows[0].food,state.foods[0]);assert.equal(optimistic.rows[0].preview.nutrition.totals.calories,600);
  await page.locator('#open').click();await upload();await page.locator('[data-save]:not(:disabled)').waitFor();await page.getByRole('button',{name:'Add to diary',exact:true}).click();await page.locator('#sheet').waitFor({state:'hidden'});const untouched=await page.evaluate(()=>window.optimisticSaved);assert.deepEqual(untouched.rows[0].food,state.foods[0]);assert.equal(untouched.rows[0].preview.nutrition.totals.calories,200);assert.equal(previews,0);assert.deepEqual(errors,[]);
  const observed=analysis.suggestions[0],optional=analysis.suggestions[1];
  analysis.suggestions=[...Array.from({length:16},(_,observationIndex)=>({...observed,observationIndex})),optional];
  await page.locator('#open').click();await upload();
  const thumb=page.locator('.photo-thumb'),add=page.locator('[data-addition]');
  await thumb.waitFor();
  const bounds=()=>page.evaluate(()=>{
   const rect=selector=>document.querySelector(selector).getBoundingClientRect();
   return {title:rect('.sheet-header').top,thumbnail:rect('.photo-thumb').top,footer:rect('.photo-log-actions').bottom,scroll:document.querySelector('#sheet').scrollTop};
  });
  const atTop=await bounds();
  const pinned=async()=>{
   const moved=await bounds();
   assert.ok(moved.scroll>500,'The long food list scrolled');
   for(const part of ['title','thumbnail','footer'])assert.ok(Math.abs(moved[part]-atTop[part])<2,`${part} moved from ${atTop[part]} to ${moved[part]}`);
  };
  await add.scrollIntoViewIfNeeded();await pinned();
  await add.click();await page.locator('[data-undo-addition]').waitFor();await pinned();
  await thumb.locator('[data-gallery]').click();await page.locator('.photo-action-menu').waitFor();
  await page.keyboard.press('Escape');await page.locator('.photo-action-menu').waitFor({state:'detached'});await pinned();
  await page.locator('[data-quantity="15"]').click();await page.locator('.photo-portion-sheet [data-cancel]').first().click();
  await page.locator('.photo-portion-sheet').waitFor({state:'detached'});await pinned();
 }finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
});
