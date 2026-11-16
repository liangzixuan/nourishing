import test from 'node:test';
import assert from 'node:assert/strict';
import {initialState,act} from '../server/domain/workspace.mjs';
import {offlineSnapshot} from '../server/offline.mjs';
import {calculateSummary} from '../server/domain/nutrition.mjs';
import {renderOfflineNutrition,renderOfflineMacros} from '../public/offline-nutrition.js';
import {offlineText,offlineLanguages} from '../public/offline-language.js';
const date='2026-11-15';
test('offline nutrition follows source visibility, unknown measurements, kJ and saved language',()=>{
 const state=initialState();state.foods=[];const food=act(state,'food.save',{name:'Saved meal',serving:'100 g',grams:100,nutrients:{calories:100,protein:5}});act(state,'entry.add',{foodId:food.id,date,group:'Lunch',amount:2});
 Object.assign(state.settings,{appLanguage:'fr',energyUnit:'kJ',showEnergy:false,showMacros:false,fontScale:1.1,matchDeviceFontSize:true,nutrientTargetModes:{version:1,nutrients:{}}});
 const copy=offlineSnapshot(state,{ownerId:'fixture',generation:'generation'});for(const key of ['appLanguage','fontScale','matchDeviceFontSize','showEnergy','showMacros','nutrientTargetModes'])assert.deepEqual(copy.state.settings[key],state.settings[key]);
 // The display uses the shared source calculation, including recorded unknowns.
 const summary=calculateSummary(state,date),html=renderOfflineNutrition(summary,state.settings,'fr');assert.ok(html.includes('Résumé nutritionnel'));assert.ok(html.includes('Protéines'));assert.ok(!html.includes('class="offline-energy"'));assert.ok(!html.includes('class="offline-macros"'));assert.equal(renderOfflineMacros(summary,state.settings,'fr'),'');assert.match(html,/data-nutrient="calories"[\s\S]*?836,8 kJ/);assert.match(html,/data-nutrient="sodium"[\s\S]*?<td>— mg/);for(const id of summary.nutrientDisplay.hidden)assert.ok(!html.includes(`data-nutrient="${id}"`));
 state.settings.showMacros=true;const macros=renderOfflineMacros(summary,state.settings,'fr');assert.ok(macros.includes('836,8 kJ'));assert.ok(macros.includes('10 g'));
});
test('offline action labels use all source-supported languages without translating records',()=>{
 for(const [language]of offlineLanguages)for(const label of ['Offline diary','Food','Note','Measurement','Energy','Energy unit','New custom measurement','Nutrition summary','Nutrient','Cancel','Retry','Discard']){const text=offlineText(language,label);assert.ok(text&&!text.includes('offline.'));if(language!=='en'&&!['Note','Food','Energy'].includes(label))assert.notEqual(text,label,`${language}: ${label}`);}
 assert.equal(offlineText('fr','My own food name'),'My own food name');
});
