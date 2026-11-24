import {CHROME_EXECUTABLE} from './_chrome.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFileSync,mkdirSync} from 'node:fs';
import {chromium} from 'playwright-core';
import {createInsightCatalog} from '../server/food-insights.mjs';
import {searchCloudFoods,readCloudFoodSearchQuery} from '../server/food-search.mjs';
import {initialState} from '../server/domain/workspace.mjs';
test('source food search categories, options, debounce, paging and child selection work in a mobile browser',async()=>{
 const state=initialState(),foods=Array.from({length:62},(_,i)=>({id:`usda:sr-legacy-2018-04:${i+1}`,name:i===0?'Apple juice':i===1?'Coffee':`Oats ${String(i).padStart(2,'0')}`,serving:'100 g',grams:100,nutrients:{calories:100},source:{name:'USDA',datasetId:'sr-legacy-2018-04',dataset:'USDA SR Legacy',fdcId:i+1},category:{id:'usda-category:14',name:'Beverages'}}));
 state.foods=[{id:'custom',name:'My Apple',serving:'1 bowl',grams:100,nutrients:{calories:150}}];state.recipes=[{id:'recipe',name:'My recipe',ingredients:[{foodId:'custom',amount:1}]}];state.meals=[{id:'meal',name:'My meal',items:[]}];state.settings.favorites=[{kind:'food',id:'custom'}];
 const catalog=createInsightCatalog(foods,{metadata:{datasets:[{id:'sr-legacy-2018-04',name:'USDA SR Legacy',foodCount:62}]}}),queries=[];
 const detailPages=[];let releaseFirst;
 const firstRead=new Promise(resolve=>{releaseFirst=resolve;});
 const server=createServer(async(req,res)=>{try{const url=new URL(req.url,'http://localhost'),path=url.pathname;
  if(path==='/api/catalog/food-details'){
   const ids=url.searchParams.getAll('id');detailPages.push(ids);
   if(detailPages.length===1)await firstRead;
   res.setHeader('Content-Type','application/json');return res.end(JSON.stringify({foods:foods.filter(row=>ids.includes(row.id))}));
  }
  if(path==='/api/branded/search'){res.setHeader('Content-Type','application/json');return res.end(JSON.stringify({items:[{fdcId:2345678,barcode:'602652170003',name:'KIND Almond Bar',brands:'KIND',provider:'usda-branded',source:'USDA Branded Foods'}],nextPage:null}));}
  if(path==='/api/food-search'){queries.push(url.search);const result=searchCloudFoods(state,catalog,readCloudFoodSearchQuery(url.searchParams));if(url.searchParams.get('q')==='apple')await new Promise(resolve=>setTimeout(resolve,600));res.setHeader('Content-Type','application/json');return res.end(JSON.stringify(result));}
  if(path==='/'){res.setHeader('Content-Type','text/html');return res.end(`<html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/mobile-theme.css"><link rel="stylesheet" href="/diary.css"><link rel="stylesheet" href="/app-shell.css"><link rel="stylesheet" href="/food-search-source/mobile-food-search.css"></head><body class="discover-mobile dark"><dialog id="sheet" open><div id="sheet-content"><header class="sheet-header"><button data-close>Close</button><h2>Add Food</h2></header><div id="picker"></div></div></dialog><script type="module">import {mountFoodPicker} from '/food-picker.js';window.mount=(options={})=>{window.cleanup?.();window.cleanup=mountFoodPicker(document.querySelector('#picker'),{onPick:(kind,id,meta)=>window.picked={kind,id,meta},onBarcode:()=>window.scanned=true,...options});};window.mount();document.querySelector('[data-close]').onclick=()=>{window.closed=true;window.cleanup();};</script></body></html>`);}
  if(!/^\/[a-zA-Z0-9/_.-]+\.(?:js|mjs|css|woff2)$/.test(path)||path.includes('..'))return res.writeHead(404).end();res.setHeader('Content-Type',path.endsWith('.css')?'text/css':path.endsWith('.woff2')?'font/woff2':'text/javascript');res.end(readFileSync(new URL('../public'+path,import.meta.url)));
 }catch(error){res.writeHead(400,{'Content-Type':'application/json'}).end(JSON.stringify({error:error.message}));}});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let browser;
 try{browser=await chromium.launch({executablePath:CHROME_EXECUTABLE,headless:true});const page=await browser.newPage({viewport:{width:412,height:915}}),errors=[];page.on('pageerror',error=>errors.push(error.message));page.setDefaultTimeout(10000);await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page.locator('.mfs-result').first().waitFor();assert.equal(await page.locator('[data-mfs-category]').count(),8);assert.equal(await page.locator('.sheet-header').isVisible(),false);assert.equal(await page.locator('[data-id="usda:sr-legacy-2018-04:1"] .mfs-source').textContent(),'USDA');assert.equal(await page.locator('[data-mfs-multi]').count(),0);
  await page.getByRole('button',{name:/Apple juice/}).click();assert.deepEqual(await page.evaluate(()=>window.picked),{kind:'food',id:foods[0].id,meta:{source:'catalog'}});
  await page.locator('[data-mfs=options]').click();await page.getByRole('dialog',{name:'Food Search Options'}).waitFor();assert.equal(await page.locator('.mfs-content').evaluate(node=>node.inert),true);await page.keyboard.press('Escape');assert.equal(await page.locator('.mfs-overlay').isVisible(),false);assert.equal(await page.evaluate(()=>window.closed??false),false);
  await page.locator('[data-mfs=options]').click();await page.locator('.mfs-overlay').click({position:{x:405,y:400}});assert.equal(await page.locator('.mfs-overlay').isVisible(),false);
  await page.locator('[data-mfs-category=favorites]').click();await page.getByRole('button',{name:/My Apple/}).waitFor();assert.equal(await page.locator('.mfs-result').count(),1);await page.locator('.mfs-result').click();assert.deepEqual(await page.evaluate(()=>window.picked),{kind:'food',id:'custom',meta:{source:'library'}});
  await page.locator('[data-mfs-category=custom]').click();await page.getByText('Custom Recipe',{exact:true}).waitFor();await page.getByRole('button',{name:/My recipe/}).click();assert.equal((await page.evaluate(()=>window.picked)).kind,'recipe');
  await page.locator('[data-mfs-category=all]').click();await page.locator('[data-mfs=sort]').click();await page.locator('[data-mfs-sort-option=za]').click();await page.getByRole('button',{name:/Oats 61/}).waitFor();assert.match(await page.locator('.mfs-result').first().textContent(),/Oats 61/);
  await page.locator('[data-mfs=options]').click();await page.locator('[data-mfs-database=custom]').click();await page.getByRole('button',{name:'Close',exact:true}).last().click();await page.getByRole('button',{name:/My recipe/}).waitFor();assert.equal(await page.locator('.mfs-result').count(),3);
  await page.locator('[data-mfs=options]').click();await page.locator('[data-mfs-database=""]').click();await page.locator('[data-mfs-sort-option=best]').click();const input=page.getByRole('searchbox');await input.fill('apple');await page.waitForRequest(request=>request.url().includes('q=apple'));await input.fill('cof');await page.getByRole('button',{name:/Coffee/}).waitFor();await page.waitForTimeout(650);assert.equal(await page.locator('.mfs-result').count(),1);assert.match(await page.locator('.mfs-result').textContent(),/Coffee/);
  const clear=page.getByRole('button',{name:'Clear search',exact:true});
  await input.blur();
  assert.ok(await clear.isVisible(),'a populated query can be cleared when the search field is unfocused');
  await clear.click();
  assert.equal(await input.inputValue(),'');
  assert.equal(await input.evaluate(node=>node===document.activeElement),true);
  assert.equal(await clear.isVisible(),false);
  await page.getByRole('button',{name:/Apple juice/}).waitFor();await page.locator('.mfs-more').scrollIntoViewIfNeeded();await page.waitForFunction(()=>document.querySelectorAll('.mfs-result').length>25);assert.equal(queries.some(q=>q.includes('offset=25')),true);
  await page.evaluate(()=>window.mount({allowMeals:false,allowRecipes:false}));await page.locator('[data-mfs-category=custom]').click();await page.getByRole('button',{name:/My Apple/}).waitFor();assert.equal(await page.locator('.mfs-result').count(),1);
  await page.locator('[data-mfs=scan]').click();assert.equal(await page.evaluate(()=>window.scanned),true);
  await page.locator('[data-mfs=options]').click();await page.getByRole('checkbox',{name:'Category Tabs',exact:true}).uncheck();await page.keyboard.press('Escape');assert.equal(await page.locator('.mfs-tabs').isVisible(),false);await page.evaluate(()=>window.mount());await page.locator('.mfs-result').first().waitFor();assert.equal(await page.locator('.mfs-tabs').isVisible(),false);
  await page.locator('[data-mfs=options]').click();await page.getByRole('checkbox',{name:'Category Tabs',exact:true}).check();await page.keyboard.press('Escape');await page.locator('[data-mfs-category=all]').click();await page.locator('.mfs-result').first().waitFor();assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await page.evaluate(()=>{window.realSetItem=Storage.prototype.setItem;Storage.prototype.setItem=()=>{throw new DOMException('Storage disabled','SecurityError');};});
  await page.locator('[data-mfs=sort]').click();await page.locator('[data-mfs-sort-option=az]').click();await page.getByRole('status').filter({hasText:'Search options could not be saved.'}).waitFor();await page.locator('.mfs-result').first().waitFor();await page.evaluate(()=>{Storage.prototype.setItem=window.realSetItem;});
  if(process.env.FOOD_SEARCH_SCREENSHOTS){mkdirSync('.local/food-search-restoration',{recursive:true});await page.evaluate(()=>document.querySelector('#sheet').scrollTop=0);await page.screenshot({path:'.local/food-search-restoration/search.png'});await page.locator('[data-mfs=options]').click();await page.screenshot({path:'.local/food-search-restoration/options.png'});}
  const started=page.waitForRequest(r=>r.url().includes('/api/catalog/food-details?'));
  await page.evaluate(()=>window.mount({prepareCatalogDetails:true,onPick:async(_,id,meta)=>{window.openedFood=(await meta.catalogFood)?.id;}}));
  await started;
  await input.fill('oats 59');
  await page.getByRole('button',{name:/Oats 59/}).waitFor();
  await input.fill('oats 60');
  await page.getByRole('button',{name:/Oats 60/}).click();
  assert.equal(detailPages.length,1,'Slow reads do not start a request for every settled query');
  releaseFirst();
  await page.waitForFunction(id=>window.openedFood===id,foods[60].id);
  assert.deepEqual(detailPages[1],[foods[59].id,foods[60].id]);
  assert.equal(detailPages.length,2);
  await page.evaluate(()=>window.mount({onBrandedPick:(target)=>{window.brandedPicked=target;}}));
  await page.locator('[data-mfs-category=brands]').click();
  await input.fill('kind');
  await page.locator('.mfs-branded-item').first().waitFor();
  await page.locator('.mfs-branded-item').first().click();
  assert.deepEqual(await page.evaluate(()=>window.brandedPicked),{fdcId:2345678});
  assert.deepEqual(errors,[]);
 }finally{releaseFirst();await browser?.close();catalog.disposeSearch();await new Promise(resolve=>server.close(resolve));}
});
