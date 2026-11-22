import test from 'node:test';
import assert from 'node:assert/strict';
import {initialState,act} from '../server/domain/workspace.mjs';
import {createNutrientDetailView} from '../server/domain/nutrient-detail-view.mjs';
import {createReportNutrientDetail} from '../server/domain/report-nutrient-detail.mjs';
import {NUTRIENT_REFERENCE_SET} from '../server/domain/nutrient-references.mjs';
import {nutrientDetail,reportNutrientDetail} from '../server/nutrient-detail.mjs';
import {reportView} from '../server/nutrition-views.mjs';
const date='2026-11-14',clock={now:new Date('2026-11-15T02:00:00Z'),timeZone:'America/Chicago'};
const options={from:'2026-11-13',to:date,dayFilter:'all',includeToday:true,includeSupplements:true};
function fixture(){const state=initialState();state.settings.energyUnit='kJ';state.foods.push({id:'food',name:'Rice',serving:'100 g',grams:100,nutrients:{calories:200,protein:10,water:50},classification:'food',source:{name:'Fixture',attribution:'Fixture attribution'}},{id:'unknown',name:'Unmeasured',serving:'1 serving',nutrients:{}},{id:'supplement',name:'Supplement',serving:'1 serving',nutrients:{calories:100,protein:20},classification:'supplement'});for(const foodId of ['food','unknown','supplement'])act(state,'entry.add',{date,foodId,amount:1,group:'Lunch'});act(state,'entry.add',{date:'2026-11-13',foodId:'food',amount:2,group:'Dinner'});act(state,'water.add',{date,amount:250});return state;}
test('day and selection detail retain source amounts, unknowns, hydration and attribution without mutating state',()=>{
 const state=fixture(),before=structuredClone(state),input={date,nutrient:'calories',entryIds:null},actual=nutrientDetail(state,input),{revision,language,energyUnit,...source}=actual;
 assert.deepEqual({...source,energyUnit},createNutrientDetailView(state,input));assert.equal(energyUnit,'kJ');assert.equal(actual.contributions.target.value,300);assert.equal(actual.contributions.entries.find(row=>row.name==='Unmeasured').value,null);assert.deepEqual(actual.contributions.attributions,['Fixture attribution']);
 const selected=nutrientDetail(state,{...input,nutrient:'water',entryIds:[state.entries[0].id]});assert.equal(selected.contributions.target.value,50);assert.equal(selected.contributions.entries.some(row=>row.kind==='water'),false);
 const dayWater=nutrientDetail(state,{...input,nutrient:'water'});assert.equal(dayWater.contributions.entries.find(row=>row.kind==='water').value,250);
 assert.deepEqual(state,before);
});
test('report detail keeps source filtered averages, known-day denominators, timezone and canonical kcal facts',()=>{
 const state=fixture(),input={nutrient:'calories',options:{...options,includeSupplements:false}},actual=reportNutrientDetail(state,input,clock),{revision,energyUnit,language,...source}=actual;
 assert.deepEqual(source,createReportNutrientDetail(state,input,clock));assert.equal(actual.detail.summary.mean,300);assert.equal(actual.detail.denominator,2);assert.equal(actual.detail.entries[0].value,400);assert.equal(actual.detail.entries[0].mean,200);assert.equal(actual.detail.unknownSources,1);assert.ok(!actual.detail.entries.some(row=>row.name==='Supplement'));
 assert.equal(reportNutrientDetail(state,{...input,options:{...input.options,includeToday:false}},clock).detail.summary.mean,400);
 assert.equal(reportNutrientDetail(state,{...input,options:{...input.options,dayFilter:'complete'}},clock).detail.summary.mean,null);
 const view=reportView(state,input.options,clock);assert.equal(view.energyUnit,'kJ');assert.equal(view.report.nutrients.find(row=>row.id==='calories').mean,300);
});
test('detail boundaries reject foreign records, unknown nutrients and extra caller identity; empty stays unknown',()=>{
 const state=fixture(),input={date,nutrient:'calories',entryIds:null};for(const body of [{...input,ownerId:'other'},{...input,nutrient:'fake'},{...input,entryIds:['foreign']},{...input,entryIds:[state.entries.at(-1).id]}])assert.throws(()=>nutrientDetail(state,body),{code:400});
 assert.throws(()=>reportNutrientDetail(state,{nutrient:'calories',options,accountId:'other'},clock),{code:400});assert.equal(nutrientDetail(initialState(),input).contributions.target.value,null);
 act(state,'day.complete',{date:'2026-11-12',completed:true});assert.equal(nutrientDetail(state,{...input,date:'2026-11-12'}).contributions.target.value,0);
});
test('net carbohydrate details use the source definition and preserve unknown excluded components',()=>{
 const state=initialState();state.settings.carbohydratePolicy={mode:'net',netExcluded:['fiber']};state.foods.push({id:'known',name:'Known',serving:'1 serving',nutrients:{carbs:20,fiber:5}},{id:'partial',name:'Unknown fiber',serving:'1 serving',nutrients:{carbs:10}});for(const foodId of ['known','partial'])act(state,'entry.add',{date,foodId,amount:1});
 const input={date,nutrient:'netCarbohydrate',entryIds:null},day=nutrientDetail(state,input);assert.deepEqual(day.contributions,createNutrientDetailView(state,input).contributions);assert.equal(day.contributions.target.value,15);assert.equal(day.contributions.target.status,'partial');assert.equal(day.contributions.entries[1].value,null);
 const report=reportNutrientDetail(state,{nutrient:'netCarbohydrate',options:{...options,from:date}},clock);assert.equal(report.detail.summary.mean,15);assert.equal(report.detail.unknownSources,1);
});

test('report detail resolves B1 target controls at range end independently of measured intake',()=>{
 const state=initialState(),input={nutrient:'thiamin',options};
 state.settings.nutrientReferences={version:1,referenceSet:NUTRIENT_REFERENCE_SET,birthDate:'1980-01-01',sex:'female',lifeStage:'standard',nutrients:['thiamin']};
 const {detail}=reportNutrientDetail(state,input,clock);
 assert.equal(detail.targetDate,options.to);
 assert.deepEqual(detail.controls,nutrientDetail(state,{date:detail.targetDate,nutrient:input.nutrient,entryIds:null}).controls);
 assert.equal(detail.controls.dailyTarget.reference.kind,'RDA');assert.equal(detail.controls.dailyTarget.effective,1.1);
 assert.equal(detail.summary.mean,null);assert.equal(detail.summary.meanTarget,null);assert.equal(detail.controls.maximum.effective,null);
});
