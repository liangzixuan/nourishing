import {CHROME_EXECUTABLE} from './_chrome.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFileSync,existsSync,mkdirSync} from 'node:fs';
import {resolve,extname} from 'node:path';
import {chromium} from 'playwright-core';
import {initialState,act} from '../server/domain/workspace.mjs';
import {libraryView,libraryItem} from '../server/library-view.mjs';
import {digest} from '../server/data-codec.mjs';
import {previewLibrary} from '../server/workspace-commands.mjs';
import {favoriteView} from '../server/library-extras.mjs';

test('Foods preserves source home cards, collection navigation and item utilities without focusing search on return',async()=>{
 const state=initialState(),food=act(state,'food.save',{name:'Rice <fixture>',serving:'100 g',grams:100,nutrients:{calories:130}}).id;
 act(state,'food.save',{name:'Beans',serving:'100 g',grams:100,nutrients:{calories:100}});
 const old=act(state,'food.save',{name:'Retired food',serving:'100 g',grams:100,nutrients:{calories:80}}).id;state.foods.find(row=>row.id===old).retired=true;
 const requests=[],publicRoot=resolve('public');let browser;
 const bootstrap=`import {mountLibrary} from '/library.js';const content=document.querySelector('#sheet-content'),sheet=document.querySelector('#sheet'),close=()=>{sheet.close();content.replaceChildren();};content.onclick=event=>{if(event.target.closest('[data-close]'))close();};document.addEventListener('click',event=>{const b=event.target.closest('button');if(!b)return;if(b.hasAttribute('data-library-repeats'))window.destination='repeats';if(b.dataset.foodInsight)window.destination=b.dataset.foodInsight;if(b.dataset.action==='add-food')window.destination='search';});window.library=mountLibrary({page:document.querySelector('#page'),headerRoot:document.querySelector('.topbar'),content,show:html=>{content.innerHTML=html;if(!sheet.open)sheet.showModal();},header:title=>'<header class="sheet-header"><button type="button" data-close aria-label="Close">×</button><h2>'+title+'</h2></header>',close,date:()=> '2026-11-15',openEntry:(kind,id)=>{window.opened=kind+':'+id;},onChange:async()=>{}});`;
 const server=createServer(async(req,res)=>{try{
  res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; base-uri 'none'");const url=new URL(req.url,'http://localhost');
  if(url.pathname==='/'){res.setHeader('Content-Type','text/html');return res.end('<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/mobile-theme.css"><link rel="stylesheet" href="/diary.css"><link rel="stylesheet" href="/shell-source/discover.css"><link rel="stylesheet" href="/app-shell.css"><link rel="stylesheet" href="/library.css"><body class="discover-mobile dark"><header class="app-header topbar"></header><main id="page"></main><dialog id="sheet"><div id="sheet-content"></div></dialog><script type="module" src="/fixture.js"></script>');}
  if(url.pathname==='/fixture.js'){res.setHeader('Content-Type','text/javascript');return res.end(bootstrap);}
  if(url.pathname.startsWith('/api/')){res.setHeader('Content-Type','application/json');let body='';for await(const chunk of req)body+=chunk;const input=body?JSON.parse(body):null;
   if(url.pathname==='/api/library')return res.end(JSON.stringify(libraryView(state)));
   if(url.pathname==='/api/library/item')return res.end(JSON.stringify(libraryItem(state,url.searchParams.get('kind'),state[url.searchParams.get('kind')+'s'].find(row=>row.id===url.searchParams.get('id')))));
   if(url.pathname==='/api/library/preview')return res.end(JSON.stringify(previewLibrary(state,input)));
   if(url.pathname==='/api/library/favorites')return res.end(JSON.stringify(favoriteView(state)));
   if(url.pathname==='/api/workspace/command'){requests.push(input);assert.equal(input.type,'favorite.set');assert.equal(input.revision,digest(state));act(state,input.type,input.payload);return res.end(JSON.stringify({revision:digest(state)}));}
   throw {status:404};
  }
  const file=resolve(publicRoot,'.'+url.pathname);if(!file.startsWith(publicRoot+'/')&&!file.startsWith(publicRoot+'\\'))throw {status:404};const mime={'.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.woff2':'font/woff2'}[extname(file)];if(!mime||!existsSync(file))throw {status:404};res.setHeader('Content-Type',mime);res.end(readFileSync(file));
 }catch(error){res.statusCode=error.status??500;res.end(JSON.stringify({error:error.message??'Missing fixture route'}));}});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{
  browser=await chromium.launch({executablePath:CHROME_EXECUTABLE,headless:true});const page=await browser.newPage({viewport:{width:412,height:915},isMobile:true,hasTouch:true});page.setDefaultTimeout(6000);const errors=[];page.on('pageerror',error=>{errors.push(error.message);console.error(error.message);});page.on('response',response=>{if(response.status()>=400)console.error(response.status(),new URL(response.url()).pathname);});await page.goto('http://127.0.0.1:'+server.address().port);
  await page.getByRole('button',{name:'Create Food',exact:true}).waitFor();await page.waitForFunction(()=>!document.querySelector('[data-action="new-food"]').disabled);
  assert.deepEqual(await page.locator('.mfh-copy strong').allTextContents(),['Custom Meals','Custom Recipes','Custom Foods','Repeat Items','Suggest Food','Oracle Nutrient Search']);assert.equal(await page.locator('.picker-tabs').count(),0);assert.equal(await page.getByRole('heading',{name:'Foods',exact:true}).count(),1);
  for(const [selector,destination] of [['[data-library-repeats]','repeats'],['[data-food-insight="suggestions"]','suggestions'],['[data-food-insight="oracle"]','oracle'],['[aria-label="Search foods"]','search']]){await page.locator(selector).click();assert.equal(await page.evaluate(()=>window.destination),destination);}
  const beforeImport=structuredClone(state);await page.locator('[data-action=recipe-import]').click();const importer=page.locator('.mri-dialog');await importer.getByRole('heading',{name:'Import Recipe',exact:true}).waitFor();await importer.locator('[name=url]').fill('https://example.com/not-requested');await importer.locator('[data-mri-mode=ingredients]').click();await importer.locator('[name=ingredients]').fill('100 g rice');await page.keyboard.press('Escape');assert.equal(await importer.count(),0);await page.getByRole('heading',{name:'Create Recipe',exact:true}).waitFor();assert.deepEqual(state,beforeImport);assert.equal(requests.length,0);await page.locator('[data-recipe-close]').click();assert.equal(await page.locator('#sheet').evaluate(node=>node.open),false);
  mkdirSync('.local',{recursive:true});await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:'.local/foods-parity-home.png'});
  for(const [kind,title] of [['meal','Create Meal'],['recipe','Create Recipe'],['food','New Food']]){await page.locator('[data-action="new-'+kind+'"]').click();await page.getByRole('heading',{name:title,exact:true}).waitFor();await page.getByRole('button',{name:'Close',exact:true}).click();}
  await page.locator('[data-tab=recipes]').click();
  assert.equal(await page.getByRole('heading',{name:'No Recipes',exact:true}).count(),1);
  assert.equal(await page.getByRole('searchbox').count(),1);
  assert.equal(await page.locator('.ml-tools').count(),0);
  await page.getByRole('button',{name:'More actions',exact:true}).click();
  await page.getByRole('button',{name:'Import Recipe',exact:true}).click();
  await importer.getByRole('heading',{name:'Import Recipe',exact:true}).waitFor();
  await page.keyboard.press('Escape');await page.locator('[data-recipe-close]').click();
  await page.locator('[data-action=foods-home]').click();
  await page.locator('[data-tab=meals]').click();
  assert.equal(await page.getByRole('heading',{name:'Create a Meal',exact:true}).count(),1);
  await page.getByRole('button',{name:'Dismiss tip',exact:true}).click();
  assert.equal(await page.locator('.ml-meal-tip').count(),0);
  await page.locator('[data-action=foods-home]').click();
  await page.locator('[data-tab=meals]').click();
  assert.equal(await page.locator('.ml-meal-tip').count(),0);
  assert.equal(await page.getByRole('searchbox').count(),0);
  assert.equal(await page.locator('.ml-tools').count(),0);
  await page.locator('[data-action=foods-home]').click();
  await page.locator('[data-tab=foods]').click();assert.equal(await page.getByRole('heading',{name:'Custom Foods',exact:true}).count(),1);assert.equal(await page.locator('.ml-row').count(),2);assert.equal(await page.locator('.ml-tools>span').textContent(),'2 Foods');
  await page.locator('[data-action=library-options]').click();await page.getByRole('button',{name:'Alphabetical',exact:true}).click();assert.deepEqual(await page.locator('.ml-row>span').allTextContents(),['Beans','Rice <fixture>']);await page.getByRole('searchbox',{name:'Search library',exact:true}).fill('Rice');assert.equal(await page.locator('.ml-row').count(),1);assert.equal(await page.getByRole('searchbox',{name:'Search library',exact:true}).inputValue(),'Rice');
  const search=page.getByRole('searchbox',{name:'Search library',exact:true});
  await search.fill('No matching ingredient');
  assert.equal(await page.getByRole('heading',{name:'No Foods',exact:true}).count(),0);
  assert.equal(await page.locator('.ml-empty').innerText(),'No saved foods found');
  await search.fill('Rice');assert.equal(await search.evaluate(input=>document.activeElement===input),true);
  await page.locator('[data-library-item="'+food+'"]').dispatchEvent('contextmenu');await page.getByRole('button',{name:'Add to favorites',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.ml-row')?.innerText.includes('Rice'));await page.waitForFunction(()=>!document.querySelector('.ml-sheet'));assert.equal(requests.length,1);assert.equal(state.settings.favorites[0].id,food);
  await page.locator('[data-action=library-options]').click();await page.getByRole('button',{name:'Favorites',exact:true}).click();await page.locator('[data-favorite-open="'+food+'"]').click();assert.equal(await page.evaluate(()=>window.opened),'food:'+food);await page.getByRole('button',{name:'Close',exact:true}).click();
  await page.locator('[data-action=foods-home]').click();assert.equal(await page.locator('.mfh-home').count(),1);assert.equal(await page.locator('input:focus').count(),0);
  await page.locator('[data-tab=foods]').click();await page.locator('[data-action=library-options]').click();await page.getByRole('button',{name:'Show retired items',exact:true}).click();assert.equal(await page.locator('.ml-row>span').textContent(),'Retired food');await page.locator('[data-library-item="'+old+'"]').click();await page.getByRole('heading',{name:'Edit Food',exact:true}).waitFor();
  await page.getByRole('button',{name:'Close',exact:true}).click();await page.screenshot({path:'.local/foods-parity-collection.png'});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert.deepEqual(errors,[]);
  await page.evaluate(()=>window.library.dispose());assert.equal(await page.locator('body.foods-home-mobile,body.mobile-library').count(),0);
 }finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
});
