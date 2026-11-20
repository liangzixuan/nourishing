import test from 'node:test';
import assert from 'node:assert/strict';
import {buildLocalDiary} from '../scripts/package-local-diary.mjs';
import {buildLocalSettings} from '../scripts/package-local-settings.mjs';
import {initialState} from '../server/domain/workspace.mjs';
import {profileSettingsView,applyProfileSettingsCommand} from '../server/profile-settings.mjs';
import {createDataRepository} from '../server/data-repository.mjs';
await Promise.all([buildLocalDiary(),buildLocalSettings()]);
const {applyWriteToState}=await import('../public/write-projection.js');
const {projectLocalDiary,projectProfileSettings}=await import('../public/local-diary-projection.js');

test('pending and acknowledged profile edits update canonical diary targets and BMI with receipt identity',()=>{
 const date='2026-11-16',state=initialState(),clock={now:new Date(date+'T18:00:00Z'),timeZone:'UTC'};
 applyProfileSettingsCommand(state,{type:'profileSettings.energy',payload:{resting:{mode:'mifflin-st-jeor-birthday',adultScope:true,sex:'male',birthDate:'1990-11-15',heightCm:180,weightKg:80},baseline:{mode:'multiplier',factor:.375}}});
 state.settings.bodyComposition={version:2,weightMetric:{kind:'biometric',type:'Morning mass',unit:'kg'},heightMetric:{kind:'biometric',type:'Height',unit:'cm'},bodyFatMetric:null,useForResting:true,useHeightForResting:true,useForKeto:false};
 state.biometrics=[{id:'weight',date,time:'08:00',type:'Morning mass',unit:'kg',value:80},{id:'height',date,time:'08:00',type:'Height',unit:'cm',value:180}];
 const repository=createDataRepository({},'fixture');
 const actions=[{type:'profileSettings.demographic',payload:{field:'birthDate',value:'1991-11-15',date}},{type:'profileSettings.demographic',payload:{field:'sex',value:'female',date}},{type:'profileSettings.measurement',payload:{kind:'weight',value:170,unit:'lb',date,time:'12:00'}},{type:'profileSettings.measurement',payload:{kind:'height',value:70,unit:'in',date,time:'12:01'}}];
 for(const [index,action]of actions.entries()){
  const pending=structuredClone(state),acknowledged=structuredClone(state),previous=profileSettingsView(state,date),row={command:{...action,operationId:'pending-'+index}};
  applyWriteToState(pending,row);
  const receipt=applyProfileSettingsCommand(state,action),expected=profileSettingsView(state,date);
  applyWriteToState(acknowledged,row,{item:receipt});
  for(const local of [pending,acknowledged]){
   assert.deepEqual(local.settings,state.settings);
   const projected=projectProfileSettings(local,date,expected.revision);
   assert.equal(projected.profile.bmi,expected.profile.bmi);
   assert.deepEqual(projected.effectiveEnergy,expected.effectiveEnergy);
   const template=repository.diaryFromState(state,date,clock),diary=projectLocalDiary(local,date,template,clock);
   for(const key of ['energy','totals','targets'])assert.deepEqual(diary.summary[key],template.summary[key]);
   assert.deepEqual(diary.presentation,template.presentation);
  }
  assert.notEqual(expected.effectiveEnergy.target,previous.effectiveEnergy.target);
  if(action.type==='profileSettings.measurement'){
   assert.equal(pending.biometrics.at(-1).id,row.command.operationId);
   assert.equal(acknowledged.biometrics.at(-1).id,receipt.id);
   assert.equal(acknowledged.biometrics.length,state.biometrics.length);
   assert.deepEqual({...acknowledged.biometrics.at(-1),_pending:undefined},{...state.biometrics.at(-1),_pending:undefined});
  }
 }
 const before=structuredClone(state);
 assert.throws(()=>applyWriteToState(state,{command:{type:'profileSettings.measurement',payload:{kind:'weight',value:70,unit:'kg',date,time:'bad'}}}),{diaryRecordCode:'time'});
 assert.deepEqual(state,before);
});
