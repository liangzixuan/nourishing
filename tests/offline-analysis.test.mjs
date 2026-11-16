import test from 'node:test';
import assert from 'node:assert/strict';
import {load} from 'cheerio';
import {initialState,act} from '../server/domain/workspace.mjs';
import {offlineSnapshot} from '../server/offline.mjs';
import {calculateSummary} from '../public/offline-model.js';
import {createOfflineSelection} from '../public/offline-selection.js';
import {renderOfflineAnalysis} from '../public/offline-analysis.js';
import {renderOfflineNutrition} from '../public/offline-nutrition.js';
const date='2026-11-15';
function fixture(){const state=initialState();state.foods=[];const food=act(state,'food.save',{name:'Oats',serving:'100 g',grams:100,nutrients:{calories:100,protein:5,sodium:10,potassium:40}});for(const [group,amount]of [['Lunch',1],['Dinner',2]])act(state,'entry.add',{foodId:food.id,date,group,amount});return {state,snapshot:offlineSnapshot(state,{ownerId:'one',generation:'first',now:new Date(date+'T12:00:00Z')}),ownerId:'one',pending:[]};}
test('offline selection changes intake and balances while day scores, completeness and energy stay unchanged',()=>{
 const copy=fixture(),state=copy.snapshot.state,before=JSON.stringify(copy),summary=calculateSummary(state,date),selection=createOfflineSelection();selection.capture(copy,state,date,summary);selection.toggle();selection.select(state.entries[0].id,true);const selected=selection.capture(copy,state,date,summary);
 assert.equal(summary.totals.calories,300);assert.equal(selected.nutrition.totals.calories,100);assert.deepEqual(selected.nutrition.targets,summary.targets);
 const whole=load(renderOfflineAnalysis(summary,summary,state.settings)),part=load(renderOfflineAnalysis(summary,selected.nutrition,state.settings));
 assert.equal(part('[data-offline-panel=scores]').html(),whole('[data-offline-panel=scores]').html());assert.equal(part('[data-offline-panel=completeness]').html(),whole('[data-offline-panel=completeness]').html());assert.match(part('[data-balance-scope]').text(),/1 selected/);
 const nutrients=load(renderOfflineNutrition(selected.nutrition,state.settings,'en',summary));assert.match(nutrients('.offline-energy').text(),/300 kcal/);assert.match(nutrients('[data-nutrient=calories]').text(),/100 kcal/);assert.equal(JSON.stringify(copy),before);
 for(const language of ['fr','de','pt-BR']){const html=renderOfflineAnalysis(summary,selected.nutrition,state.settings,language);assert.ok(!html.includes('offlineAnalysis.'));assert.ok(!html.includes('offlineDiary.'));}
 const hidden=load(renderOfflineAnalysis(summary,summary,{...state.settings,showScores:false}));assert.equal(hidden('[data-offline-panel=scores]').length,0);assert.equal(hidden('[data-offline-panel=completeness]').length,1);
});
test('temporary selection prunes hidden/deleted records and resets on refresh, date, account and generation changes',()=>{
 const copy=fixture(),state=copy.snapshot.state,selection=createOfflineSelection();const read=day=>selection.capture(copy,state,day??date,calculateSummary(state,day??date));
 let view=read();selection.toggle();selection.group(view.rows,'Dinner');assert.equal(read().nutrition.totals.calories,200);
 state.settings.diaryGroups={version:1,showGroups:true,hiddenGroups:['Dinner']};assert.equal(read().ids.size,0);assert.deepEqual(read().groups,['Lunch']);
 const id=state.entries[0].id;
 for(const mutate of [()=>{copy.snapshot.savedAt='2026-11-15T13:00:00Z';},()=>{copy.ownerId='two';},()=>{copy.snapshot.identity.generation='second';}]){selection.select(id,true);assert.equal(read().ids.size,1);mutate();assert.equal(read().ids.size,0);assert.equal(read().enabled,false);}
 selection.select(id,true);assert.equal(read('2026-11-14').ids.size,0);read();selection.select(id,true);state.entries=[];assert.equal(read().ids.size,0);
});
