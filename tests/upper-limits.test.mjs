import test from 'node:test';
import assert from 'node:assert/strict';
import {initialState,act} from '../server/domain/workspace.mjs';
import {NUTRIENT_REFERENCE_SET} from '../server/domain/nutrient-references.mjs';
import {NUTRIENT_UPPER_LIMIT_SET} from '../server/domain/nutrient-upper-limits.mjs';
import {targetPolicyView,previewTargetPolicy} from '../server/target-policy-view.mjs';
import {prepareTargetPolicyCommand} from '../server/target-policy-commands.mjs';
const date='2026-11-16',context={today:date},policy=nutrients=>({version:1,referenceSet:NUTRIENT_UPPER_LIMIT_SET,nutrients});
function apply(state,p){const action={type:'targetPolicy.upperLimits',payload:{policy:p}},before=structuredClone(state),preview=previewTargetPolicy(state,{date,...action},context);assert.deepEqual(state,before);const prepared=prepareTargetPolicyCommand(state,action);act(state,prepared.type,prepared.payload);assert.deepEqual(targetPolicyView(state,date,context),preview.view);return preview.view.upperLimits;}
test('population upper limits retain unknown source forms, custom zero/null maxima and other policy owners',()=>{
 const s=initialState();let v=apply(s,policy(['calcium','magnesium','vitaminK']));assert.equal(v.projection.status,'profile-required');assert.equal(v.projection.references[0].maximum,null);
 act(s,'settings.save',{nutrientReferences:{version:1,referenceSet:NUTRIENT_REFERENCE_SET,birthDate:'1990-01-01',sex:'male',lifeStage:'standard',nutrients:['calcium']},nutrientDisplay:{version:1,hidden:['ash'],maximums:{calcium:0,iron:null}}});const before=structuredClone(s.settings);
 v=apply(s,policy(['calcium','iron','magnesium','vitaminK']));assert.equal(v.projection.status,'known');assert.equal(v.summary.nutrientDisplay.thresholds.calcium.maximum,0);assert.equal(v.summary.nutrientDisplay.thresholds.iron,undefined);assert.equal(v.projection.references.find(r=>r.id==='vitaminK').status,'not-determined');assert.equal(v.summary.nutrientDisplay.thresholds.magnesium.status,'unknown');assert.equal(v.summary.nutrientDisplay.thresholds.magnesium.comparisonSupported,false);
 v=apply(s,null);assert.equal(v.projection.status,'disabled');assert.equal(v.summary.nutrientDisplay.thresholds.calcium.maximum,0);assert.deepEqual(s.settings.nutrientReferences,before.nutrientReferences);assert.deepEqual(s.settings.nutrientDisplay,before.nutrientDisplay);assert.deepEqual(s.settings.targets,before.targets);
});
test('Upper Limits rejects injected fields and preserves mode reconciliation and empty selection',()=>{
 const s=initialState();s.settings.nutrientTargetModes={version:1,nutrients:{calcium:{daily:'custom',maximum:'reference'}}};let v=targetPolicyView(s,date,context).upperLimits;assert.ok(v.policy.nutrients.includes('calcium'));v=apply(s,policy([]));assert.deepEqual(v.projection.selected,[]);assert.equal(s.settings.nutrientTargetModes.nutrients.calcium.maximum,undefined);assert.equal(s.settings.nutrientTargetModes.nutrients.calcium.daily,'custom');
 const before=structuredClone(s);for(const p of [undefined,{...policy(['calcium']),owner:'other'},policy(['calcium','calcium']),policy(['unknown'])]){assert.throws(()=>apply(s,p));assert.deepEqual(s,before);}
});
