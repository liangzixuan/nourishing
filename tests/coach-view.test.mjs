import test from 'node:test';
import assert from 'node:assert/strict';
import {initialState,act} from '../server/domain/workspace.mjs';
import {coachView,coachAnswer,applyCoachCommand} from '../server/coach-view.mjs';
const date='2026-11-15';
const ask=(state,question,extra={})=>coachAnswer(state,{date,question,preferencesRevision:coachView(state).preferencesRevision,...extra});
function fixture(){const state=initialState();act(state,'entry.add',{date,amount:1,name:'Private meal',nutrients:{calories:600,protein:30,carbs:80,fat:20,fiber:10,sugarAlcohol:0}});return state;}

test('Coach retains source unknown, completed-empty and partial measurement semantics without changing records',()=>{
 const state=initialState(),before=structuredClone(state);assert.equal(ask(state,'Protein').facts[0].value,null);assert.deepEqual(state,before);
 state.settings.completedDays=[date];assert.equal(ask(state,'Protein').facts[0].value,0);
 const partial=fixture();act(partial,'entry.add',{date,amount:1,name:'Unknown protein',nutrients:{calories:100}});const result=ask(partial,'Protein');assert.equal(result.facts[0].value,30);assert.deepEqual(result.facts[0].coverage,{known:1,total:2,complete:false});assert.ok(result.limitations.some(text=>text.includes('Unknown measurements are not zero')));
 assert.equal(JSON.stringify(result).includes('Private meal'),false);assert.equal(JSON.stringify(result).includes('Codex'),false);
});

test('Coach uses the selected carbohydrate definition, saved energy unit, and source water-only path',()=>{
 const state=fixture();state.settings.carbohydratePolicy={mode:'net',netExcluded:['fiber','sugarAlcohol']};state.settings.energyUnit='kJ';
 const carbs=ask(state,'Carbs');assert.equal(carbs.facts[0].kind,'tracked-carbohydrate');assert.equal(carbs.facts[0].value,70);assert.equal(carbs.facts[0].definition.mode,'net');
 const energy=ask(state,'Energy');assert.equal(energy.facts[0].value,600);assert.equal(energy.presentation.energyUnit,'kJ');assert.ok(energy.observations[0].text.includes('2,510.4 kJ'));
 state.biometrics.push({id:'water',date,type:'Water',unit:'mL',value:350});const water=ask(state,'Water');assert.equal(water.facts.length,1);assert.equal(water.facts[0].kind,'recorded-water');assert.equal(water.facts[0].value,350);
 state.settings.appLanguage='fr';assert.equal(ask(state,'protéines').facts[0].nutrient,'protein');
});

test('Coach preference command preserves source revision conflicts and does not change nutrient targets',()=>{
 const state=fixture(),old=coachView(state),targets=structuredClone(state.settings.targets),preferences={goals:'Strength, Custom goal',dietaryPreferences:'Vegetarian',notes:'My notes'};
 assert.equal(applyCoachCommand(state,{type:'unrelated',payload:{}}).handled,false);
 const saved=applyCoachCommand(state,{type:'coach.preferences',payload:{revision:old.preferencesRevision,preferences}});assert.equal(saved.handled,true);assert.deepEqual(coachView(state).preferences,preferences);assert.deepEqual(state.settings.targets,targets);
 assert.throws(()=>coachAnswer(state,{date,question:'Protein',preferencesRevision:old.preferencesRevision}),{code:409});
 assert.throws(()=>applyCoachCommand(state,{type:'coach.preferences',payload:{revision:old.preferencesRevision,preferences:{...preferences,notes:'Stale edit'}}}),{status:409});
 assert.equal(ask(state,'Protein').facts[0].value,30);
});

test('Coach validates date, question, and fields before arithmetic',()=>{
 const state=fixture();for(const extra of [{date:'2026-02-30'},{question:''},{question:'x'.repeat(2001)},{ownerId:'other'},{energyUnit:'kcal'}])assert.throws(()=>ask(state,'Protein',extra),{code:400});
});
