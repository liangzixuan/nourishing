import test from 'node:test';
import assert from 'node:assert/strict';
import {initialState,act} from '../server/domain/workspace.mjs';
import {MEAL_LIBRARY} from '../server/domain/meal-suggestion-library.mjs';
import {foodSourceFacts} from '../server/domain/food-catalog-identity.mjs';
import {contentDigest} from '../server/domain/content-digest.mjs';
import {createInsightCatalog,foodOracle,foodSuggestions,foodInsightOptions,previewFoodSuggestion,resolveFoodInsightIngredient,prepareFoodInsightCommand} from '../server/food-insights.mjs';
const day='2026-11-14';
const food=(id,name,values,extra={})=>({id,name,serving:'100 g',grams:100,nutrients:values,source:{name:'Test catalog'},...extra});
function mealCatalog(){const map=new Map();for(const meal of MEAL_LIBRARY)for(const row of meal.ingredients)map.set(row.ref.id,food(row.ref.id,row.name,{calories:100,protein:10,carbs:10,fat:2,fiber:1},{source:{name:'USDA',datasetId:'sr-legacy-2018-04',fdcId:Number(row.ref.id.split(':').at(-1)),archiveSha256:row.archiveSha256}}));return [...map.values()];}
test('ingredient candidates preserve catalog order, whole-word prefixes and ranking fields at the cutoff',()=>{
 const rows=[
  food('sample','Bean',{},{sample:true}),
  food('middle','Soybean',{}),
  food('translation','Haricot',{},{translations:[{name:'Red Béans'}]}),
  food('red','Kidney bean, red',{}),
  food('more','Red bean soup',{})
 ];
 delete rows[2].grams;
 const catalog=createInsightCatalog(rows);
 const find=(query,limit)=>catalog.ingredientCandidates(query,limit).items;
 assert.deepEqual(find('BÉA red',2),[
  {id:'translation',name:'Haricot',grams:null,serving:'100 g',source:{name:'Test catalog'}},
  {id:'red',name:'Kidney bean, red',grams:100,serving:'100 g',source:{name:'Test catalog'}}
 ]);
 assert.deepEqual(find('bea',1).map(row=>row.id),['translation']);
 assert.deepEqual(find('!!!',25),[]);
 assert.deepEqual(find('',2).map(row=>row.id),['middle','translation']);
});
test('Oracle ranks stored facts, excludes missing and samples, keeps known zero and exact quantities',()=>{
 const state=initialState();state.foods=[];const adapter=createInsightCatalog([food('a','A',{calories:200,protein:12},{portions:[{id:'cup',label:'Cup',grams:150}]}),food('b','B',{calories:50,protein:4}),food('c','C',{calories:10}),food('d','D',{calories:10,protein:0}),food('sample','Sample',{protein:900},{sample:true})]);
 const grams=foodOracle(state,adapter,{nutrient:'protein'});assert.deepEqual(grams.items.map(r=>r.ref.id),['a','b','d']);assert.equal(grams.coverage.examined,4);assert.deepEqual(grams.items[0].sourceQuantity,{quantity:100,unit:'g'});
 const energy=foodOracle(state,adapter,{nutrient:'protein',basis:'100kcal'});assert.equal(energy.items[0].ref.id,'b');assert.deepEqual(energy.items[0].sourceQuantity,{quantity:200,unit:'g'});
 const portion=foodOracle(state,adapter,{nutrient:'protein',basis:'portion'});assert.equal(portion.items[0].value,18);assert.deepEqual(portion.items[0].sourceQuantity,{quantity:1,unit:'portion',portionId:'cup'});
 assert.throws(()=>foodOracle(state,adapter,{nutrient:'secret',state:{}}));assert.throws(()=>foodOracle(state,adapter,{nutrient:'protein',offset:-1}));
});
test('catalog snapshots deduplicate only against complete source fact digests; private facts remain separate',()=>{
 const original=mealCatalog()[0],state=initialState();state.foods=[{...structuredClone(original),id:'saved',readOnly:true}];const adapter=createInsightCatalog([original],{sourceFactDigests:{[original.id]:contentDigest(foodSourceFacts(state.foods[0]))}});
 assert.equal(foodOracle(state,adapter,{nutrient:'protein'}).total,1);state.foods[0].nutrients.protein=99;const changed=foodOracle(state,adapter,{nutrient:'protein'});assert.equal(changed.total,2);assert.equal(changed.items[0].ref.kind,'library');assert.equal(adapter.get(original.id).nutrients.protein,10);
});
test('Oracle query, category filter and paging retain ranking and source attribution',()=>{
 const state=initialState();state.foods=[];const adapter=createInsightCatalog([food('a','Rice',{protein:5},{category:{id:'grain',name:'Grains'}}),food('b','Bean',{protein:7},{category:{id:'legume',name:'Legumes'},translations:[{name:'Frijoles'}]})]);
 assert.equal(foodOracle(state,adapter,{nutrient:'protein',query:'frij'}).items[0].name,'Bean');assert.equal(foodOracle(state,adapter,{nutrient:'protein',categoryMode:'include',categoryIds:['grain']}).items[0].name,'Rice');
 const first=foodOracle(state,adapter,{nutrient:'protein',limit:1});assert.equal(first.nextOffset,1);assert.equal(foodOracle(state,adapter,{nutrient:'protein',offset:1,limit:1}).items[0].name,'Rice');assert.equal(first.items[0].source.name,'Test catalog');
});
test('Oracle balances mass and energy density across the full result set before paging',()=>{
 const state=initialState();state.foods=[];state.entries=[];
 const rows=Array.from({length:105},(_,i)=>food('f'+i,'Potassium food '+i,{potassium:1,calories:100}));
 const late=food('late','Potassium food Z',{potassium:200,calories:25},{grams:50});
 rows.push(late,food('dense','Potassium food by mass',{potassium:500,calories:1000}),
   food('light','Potassium food by calorie',{potassium:50,calories:1}),
   food('zero','Potassium food measured zero',{potassium:0,calories:1}),
   food('no-energy','Potassium food zero energy',{potassium:9000,calories:0}),
   food('missing','Potassium food unreported energy',{potassium:9000}),
   food('volume','Potassium food by volume',{potassium:9000,calories:100},{grams:null,milliliters:100}),
   food('unknown','Potassium food unreported potassium',{calories:100}));
 const catalog=createInsightCatalog(rows),input={basis:'oracle',nutrient:'potassium',query:'Potassium food'};
 const ranked=foodOracle(state,catalog,{...input,limit:3});
 // Products of the two independent densities: 400*8, 50*50 and 500*0.5.
 assert.deepEqual(ranked.items.map(item=>item.ref.id),['late','light','dense']);
 assert.equal(ranked.coverage.examined,113);assert.equal(ranked.total,109);assert.equal(ranked.nextOffset,3);
 assert.deepEqual(ranked.items[0].sourceQuantity,{quantity:100,unit:'g'});assert.equal(ranked.items[0].value,400);
 assert.equal(foodOracle(state,catalog,{...input,offset:108,limit:1}).items[0].ref.id,'zero');
 assert.equal(foodOracle(state,catalog,{...input,categoryMode:'include',categoryIds:[]}).total,0);
});
test('Oracle density ties use only the current account’s favorites and diary entries, including matching snapshots',()=>{
 const original=mealCatalog()[0],saved={...structuredClone(original),id:'saved',readOnly:true};
 const peer=food('peer','A private peer',{protein:10,calories:100});
 const another=food('another','B private peer',{protein:10,calories:100});
 const adapter=createInsightCatalog([original],{sourceFactDigests:{[original.id]:contentDigest(foodSourceFacts(saved))}});
 const account=initialState();account.foods=[saved,peer,another];account.entries=[{foodId:'saved'},{foodId:'saved'},{foodId:'another'}];
 account.settings.favorites=[{kind:'food',id:'peer'},{kind:'recipe',id:'another'}];
 const before=structuredClone(account),order=state=>foodOracle(state,adapter,{nutrient:'protein',basis:'oracle'}).items.map(row=>row.ref.id);
 assert.deepEqual(order(account),['peer',original.id,'another']);assert.deepEqual(account,before);
 const other={...account,entries:[],settings:{...account.settings,favorites:[]}};
 assert.deepEqual(order(other),['peer','another',original.id]);
 account.foods[0].nutrients.protein=5;
 assert.deepEqual(order(account),['peer','another',original.id,'saved']);
});
test('Oracle uses the source carbohydrate resolver and leaves missing fiber unknown',()=>{
 const state=initialState();state.foods=[];const adapter=createInsightCatalog([food('a','Available plus fiber',{availableCarbs:12,fiber:3}),food('b','Fiber unknown',{availableCarbs:20})]);
 const ranked=foodOracle(state,adapter,{nutrient:'carbs'});assert.equal(ranked.total,1);assert.equal(ranked.items[0].value,15);assert.equal(adapter.get('a').nutrients.carbs,undefined);
});
test('suggestions use pinned source recipes and all requested filters without mutating diary',()=>{
 const state=initialState(),before=structuredClone(state),foods=mealCatalog(),adapter=createInsightCatalog(foods);
 const result=foodSuggestions(state,adapter,{date:day,filters:{diets:['vegan'],categories:['dinner'],exclusions:['soy']},limit:20});assert.ok(result.items.length);assert.ok(result.items.every(item=>item.tags.diets.includes('vegan')&&item.tags.categories.includes('dinner')&&!item.tags.exclusions.includes('soy')));assert.deepEqual(state,before);
 const mismatch=structuredClone(foods);mismatch.forEach(f=>f.source.archiveSha256='bad');assert.equal(foodSuggestions(state,createInsightCatalog(mismatch),{date:day}).items.length,0);
 assert.throws(()=>foodSuggestions(state,adapter,{date:day,filters:{diets:['invented']}}));
});
test('custom foods with unknown tags are not represented as meeting dietary exclusions',()=>{
 const state=initialState();state.foods=[food('private','My food',{calories:100,protein:8})];const adapter=createInsightCatalog([]);
 assert.equal(foodSuggestions(state,adapter,{date:day,filters:{includeCustom:true}}).items.length,1);
 assert.equal(foodSuggestions(state,adapter,{date:day,filters:{includeCustom:true,exclusions:['milk']}}).items.length,0);
 assert.equal(foodInsightOptions(state).suggestions.custom[0].tagStatus,'unknown');
});
test('editable canonical quantities change preview totals and reject foreign private references',()=>{
 const state=initialState(),adapter=createInsightCatalog(mealCatalog()),row=MEAL_LIBRARY[0].ingredients[0],selection={ref:row.ref,quantity:100,unit:'g'};
 const one=previewFoodSuggestion(state,adapter,{date:day,rows:[selection]}),two=previewFoodSuggestion(state,adapter,{date:day,rows:[{...selection,quantity:200}]});assert.equal(two.meal.totals.protein,one.meal.totals.protein*2);
 assert.throws(()=>previewFoodSuggestion(state,adapter,{date:day,rows:[{ref:{kind:'library',id:'foreign'},quantity:1,unit:'servings'}]}));assert.throws(()=>previewFoodSuggestion(state,adapter,{date:day,rows:[{...selection,quantity:-1}]}));
});
const preference=(state,payload)=>{const action=prepareFoodInsightCommand(state,{type:'foodSuggestion.preference',payload});return act(state,action.type,action.payload);};
test('custom tags bind to current facts and govern custom diet/category/exclusion filtering',()=>{
 const state=initialState();state.foods=[food('private','My food',{calories:100,protein:8})];const originalGroups=[...state.settings.groups],options=foodInsightOptions(state),custom=options.suggestions.custom[0],adapter=createInsightCatalog([]);
 preference(state,{action:'tags',ref:custom.ref,revision:custom.revision,tags:{diets:['vegan'],categories:['dinner'],exclusions:['soy']}});
 assert.equal(foodSuggestions(state,adapter,{date:day,filters:{includeCustom:true,diets:['vegan'],categories:['dinner']}}).total,1);
 assert.equal(foodSuggestions(state,adapter,{date:day,filters:{includeCustom:true,diets:['vegan'],exclusions:['soy']}}).total,0);assert.deepEqual(state.settings.groups,originalGroups);
 state.foods[0].nutrients.protein=9;assert.throws(()=>preference(state,{action:'tags',ref:custom.ref,revision:custom.revision,tags:{diets:[],categories:[],exclusions:[]}}),error=>error.status===409);
 assert.equal(foodInsightOptions(state).suggestions.custom[0].tagStatus,'changed-since-review');assert.equal(foodSuggestions(state,adapter,{date:day,filters:{includeCustom:true,diets:['vegan']}}).total,0);
});
test('suggestion preferences hide, restore and reorder via source policy while rejecting unsupported fields',()=>{
 const state=initialState(),adapter=createInsightCatalog(mealCatalog()),result=foodSuggestions(state,adapter,{date:day,limit:20}),ref=result.items[0].ref;
 preference(state,{action:'feedback',ref,lessOften:true});assert.ok(!same(foodSuggestions(state,adapter,{date:day,limit:20}).items[0].ref,ref));
 preference(state,{action:'exclude',ref,excluded:true});assert.equal(foodSuggestions(state,adapter,{date:day,limit:20}).total,result.total-1);
 preference(state,{action:'exclude',ref,excluded:false});assert.equal(foodSuggestions(state,adapter,{date:day,limit:20}).total,result.total);
 assert.throws(()=>preference(state,{action:'exclude',ref,excluded:true,extra:1}));assert.throws(()=>preference(state,{action:'exclude',ref:{kind:'foods',id:'other-account'},excluded:true}));
});
const same=(a,b)=>a.kind===b.kind&&a.id===b.id;
test('replacement resolves catalog and custom recipe quantities through original expansion owner',()=>{
 const state=initialState(),adapter=createInsightCatalog(mealCatalog()),id=MEAL_LIBRARY[0].ingredients[0].ref.id;
 const replacement=resolveFoodInsightIngredient(state,adapter,{date:day,selection:{kind:'catalog',id},quantity:{quantity:2,unit:'oz'}});assert.equal(replacement.rows[0].quantity,2);assert.equal(replacement.rows[0].unit,'oz');
 state.foods=[food('private','My food',{calories:100,protein:8})];state.recipes=[{id:'recipe',name:'My recipe',servings:2,ingredients:[{foodId:'private',amount:4}]}];
 const recipe=resolveFoodInsightIngredient(state,adapter,{date:day,selection:{kind:'recipes',id:'recipe'}});assert.equal(recipe.rows[0].ref.kind,'library');assert.equal(recipe.rows[0].quantity,2);
 assert.throws(()=>resolveFoodInsightIngredient(state,adapter,{date:day,selection:{kind:'foods',id:'other-account'}}));assert.throws(()=>resolveFoodInsightIngredient(state,adapter,{date:day,selection:{kind:'catalog',id},quantity:{quantity:-1,unit:'g'}}));
});
test('packed nutrient adapter retains arrays and matches normal ranking, filtering and meal calculations',()=>{
 const foods=mealCatalog();foods.push(food('available','Available carbohydrate',{availableCarbs:20,fiber:5,calories:100},{portions:[{id:'cup',label:'Cup',grams:125}]}));
 const nutrientIds=[...new Set(foods.flatMap(food=>Object.keys(food.nutrients)))];
 const compact=foods.map(food=>({...food,nutrients:Object.entries(food.nutrients).flatMap(([id,value])=>[nutrientIds.indexOf(id),value])})),before=structuredClone(compact);
 const normal=createInsightCatalog(foods),packed=createInsightCatalog(compact,{nutrientIds}),state=initialState();
 for(const nutrient of ['protein','carbs','fiber'])for(const basis of ['oracle','100g','100kcal','portion'])assert.deepEqual(foodOracle(state,packed,{nutrient,basis}),foodOracle(state,normal,{nutrient,basis}));
 assert.deepEqual(foodOracle(state,packed,{nutrient:'carbs',query:'available'}),foodOracle(state,normal,{nutrient:'carbs',query:'available'}));
 assert.deepEqual(foodSuggestions(state,packed,{date:day}),foodSuggestions(state,normal,{date:day}));
 const rows=MEAL_LIBRARY[0].ingredients.map(({ref,quantity,unit})=>({ref,quantity,unit}));assert.deepEqual(previewFoodSuggestion(state,packed,{date:day,rows}),previewFoodSuggestion(state,normal,{date:day,rows}));
 assert.deepEqual(packed.get(foods[0].id),foods[0]);packed.get(foods[0].id).nutrients.protein=999;assert.equal(packed.get(foods[0].id).nutrients.protein,10);assert.deepEqual(compact,before);assert.ok(compact.every(row=>Array.isArray(row.nutrients)));assert.equal(packed.get('missing'),null);
});
test('packed nutrient adapter rejects malformed dictionaries and pairs',()=>{
 const row=food('a','A',{});for(const [nutrientIds,values] of [[undefined,[0,1]],[['protein','protein'],[0,1]],[['protein'],[0]],[['protein'],[1,3]],[['protein'],[-1,3]],[['protein'],[0,1,0,2]],[['protein'],['0',2]]])assert.throws(()=>createInsightCatalog([{...row,nutrients:values}],{nutrientIds}));
});
