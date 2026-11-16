import {diaryCalendarView} from '../server/diary-calendar-view.mjs';
import {chooseDiaryDate} from './diary-test-navigation.mjs';
// Production HTTP/domain/browser flow with a disposable memory workspace.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFileSync,readdirSync,writeFileSync} from 'node:fs';
import {chromium} from 'playwright-core';
import {createHandler} from '../server/http.mjs';
import {initialState,act,previewDiaryItem} from '../server/domain/workspace.mjs';
import {entryFacts,calculateSummary} from '../server/domain/nutrition.mjs';
import {entryAdjustmentView,previewEntryAdjustment} from '../server/entry-adjustments.mjs';
import {parseCommand,readActionFoods,captureActionFoods,applyWorkspaceCommand} from '../server/workspace-commands.mjs';
import {libraryView,libraryItem} from '../server/library-view.mjs';
import {digest} from '../server/data-codec.mjs';
let state=initialState();const date='2026-11-14';state.foods=[];state.recipes=[];state.meals=[];state.entries=[];
for(const [name,calories] of [['Rice',100],['Chicken',200],['Greens',10]])act(state,'food.save',{name,serving:'100 g',grams:100,nutrients:{calories,protein:10},portions:[{id:'cup',label:'cup',grams:50}]});
act(state,'recipe.save',{name:'Fixture bowl',servings:2,cookedWeightGrams:200,batchVolumeMl:400,ingredients:state.foods.slice(0,2).map(food=>({foodId:food.id,quantity:100,unit:'g'})),portions:[{id:'half',label:'Half',basis:'batch',portionsPerBatch:2}]});
act(state,'meal.save',{name:'Fixture lunch',items:[{recipeId:state.recipes[0].id,amount:1},{foodId:state.foods[2].id,amount:1}]});
for(let i=0;i<2;i++)act(state,'entry.add',{date,group:'Lunch',recipeId:state.recipes[0].id,quantity:100,unit:'g'});
act(state,'entry.add',{date,group:'Lunch',mealId:state.meals[0].id,amount:2});const original=structuredClone(state);
const food={id:'usda:fixture:1',name:'Oats',grams:100,serving:'100 g',nutrients:{calories:400,protein:10},portions:[],readOnly:true,sample:false,source:{name:'Fixture catalog',datasetId:'fixture',fdcId:1}};
const readCatalog=async id=>id===food.id?food:null,receipts=new Map(),commands=[];
const service={diaryCalendar:async(_,input)=>diaryCalendarView(state,input,{now:new Date(),timeZone:'UTC'}),
 current:async secret=>{assert.equal(secret,'adjustment-fixture');return {id:'fixture'};},
 readDiary:async(_,day)=>({date:day,theme:state.settings.theme,revision:digest(state),groups:state.settings.groups,completed:false,entries:state.entries.filter(row=>row.date===day).map(row=>({...row,facts:entryFacts(state,row)})),notes:state.notes,biometrics:[],summary:calculateSummary(state,day)}),
 library:async()=>libraryView(state),libraryItem:async(_,kind,id,entryId)=>libraryItem(state,kind,state[kind+'s'].find(row=>row.id===id)??(id===food.id?food:null),state.entries.find(row=>row.id===entryId)),
 previewDiary:async(_,input)=>previewDiaryItem(state,input),
 searchCatalog:async()=>({items:[food],nextOffset:null}),
 entryAdjustment:async(_,input)=>entryAdjustmentView(state,input),
 previewEntryAdjustment:async(_,input)=>{const action={type:'entry.ingredients.adjust',payload:input},next=structuredClone(state),foods=await readActionFoods(action,readCatalog);return previewEntryAdjustment(next,captureActionFoods(next,action,foods).payload);},
 workspaceCommand:async(_,input)=>{parseCommand(input);const signature=digest(input);if(receipts.has(input.requestId)){assert.equal(receipts.get(input.requestId).signature,signature);return receipts.get(input.requestId).result;}if(input.revision!==digest(state))throw Object.assign(Error('Refresh and try again.'),{code:409});const foods=await readActionFoods(input,readCatalog),next=structuredClone(state);const saved=applyWorkspaceCommand(next,captureActionFoods(next,{type:input.type,payload:input.payload},foods));state=next;const result={revision:digest(state),item:saved};receipts.set(input.requestId,{signature,result});commands.push(input);return result;}
};
const assets=new Map();for(const name of readdirSync('public'))if(/\.(html|js|css|svg)$/.test(name))assets.set('/'+name,{body:readFileSync('public/'+name),type:name.endsWith('.js')?'text/javascript':name.endsWith('.css')?'text/css':name.endsWith('.svg')?'image/svg+xml':'text/html'});assets.set('/diary',assets.get('/diary.html'));
let handler,browser,page;const server=createServer((req,res)=>handler(req,res));await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin=`http://127.0.0.1:${server.address().port}`;handler=createHandler({config:{origin},service,assets});
try{
 browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});const context=await browser.newContext({viewport:{width:412,height:915},isMobile:true,hasTouch:true});await context.setExtraHTTPHeaders({Cookie:'__Host-nourishing_session=adjustment-fixture'});page=await context.newPage();page.setDefaultTimeout(10000);const errors=[];page.on('pageerror',error=>errors.push(error.message));const button=name=>page.getByRole('button',{name,exact:true});
 await page.goto(origin+'/diary');await page.locator('.md-summary').waitFor();await chooseDiaryDate(page,date);await button('Fixture bowl').first().click();await button('Adjust ingredients').click();await page.locator('[data-edit="0"]').click();await page.locator('[name=amount]').fill('50');await page.getByLabel('Serving',{exact:true}).selectOption('g');await button('Use ingredient').click();
 await button('Replace ingredient 2').click();await page.locator('[data-item="usda:fixture:1"]').click();await page.locator('[name=amount]').fill('50');await page.getByLabel('Serving',{exact:true}).selectOption('g');await button('Use ingredient').click();await page.getByText('Recipe yield & portions',{exact:true}).click();await page.getByLabel('Cooked weight (g)',{exact:true}).fill('250');await page.locator('.nutrition-preview strong').filter({hasText:'100 kcal'}).waitFor();await page.screenshot({path:'.local/entry-adjustment-mobile.png'});
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth));await button('Save changes').click();await page.locator('#sheet').waitFor({state:'hidden'});assert.equal(entryFacts(state,state.entries[0]).nutrients.calories,100);assert.equal(entryFacts(state,state.entries[1]).nutrients.calories,150);assert.deepEqual(state.recipes,original.recipes);assert.deepEqual(state.entries[0].recipeOverride.portions,original.recipes[0].portions);assert.equal(state.foods.at(-1).id,food.id);
 await button('Fixture lunch').click();await button('Adjust ingredients').click();await button('Remove ingredient 2').click();await page.locator('.nutrition-preview strong').filter({hasText:'300 kcal'}).waitFor();state.profile.name='Concurrent fixture update';await button('Save changes').click();await button('Reload latest').click();await button('Remove ingredient 2').click();await page.locator('.nutrition-preview strong').filter({hasText:'300 kcal'}).waitFor();await button('Save changes').click();await page.locator('#sheet').waitFor({state:'hidden'});
 assert.equal(state.entries[2].amount,1);assert.equal(entryFacts(state,state.entries[2]).nutrients.calories,300);assert.deepEqual(state.meals,original.meals);assert.equal(commands.length,2);assert.deepEqual(await service.workspaceCommand(null,commands[1]),receipts.get(commands[1].requestId).result);assert.equal(commands.length,2);assert.deepEqual(errors,[]);
 writeFileSync('.local/entry-adjustments-local-result.json',JSON.stringify({passed:true,checks:['production HTTP and command guards','recipe amount and catalog replacement','batch measurement and named portions retained','preview matches saved occurrence','other occurrence and library unchanged','meal expansion and removal','stale reload recovery','duplicate command replay','mobile layout and no browser errors']},null,2));console.log('PASS entry adjustment mobile HTTP/domain flow');
}catch(error){await page?.screenshot({path:'.local/entry-adjustment-failure.png'});console.error(await page?.locator('body').innerText());throw error;}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
