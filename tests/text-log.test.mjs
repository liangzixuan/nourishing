import test from 'node:test';
import assert from 'node:assert/strict';
import {initialState,act} from '../server/domain/workspace.mjs';
import {parseTextFoodLog,applyTextLog} from '../server/text-log.mjs';
import {parseTextLog} from '../server/domain/text-log.mjs';
import {recipeImportCatalog} from '../server/recipe-import.mjs';
import {applyWorkspaceCommand,captureActionFoods} from '../server/workspace-commands.mjs';

const catalog={get:()=>null,projectInsights:()=>[]};
function fixture(){const state=initialState();state.foods=[];const id=act(state,'food.save',{name:'Rice, cooked',serving:'100 g',grams:100,nutrients:{calories:130}}).id;return {state,id};}
test('text parser retains source line matching and exact quantities without mutating diary',()=>{
 const {state,id}=fixture(),before=structuredClone(state),input={originalText:'150 g cooked rice\n200 g cooked rice'};
 const view=parseTextFoodLog(state,catalog,input),source=parseTextLog(input,{foodCatalog:recipeImportCatalog(catalog),foods:state.foods});
 assert.deepEqual(state,before);assert.equal(view.rows.length,2);assert.equal(view.rows[0].foodId,id);assert.deepEqual(view.rows[0].quantity,{quantity:150,unit:'g'});assert.deepEqual(view.rows[1].quantity,{quantity:200,unit:'g'});
 assert.deepEqual(view.rows.map(row=>row.candidates),source.rows.map(row=>row.candidates));assert.match(view.revision,/^[a-f0-9]{64}$/);
 const rows=view.rows.map(row=>({foodId:row.foodId,...row.quantity}));applyWorkspaceCommand(state,captureActionFoods(state,{type:'meal.log',payload:{date:'2026-11-15',time:'12:00',group:'Lunch',rows}},new Map()));assert.equal(state.entries.length,2);assert.equal(state.entries[0].quantity,150);assert.equal(state.entries[0].unit,'g');
});
test('missing quantities, alternatives and unsupported volume stay unresolved',()=>{
 const {state}=fixture();for(const originalText of ['cooked rice','1 cup cooked rice','2 servings cooked rice','100 g cooked rice or pasta']){const view=parseTextFoodLog(state,catalog,{originalText});assert.ok(!view.rows[0].foodId||view.rows[0].quantity===null,originalText);}
});
test('text limits, blank input and unsupported request metadata fail closed',()=>{
 const {state}=fixture();for(const input of [{originalText:''},{originalText:'x'.repeat(10001)},{originalText:Array(31).fill('1 g rice').join('\n')},{originalText:'100 g rice',provider:'Codex CLI'},null])assert.throws(()=>parseTextFoodLog(state,catalog,input),error=>error.status===400);
});
test('public catalog matches retain source facts and are captured only when logging',()=>{
 const state=initialState();state.foods=[];const food={id:'usda:fixture:12',name:'Milk',serving:'100 g',grams:100,portions:[{id:'cup',label:'1 cup',grams:244}],nutrients:{calories:61},readOnly:true,sample:false,source:{name:'USDA fixture',datasetId:'fixture',fdcId:12}};
 const publicCatalog={get:id=>id===food.id?food:null,projectInsights:()=>[food]},result=parseTextFoodLog(state,publicCatalog,{originalText:'100 g milk'});assert.equal(state.foods.length,0);assert.equal(result.rows[0].foodId,food.id);assert.ok(result.rows[0].quantity);
 const action=captureActionFoods(state,{type:'text.log',payload:{originalText:result.originalText,date:'2026-11-15',time:'12:00',group:'Lunch',rows:[{foodId:food.id,...result.rows[0].quantity,lineIndex:0,confirmed:true}]}},new Map([[food.id,food]]));applyWorkspaceCommand(state,action);assert.equal(state.entries.length,1);assert.deepEqual(state.foods[0].source,food.source);assert.equal(state.foods[0].readOnly,true);assert.equal(state.entries[0].textReview.rows[0].selection.kind,'catalog');
});
test('reviewed text save retains literal source, confirmed edits and manual additions',()=>{
 const {state,id}=fixture(),originalText='150 g cooked rice\n200 g cooked rice',input={originalText,date:'2026-11-15',time:'12:00',group:'Lunch',rows:[{foodId:id,quantity:175,unit:'g',lineIndex:0,confirmed:true},{foodId:id,amount:1,confirmed:true}]};
 const result=applyTextLog(state,input);assert.equal(result.entryIds.length,2);const first=state.entries[0].textReview;assert.equal(first.originalText,originalText);assert.equal(first.observations[0].phrase,'150 g cooked rice');assert.deepEqual(first.observations[0].override,{quantity:175,unit:'g'});assert.equal(first.rows[0].quantity,175);assert.equal(first.rows[0].confirmed,true);assert.equal(state.entries[1].textReview.observations[0].phrase,null);
});
test('invalid text provenance and quantity reject atomically',()=>{
 const {state,id}=fixture(),base={originalText:'150 g cooked rice\n200 g cooked rice',date:'2026-11-15',time:'12:00',group:'Lunch'},row={foodId:id,quantity:150,unit:'g',lineIndex:0,confirmed:true},before=structuredClone(state);
 for(const rows of [[{...row,confirmed:false}],[{...row,lineIndex:2}],[row,row],[{...row,lineIndex:1},row],[row,{...row,lineIndex:1,unit:'cups'}],[{...row,provider:'AI'}]]){assert.throws(()=>applyTextLog(state,{...base,rows}),error=>error.status===400);assert.deepEqual(state,before);}
});
