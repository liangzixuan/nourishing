import {CHROME_EXECUTABLE} from './_chrome.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFileSync,existsSync} from 'node:fs';
import {resolve,extname} from 'node:path';
import {chromium} from 'playwright-core';
import {initialState,act} from '../server/domain/workspace.mjs';
import {digest} from '../server/data-codec.mjs';
import {libraryView} from '../server/library-view.mjs';
import {applyWorkspaceCommand,captureActionFoods} from '../server/workspace-commands.mjs';
import {createInsightCatalog} from '../server/food-insights.mjs';
import {searchCloudFoods,readCloudFoodSearchQuery} from '../server/food-search.mjs';
import {favoriteView} from '../server/library-extras.mjs';

test('favorites preserve catalog identity and library filtering through source menus and pickers',async()=>{
 const state=initialState(),food=act(state,'food.save',{name:'Rice',serving:'100 g',grams:100,nutrients:{calories:130}}).id;act(state,'favorite.set',{kind:'food',id:food,enabled:true});
 const catalogFood={id:'usda:fixture:7',name:'Catalog beans',serving:'100 g',grams:100,nutrients:{calories:110},readOnly:true,sample:false,source:{name:'USDA fixture',datasetId:'fixture',fdcId:7}};
 const catalog=createInsightCatalog([catalogFood],{metadata:{datasets:[{id:'fixture',name:'USDA fixture',foodCount:1}]}});
 const receipts=new Map(),requests=[];let browser;
 const bootstrap=`import {openFavorites,setFavorite} from '/library-extras.js';import {mountLibrary} from '/library.js';import {mountFoodPicker} from '/food-picker.js';import {request} from '/diary-api.js';const content=document.querySelector('#sheet-content'),show=html=>{content.innerHTML=html;},header=title=>'<h1>'+title+'</h1>',close=()=>content.replaceChildren();const options={show,header,close,content,date:()=> '2026-11-15',onChange:async()=>{},openEntry:(kind,id)=>{document.querySelector('#opened').textContent=kind+':'+id;document.querySelector('#favorite-selected').onclick=async()=>{const {revision}=await request('/api/library');await setFavorite({kind,id,enabled:true,revision});document.querySelector('#favorite-selected').dataset.saved='true';};}};document.querySelector('#favorites').onclick=()=>openFavorites(options);let mounted;document.querySelector('#library').onclick=()=>{mounted?.dispose?.();mounted=mountLibrary({...options,page:document.querySelector('#page')});};document.querySelector('#picker').onclick=()=>{mounted?.dispose?.();mounted={dispose:mountFoodPicker(document.querySelector('#page'),{onPick:options.openEntry})};};document.querySelector('#food-picker-only').onclick=()=>{mounted?.dispose?.();mounted={dispose:mountFoodPicker(document.querySelector('#page'),{onPick:options.openEntry,allowMeals:false,allowRecipes:false})};};`;
 const publicRoot=resolve('public');
 const server=createServer(async(req,res)=>{try{
  res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; base-uri 'none'");
  const url=new URL(req.url,'http://localhost'),path=url.pathname;
  if(path==='/'){res.setHeader('Content-Type','text/html');return res.end('<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/diary.css"><link rel="stylesheet" href="/library-extras.css"><link rel="stylesheet" href="/food-search-source/mobile-food-search.css"><button id="favorites">Favorites</button><button id="library">Library</button><button id="picker">Picker</button><button id="food-picker-only">Foods only</button><div id="page"></div><div id="sheet-content"></div><div id="opened"></div><button id="favorite-selected">Favorite selected food</button><script type="module" src="/fixture.js"></script>');}
  if(path==='/fixture.js'){res.setHeader('Content-Type','text/javascript');return res.end(bootstrap);}
  if(path.startsWith('/api/')){
   res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');let body='';for await(const chunk of req)body+=chunk;const input=body?JSON.parse(body):null;
   if(path==='/api/library')return res.end(JSON.stringify(libraryView(state)));
   if(path==='/api/food-search')return res.end(JSON.stringify(searchCloudFoods(state,catalog,readCloudFoodSearchQuery(url.searchParams))));
   if(path==='/api/catalog/search')return res.end(JSON.stringify({items:[{id:catalogFood.id,name:catalogFood.name,serving:catalogFood.serving}],nextOffset:null}));
   if(path==='/api/library/favorites')return res.end(JSON.stringify(favoriteView(state)));
   if(path==='/api/workspace/command'){
    requests.push(input);if(receipts.has(input.requestId))return res.end(JSON.stringify(receipts.get(input.requestId)));
    if(input.revision!==digest(state))throw {status:409,message:'Refresh the library.'};
    const prepared=captureActionFoods(state,{type:input.type,payload:input.payload},new Map([[catalogFood.id,catalogFood]])),result=applyWorkspaceCommand(state,prepared),reply={revision:digest(state),result};receipts.set(input.requestId,reply);
    return res.end(JSON.stringify(reply));
   }
   throw {status:404,message:'Missing route.'};
  }
  const file=resolve(publicRoot,'.'+path);if(!file.startsWith(publicRoot+'\\')&&!file.startsWith(publicRoot+'/'))throw {status:404};const mime={'.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.woff2':'font/woff2'}[extname(file)];if(!mime||!existsSync(file))throw {status:404};res.setHeader('Content-Type',mime);res.end(readFileSync(file));
 }catch(error){res.statusCode=error.code??error.status??500;res.setHeader('Content-Type','application/json');res.end(JSON.stringify({error:error.message??'Request failed.'}));}});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+server.address().port;
 try{
  browser=await chromium.launch({executablePath:CHROME_EXECUTABLE,headless:true});const page=await browser.newPage({viewport:{width:412,height:915},isMobile:true,hasTouch:true});page.setDefaultTimeout(5000);const errors=[];page.on('pageerror',error=>errors.push(error.message));await page.goto(origin);
  await page.getByRole('button',{name:'Favorites',exact:true}).click();await page.getByRole('button',{name:'Rice 100 g'}).click();assert.equal(await page.locator('#opened').textContent(),'food:'+food);await page.getByRole('button',{name:'Remove from favorites'}).click();await page.getByRole('status').filter({hasText:'No favorites yet.'}).waitFor();assert.equal(state.settings.favorites.length,0);
  await page.getByRole('button',{name:'Library',exact:true}).click();await page.locator('[data-tab=foods]').click();const rice=page.locator('[data-library-item="'+food+'"]');await rice.dispatchEvent('contextmenu');const refreshed=page.waitForResponse(response=>new URL(response.url()).pathname==='/api/library');await page.getByRole('button',{name:'Add to favorites',exact:true}).click();await (await refreshed).finished();await rice.dispatchEvent('contextmenu');await page.getByRole('button',{name:'Remove from favorites',exact:true}).waitFor();assert.equal(favoriteView(state).items.length,1);await page.keyboard.press('Escape');await page.locator('[data-action=library-options]').click();await page.getByRole('button',{name:'Favorites',exact:true}).last().click();await page.locator('[data-favorites]').getByRole('button',{name:'Rice 100 g'}).waitFor();
  await page.getByRole('button',{name:'Picker',exact:true}).click();const picker=page.locator('#page');await picker.locator('[data-id="'+catalogFood.id+'"]').click();assert.equal(await page.locator('#opened').textContent(),'food:'+catalogFood.id);await page.getByRole('button',{name:'Favorite selected food',exact:true}).click();await page.locator('#favorite-selected[data-saved=true]').waitFor();assert.equal(state.foods.filter(f=>f.id===catalogFood.id).length,1);await picker.locator('[data-mfs-category=favorites]').click();await picker.locator('[data-id="'+catalogFood.id+'"]').click();assert.equal(await page.locator('#opened').textContent(),'food:'+catalogFood.id);assert.equal(favoriteView(state).items.length,2);
  const recipe=act(state,'recipe.save',{name:'Rice recipe',servings:1,ingredients:[{foodId:food,amount:1}]}).id,meal=act(state,'meal.save',{name:'Rice meal',items:[{foodId:food,amount:1}]}).id;act(state,'favorite.set',{kind:'recipe',id:recipe,enabled:true});act(state,'favorite.set',{kind:'meal',id:meal,enabled:true});
  await page.getByRole('button',{name:'Picker',exact:true}).click();await picker.locator('[data-mfs-category=favorites]').click();await picker.locator('[data-id="'+recipe+'"]').waitFor();await picker.locator('[data-id="'+meal+'"]').waitFor();
  await page.getByRole('button',{name:'Foods only',exact:true}).click();assert.equal(await picker.locator('[data-source=recipe]').count(),0);assert.equal(await picker.locator('[data-source=meal]').count(),0);await picker.locator('[data-mfs-category=favorites]').click();await picker.locator('[data-id="'+catalogFood.id+'"]').waitFor();assert.equal(await picker.locator('[data-id="'+recipe+'"]').count(),0);assert.equal(await picker.locator('[data-id="'+meal+'"]').count(),0);assert.equal(await picker.locator('.mfs-result').count(),2);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert.deepEqual(errors,[]);
 }finally{catalog.disposeSearch();await browser?.close();await new Promise(resolve=>server.close(resolve));}
});
