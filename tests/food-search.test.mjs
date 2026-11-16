import test from 'node:test';
import assert from 'node:assert/strict';
import {createInsightCatalog} from '../server/food-insights.mjs';
import {initialState} from '../server/domain/workspace.mjs';
import {searchCloudFoods,readCloudFoodSearchQuery} from '../server/food-search.mjs';
import {foodSourceFacts} from '../server/domain/food-catalog-identity.mjs';
import {contentDigest} from '../server/domain/content-digest.mjs';
import {createWebHandler} from '../server/http.mjs';
const food=(n,name,category='usda-category:14',dataset='sr-legacy-2018-04')=>({id:`usda:${dataset}:${n}`,name,serving:'100 g',grams:100,nutrients:{calories:20},source:{name:'USDA',datasetId:dataset,dataset,fdcId:n},category:{id:category,name:category}});
export function searchFixture(){
 const foods=[food(1,'Apple juice'),food(2,'Banana'),food(3,'Coffee','usda-category:14','foundation-foods'),food(4,'Restaurant chicken','usda-category:25')],state=initialState();
 state.foods=[{id:'custom',name:'Custom apple bowl',serving:'1 bowl',grams:100,nutrients:{calories:100},categoryId:'BEVERAGES'},{id:'vitamin',name:'Vitamin pill',classification:'supplement',nutrients:{}},{id:'brand',name:'Brand bar',barcode:'1234',nutrients:{}},{id:'retired',name:'Retired apple',retired:true,nutrients:{}},{...foods[0],id:'saved',readOnly:true}];
 state.recipes=[{id:'recipe',name:'Recipe apple',ingredients:[{foodId:'custom',amount:1}]},{id:'parent',name:'Parent recipe',ingredients:[{recipeId:'recipe',amount:1}]}];state.meals=[{id:'meal',name:'Meal apple',items:[]}];state.settings.favorites=[{kind:'food',id:'custom'},{kind:'recipe',id:'recipe'}];
 state.entries=[{foodId:'custom'},{foodId:'custom'},{foodId:'saved'}];
 const catalog=createInsightCatalog(foods,{metadata:{datasets:[{id:'sr-legacy-2018-04',name:'USDA SR Legacy',foodCount:3},{id:'foundation-foods',name:'Foundation',foodCount:1}]},sourceFactDigests:{[foods[0].id]:contentDigest(foodSourceFacts(state.foods.at(-1)))}});
 return {foods,state,catalog};
}
const run=(fixture,q='')=>searchCloudFoods(fixture.state,fixture.catalog,readCloudFoodSearchQuery(new URLSearchParams(q)));
test('verified catalog search restores source categories, database filters and usage ranking before pagination',()=>{
 const f=searchFixture(),before=structuredClone(f.state);try{
  assert.equal(run(f).identicalSnapshotsDeduplicated,1);assert.equal(run(f).items.some(row=>row.id===f.foods[0].id),false);
  assert.deepEqual(run(f,'category=favorites&sort=az').items.map(row=>row.id),['custom','recipe']);
  assert.deepEqual(run(f,'category=supplements').items.map(row=>row.id),['vitamin']);assert.deepEqual(run(f,'category=brands').items.map(row=>row.id),['brand']);
  assert.deepEqual(run(f,'category=restaurants').items.map(row=>row.id),[f.foods[3].id]);assert.equal(run(f,'category=common').items.every(row=>row.sourceType==='usda'),true);
  assert.deepEqual(run(f,'database=foundation-foods').items.map(row=>row.id),[f.foods[2].id]);
  assert.equal(run(f,'sort=frequent').items[0].id,'custom');assert.equal(run(f,'sort=recent').items[0].id,'saved');
  const first=run(f,'q=appl&sort=az&limit=2'),next=run(f,'q=appl&sort=az&limit=2&offset=2');assert.equal(first.nextOffset,2);assert.equal(new Set([...first.items,...next.items].map(row=>row.id)).size,4);
  assert.equal(run(f,'q=!!!').total,0);assert.deepEqual(f.state,before);
  const other=initialState();assert.equal(searchCloudFoods(other,f.catalog,readCloudFoodSearchQuery(new URLSearchParams('category=favorites'))).total,0);
  f.catalog.disposeSearch();assert.equal(run(f,'database=foundation-foods').items.length,1);
 }finally{f.catalog.disposeSearch();}
});
test('ingredient scope removes meals, disabled recipes and recipe cycles before paging',()=>{
 const f=searchFixture();try{
  const result=run(f,'category=custom&allowMeals=false&excludeRecipe=recipe');assert.equal(result.items.some(row=>['meal','recipe','parent'].includes(row.id)),false);
  assert.equal(run(f,'allowRecipes=false&allowMeals=false').items.every(row=>['foods','catalog'].includes(row.kind)),true);
  assert.throws(()=>run(f,'database=missing'),/database/);
 }finally{f.catalog.disposeSearch();}
});
test('food search HTTP requires account, validates scope and returns no-store results',async()=>{
 const f=searchFixture(),origin='https://fixture.example';let calls=0;const handler=createWebHandler({config:{origin},service:{foodSearch:async(secret,input)=>{assert.equal(secret,'session');calls++;return searchCloudFoods(f.state,f.catalog,input);}}});
 const request=(q='',signed=true)=>new Request(origin+'/api/food-search'+q,{headers:signed?{cookie:'__Host-nourishing_session=session'}:{}});
 try{
  assert.equal((await handler(request('',false))).status,401);
  for(const q of ['?ownerId=other','?category=brands&category=all','?allowMeals=maybe','?limit=101','?sort=unsupported','?database=custom&database=custom'])assert.equal((await handler(request(q))).status,400,q);
  assert.equal(calls,0);const response=await handler(request('?category=favorites&allowRecipes=false'));assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');assert.deepEqual((await response.json()).items.map(row=>row.id),['custom']);
 }finally{f.catalog.disposeSearch();}
});
