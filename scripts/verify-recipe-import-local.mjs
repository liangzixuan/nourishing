// Production routes, source parsers, command validation and browser modules;
// disposable memory state and a public-page transport fixture. No live account.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {Readable} from 'node:stream';
import {readFileSync,readdirSync,mkdirSync,writeFileSync} from 'node:fs';
import {chromium} from 'playwright-core';
import {createHandler} from '../server/http.mjs';
import {initialState} from '../server/domain/workspace.mjs';
import {calculateSummary,entryFacts,recipeNutrition} from '../server/domain/nutrition.mjs';
import {parseCommand,applyWorkspaceCommand,readActionFoods,captureActionFoods} from '../server/workspace-commands.mjs';
import {createInsightCatalog} from '../server/food-insights.mjs';
import {libraryView,libraryItem} from '../server/library-view.mjs';
import {digest} from '../server/data-codec.mjs';
import {fetchPublicRecipe,importRecipeUrl,previewRecipeImport,prepareRecipeImportSave} from '../server/recipe-import.mjs';

let state=initialState(),libraryReads=0,publicRequests=0;
const instructions='Mix and cook. '+'Cool before serving. '.repeat(1000);
const html=`<div itemscope itemtype="https://schema.org/Recipe"><h1 itemprop="name">Fixture rice and beans</h1><meta itemprop="recipeYield" content="4 servings"><span itemprop="recipeIngredient">200 g white rice</span><span itemprop="recipeIngredient">100 g black beans</span><p itemprop="recipeInstructions">${instructions}</p></div>`;
const foods=[['White rice',130,3,28],['Black beans',100,8,20],['Oats',400,10,60]].map(([name,calories,protein,carbs],i)=>({id:'usda:fixture:'+(i+1),name,serving:'100 g',grams:100,nutrients:{calories,protein,carbs,fat:1},portions:[],readOnly:true,sample:false,source:{name:'Fixture catalog',datasetId:'fixture',fdcId:i+1}}));
const catalog=createInsightCatalog(foods),byId=new Map(foods.map(food=>[food.id,food]));
const fetchPage=url=>fetchPublicRecipe(url,{lookup:async()=>[{address:'93.184.216.34',family:4}],open:async(url,options)=>{assert.equal(url.hostname,'recipe.example');const address=await new Promise((resolve,reject)=>options.lookup(url.hostname,{all:true},(error,value)=>error?reject(error):resolve(value)));assert.deepEqual(address,[{address:'93.184.216.34',family:4}]);publicRequests++;return Object.assign(Readable.from([Buffer.from(html)]),{statusCode:200,headers:{}});}});
const service={
 current:async secret=>{assert.equal(secret,'recipe-fixture');return {id:'fixture'};},
 readDiary:async(_,date)=>({date,theme:state.settings.theme,revision:digest(state),groups:state.settings.groups,completed:false,entries:state.entries.map(row=>({...row,facts:entryFacts(state,row)})),notes:state.notes,biometrics:state.biometrics,summary:calculateSummary(state,date)}),
 library:async()=>{libraryReads++;return libraryView(state);},libraryItem:async(_,kind,id)=>libraryItem(state,kind,state[kind+'s'].find(row=>row.id===id)),
 searchCatalog:async(_,input)=>({items:foods.filter(food=>food.name.toLowerCase().includes(input.query.toLowerCase())),nextOffset:null}),
 importRecipe:async(_,input)=>importRecipeUrl(state,catalog,input,{fetchPage}),previewRecipeImport:async(_,input)=>previewRecipeImport(state,catalog,input),
 saveRecipeImport:async(_,input)=>{
  const {rows,...metadata}=prepareRecipeImportSave(state,catalog,input.draft),raw={requestId:input.requestId,revision:input.revision,type:'recipe.save',payload:{...metadata,ingredients:rows.map(row=>({foodId:row.ref.id,...row.quantity}))}};
  parseCommand(raw);if(raw.revision!==digest(state))throw Object.assign(Error('Refresh and try again.'),{code:409});
  const resolved=await readActionFoods(raw,async id=>byId.get(id)??null),next=structuredClone(state),action=captureActionFoods(next,{type:raw.type,payload:raw.payload},resolved),saved=applyWorkspaceCommand(next,action);state=next;return {revision:digest(state),item:saved};
 }
};
const assets=new Map();for(const name of readdirSync('public'))if(/\.(html|js|css|svg)$/.test(name))assets.set('/'+name,{body:readFileSync('public/'+name),type:name.endsWith('.js')?'text/javascript':name.endsWith('.css')?'text/css':name.endsWith('.svg')?'image/svg+xml':'text/html'});assets.set('/diary',assets.get('/diary.html'));
let handler,browser,page;const server=createServer((req,res)=>handler(req,res));await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin=`http://127.0.0.1:${server.address().port}`;handler=createHandler({config:{origin},service,assets});mkdirSync('.local',{recursive:true});
try{
 browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});const context=await browser.newContext({viewport:{width:412,height:915},isMobile:true,hasTouch:true});await context.setExtraHTTPHeaders({Cookie:'__Host-nourishing_session=recipe-fixture'});page=await context.newPage();page.setDefaultTimeout(12000);const errors=[],failures=[];page.on('pageerror',error=>errors.push(error.message));page.on('response',response=>{if(response.url().includes('/api/')&&response.status()>=400)failures.push([response.status(),new URL(response.url()).pathname]);});
 const button=name=>page.getByRole('button',{name,exact:true});await page.goto(origin+'/diary');await page.getByRole('heading',{name:'Notes',exact:true}).waitFor();await button('Foods').click();await button('Recipes').click();await button('Import Recipe').click();await page.getByLabel('Recipe link',{exact:true}).fill('https://recipe.example/one');await button('Import').click();await page.getByRole('heading',{name:'Review Recipe'}).waitFor();
 await page.locator('[data-row="0"]').click();await page.locator('[name=amount]').fill('100');await page.getByLabel('Serving',{exact:true}).selectOption('g');await button('Done').click();await page.getByRole('heading',{name:'Review Recipe'}).waitFor();
 await page.locator('[data-row="1"]').click();await button('Replace').click();await page.locator('[data-item="usda:fixture:3"]').click();await page.locator('[name=amount]').fill('25');await page.getByLabel('Serving',{exact:true}).selectOption('g');await button('Done').click();await page.getByRole('heading',{name:'Review Recipe'}).waitFor();await page.screenshot({path:'.local/recipe-import-mobile.png'});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 state.profile.name='Concurrent fixture edit';await button('Save Recipe').click();await button('Reload latest').click();await page.getByRole('heading',{name:'Review Recipe'}).waitFor();await button('Save Recipe').click();await page.locator('#sheet').waitFor({state:'hidden'});await page.locator('[data-library-item]').filter({hasText:'Fixture rice and beans'}).waitFor();
 assert.equal(state.recipes.length,1);const recipe=state.recipes[0];assert.equal(recipe.source,'https://recipe.example/one');assert.equal(recipe.instructions,instructions.trim());assert.equal(recipe.servings,4);assert.deepEqual(recipe.ingredients.map(row=>({foodId:row.foodId,quantity:row.quantity,unit:row.unit})),[{foodId:'usda:fixture:1',quantity:100,unit:'g'},{foodId:'usda:fixture:3',quantity:25,unit:'g'}]);assert.deepEqual(recipe.importReview.originalIngredients,['200 g white rice','100 g black beans']);assert.equal(state.foods.filter(food=>food.readOnly).length,2);assert.equal(recipeNutrition(state,recipe).nutrients.calories,57.5);assert.equal(publicRequests,1);assert.ok(libraryReads>=2);assert.deepEqual(errors,[]);assert.deepEqual(failures,[[409,'/api/recipe-import/save']]);
 writeFileSync('.local/recipe-import-local-result.json',JSON.stringify({passed:true,provider:'in-memory workspace; mocked public transport',checks:['real HTTP routes','public DNS pinning','production HTML parser','over16KiB instructions','quantity edit','catalog replacement','source capture','recipe command validation','source and review retained','stale revision recovery','Foods refresh','no overflow or script errors']},null,2));console.log('PASS recipe mobile HTTP/domain fixture, canonical save and Foods refresh');
}catch(error){await page?.screenshot({path:'.local/recipe-import-failure.png'});console.error(await page?.locator('body').innerText());throw error;}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
