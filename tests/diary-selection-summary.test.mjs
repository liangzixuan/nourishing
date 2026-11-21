import test from 'node:test';
import assert from 'node:assert/strict';
import {initialState,act} from '../server/domain/workspace.mjs';
import {calculateSummary,calculateSelectionNutrition} from '../server/domain/nutrition.mjs';
import {diaryToolsReview} from '../server/diary-tools.mjs';
import {digest} from '../server/data-codec.mjs';

test('Selected summary uses canonical intake with full-day targets and leaves nonfood day consumers unchanged',()=>{
 const state=initialState(),date='2026-11-16';state.foods=[{id:'zero',name:'Zero protein',grams:100,nutrients:{calories:100,protein:0}},{id:'unknown',name:'Unknown protein',grams:100,nutrients:{calories:200}}];
 for(const foodId of ['zero','unknown'])act(state,'entry.add',{foodId,date,amount:1,group:'Lunch'});
 act(state,'exercise.add',{date,name:'Walk',duration:30,calories:80});act(state,'note.add',{date,text:'Note'});act(state,'water.add',{date,amount:250});
 const before=structuredClone(state),day=calculateSummary(state,date),refs=state.entries.map(row=>({collection:'entries',id:row.id}));refs.push({collection:'notes',id:state.notes[0].id});
 const review=records=>diaryToolsReview(state,{operation:'nutrition',revision:digest(state),selection:{date,scope:'selected',records}});
 const result=review(refs),selected=calculateSelectionNutrition(state,date,state.entries.filter(row=>row.kind!=='exercise').map(row=>row.id));assert.deepEqual(result.facts,selected);assert.deepEqual(result.facts.targets,day.targets);assert.equal(result.facts.totals.protein,0);assert.equal(result.facts.nutrientCoverage.protein.known,1);assert.equal(result.facts.nutrientCoverage.protein.total,2);
 assert.deepEqual(result.chartSummary.scores,day.scores);assert.deepEqual(result.chartSummary.hydration,day.hydration);assert.equal(result.chartSummary.energy.expenditure,day.energy.expenditure);assert.equal(result.chartSummary.energy.target,day.energy.target);assert.equal(result.chartSummary.energy.remaining,day.energy.target-selected.totals.calories);
 assert.equal(review([refs[0]]).facts.totals.protein,0);assert.equal(review([refs[1]]).facts.totals.protein,null);
 for(const records of [[],refs.slice(2)]){const fallback=review(records);assert.deepEqual(fallback.facts,day);assert.deepEqual(fallback.chartSummary,day);}
 assert.deepEqual(diaryToolsReview(state,{operation:'nutrition',revision:'old',selection:{date,scope:'selected',records:refs}}),result);assert.throws(()=>review([{collection:'entries',id:'foreign'}]),{status:409});assert.throws(()=>review([refs[0],refs[0]]),{status:400});assert.deepEqual(state,before);
});
