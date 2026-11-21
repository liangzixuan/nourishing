import {previewLibraryEdit} from '../server/library-edit.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {initialState} from '../server/domain/workspace.mjs';
import {applyWorkspaceCommand,previewLibrary,captureActionFoods} from '../server/workspace-commands.mjs';
import {entryFacts} from '../server/domain/nutrition.mjs';
import {libraryView,libraryItem} from '../server/library-view.mjs';
const run=(s,type,payload)=>applyWorkspaceCommand(s,{type,payload});
const edit=(state,kind,draft)=>{const {reviewToken}=previewLibraryEdit(state,{kind,draft},{owner:'fixture'});return applyWorkspaceCommand(state,{type:'library.edit',payload:{kind,draft,mode:'update'}},{owner:'fixture'});};
const draft={name:'Test grain',grams:100,serving:'100 g',nutrients:{calories:200,protein:10}};
test('custom food, recipe and meal use the original source quantities in the diary',()=>{
 const s=initialState();const f=run(s,'food.save',draft);assert.ok(f.id);
 const r=run(s,'recipe.save',{name:'Two servings',servings:2,ingredients:[{foodId:f.id,quantity:150,unit:'g'}]});
 const m=run(s,'meal.save',{name:'Lunch plate',items:[{recipeId:r.id,amount:1},{foodId:f.id,quantity:50,unit:'g'}]});
 run(s,'entry.add',{mealId:m.id,date:'2026-11-14',group:'Lunch',amount:1});
 assert.equal(entryFacts(s,s.entries[0]).nutrients.calories,250);
 assert.equal(libraryView(s).items.length,3);
 assert.ok(libraryItem(s,'recipe',s.recipes[0]).options.some(([unit])=>unit==='g'));
 assert.ok(!libraryItem(s,'meal',s.meals[0]).options.some(([unit])=>unit==='g'));
 assert.throws(()=>libraryItem(s,'meal',s.meals[0],{mealId:'foreign'}));
 assert.equal(s.foods[0].nutrients.fat,undefined);
 assert.throws(()=>run(s,'food.delete',{id:f.id}));
 run(s,'entry.delete',{id:s.entries[0].id});run(s,'meal.delete',{id:m.id});run(s,'recipe.delete',{id:r.id});run(s,'food.delete',{id:f.id});assert.equal(s.foods.length,0);
});
test('partial edits retain saved metadata and reject read-only foods, cycles and foreign references',()=>{
 const s=initialState(),f=run(s,'food.save',draft);s.foods[0].notes='Keep this note';
 edit(s,'food',{id:f.id,name:'Renamed'});assert.equal(s.foods[0].notes,'Keep this note');assert.equal(s.foods[0].nutrients.calories,200);
 s.foods[0].readOnly=true;assert.throws(()=>edit(s,'food',{id:f.id,name:'Tampered'}));
 assert.throws(()=>run(s,'meal.save',{name:'Foreign',items:[{foodId:'other-account-food',amount:1}]}));
 const r=run(s,'recipe.save',{name:'Recipe',servings:2,ingredients:[{foodId:f.id,amount:1}]});
 assert.throws(()=>edit(s,'recipe',{id:r.id,ingredients:[{recipeId:r.id,amount:1}]}));
 for(const extra of [{ownerId:'someone'},{readOnly:false},{source:{name:'USDA'}},{photoReview:{}}])assert.throws(()=>run(s,'food.save',{...draft,...extra}));
});
test('library preview preserves saved data and retains unknowns',()=>{
 const s=initialState(),before=JSON.stringify(s);
 const review=previewLibrary(s,{kind:'food',draft,date:'2026-11-14'});
 assert.equal(review.nutrition.totals.calories,200);assert.equal(JSON.stringify(s),before);
 assert.throws(()=>previewLibrary(s,{kind:'food',draft:{...draft,nutrients:{calories:-1}},date:'2026-11-14'}));
});
test('catalog ingredients are captured and remapped by the server, never supplied by clients',()=>{
 const s=initialState(),action={type:'recipe.save',payload:{name:'Rice',servings:1,ingredients:[{foodId:'catalog:rice',quantity:50,unit:'g'}]}};
 const prepared=captureActionFoods(s,action,new Map([['catalog:rice',{...draft,id:'usda:fixture:1',readOnly:true,sample:false,source:{name:'USDA fixture',datasetId:'fixture',fdcId:1}}]]));
 const result=run(s,prepared.type,prepared.payload);assert.equal(s.foods.length,1);assert.equal(s.recipes[0].ingredients[0].foodId,s.foods[0].id);assert.ok(result.id);
 assert.throws(()=>run(s,'recipe.save',{...action.payload,ingredients:[{foodId:'catalog:rice',amount:1,nutrients:{calories:1}}]}));
 assert.throws(()=>run(s,'recipe.save',{...action.payload,ingredients:[]}),error=>error.code===400);
 assert.throws(()=>run(s,'toString',{}),error=>error.code===400);
});
