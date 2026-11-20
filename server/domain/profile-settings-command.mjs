import {parseProfileDemographics} from './profile-demographics.mjs';
import {date as calendarDate} from './calendar.mjs';
import {parseEnergyPolicy,parseEnergyExpenditure} from './energy-policy.mjs';
import {parseNutrientReferencePolicy} from './nutrient-references.mjs';
import {parseBodyCompositionPolicy} from './body-composition.mjs';
import {parseBiometricFields} from './diary-record-fields.mjs';

export const profileSettingsCommandFields={
 'profileSettings.demographic':['field','value','date'],
 'profileSettings.measurement':['kind','value','unit','date','time'],
 'profileSettings.energy':['resting','baseline'],
 'profileSettings.references':['policy'],
 'profileSettings.body':['policy'],
};
const fail=message=>{throw Object.assign(Error(message),{status:400});};

/** Narrow edits retain the settings owned by the other target editors. */
export function prepareProfileSettingsCommand(state,action){
 if(!Object.hasOwn(profileSettingsCommandFields,action.type)||action.type==='profileSettings.measurement')return action;
 const keys=profileSettingsCommandFields[action.type],p=action.payload;
 if(!p||typeof p!=='object'||Array.isArray(p)||Object.keys(p).length!==keys.length||keys.some(key=>!Object.hasOwn(p,key)))fail('Choose the required profile settings only.');
 let patch;
 if(action.type==='profileSettings.demographic'){
  calendarDate(p.date);if(!['birthDate','sex'].includes(p.field))fail('Choose birthday or sex.');
  const personal=parseProfileDemographics({...state.settings.profileDemographics,[p.field]:p.value});
  if(personal.birthDate&&personal.birthDate>p.date)fail('Birthday cannot be in the future.');
  patch={profileDemographics:personal};
  const energy=parseEnergyPolicy(state.settings.energyPolicy);
  if(energy&&energy.resting.mode!=='custom'){const resting={...energy.resting,[p.field]:p.value};if(p.field==='birthDate'){resting.mode='mifflin-st-jeor-birthday';delete resting.age;}patch.energyPolicy=parseEnergyPolicy({...energy,resting});}
  if(state.settings.nutrientReferences)patch.nutrientReferences=parseNutrientReferencePolicy({...state.settings.nutrientReferences,[p.field]:p.value});
 }else if(action.type==='profileSettings.energy'){
  const previous=parseEnergyPolicy(state.settings.energyPolicy);
  const expenditure=parseEnergyExpenditure({resting:p.resting,baseline:p.baseline,activity:previous?.activity??{mode:'manual'},thermicEffect:previous?.thermicEffect??false});
  patch={energyPolicy:parseEnergyPolicy({version:1,...expenditure,target:previous?.target??{mode:'calculated',adjustmentKcal:0,includeAboveBaseline:false},display:previous?.display??'remaining'})};
 }else if(action.type==='profileSettings.references')patch={nutrientReferences:parseNutrientReferencePolicy(p.policy)};
 else patch={bodyComposition:parseBodyCompositionPolicy(p.policy)};
 return {type:'settings.save',payload:patch};
}

/** Validate the selected series and reading before either can change. */
export function prepareProfileMeasurement(state,payload){
 const p=payload,keys=profileSettingsCommandFields['profileSettings.measurement'];
 if(!p||typeof p!=='object'||Array.isArray(p)||Object.keys(p).length!==keys.length||keys.some(k=>!Object.hasOwn(p,k)))fail('Choose the required profile fields only.');
 const units={weight:['kg','lb','lbs','st'],height:['cm','in','m','ft'],bodyFat:['%']};
 if(!Object.hasOwn(units,p.kind)||!units[p.kind].includes(p.unit)||typeof p.value!=='number'||!Number.isFinite(p.value)||p.value<(p.kind==='bodyFat'?0:Number.MIN_VALUE)||p.value>(p.kind==='bodyFat'?100:1000000))fail('Enter a valid measurement and unit.');
 calendarDate(p.date);
 const previous=parseBodyCompositionPolicy(state.settings.bodyComposition),key=p.kind+'Metric',type=previous?.[key]?.type??{weight:'Weight',height:'Height',bodyFat:'Body fat'}[p.kind];
 const policy=parseBodyCompositionPolicy({...previous??{version:2,weightMetric:null,heightMetric:null,bodyFatMetric:null,useForResting:false,useHeightForResting:false,useForKeto:false},[key]:{kind:'biometric',type,unit:p.unit}});
 return {record:parseBiometricFields({date:p.date,time:p.time,type,unit:p.unit,value:p.value}),bodyComposition:policy};
}
/** Local state uses the same parsed facts as the server command adapter. */
export function applyProfileSettingsProjection(state,action,id){
 if(action.type==='profileSettings.measurement'){
  const prepared=prepareProfileMeasurement(state,action.payload),record={...prepared.record,id};
  state.settings.bodyComposition=prepared.bodyComposition;
  state.biometrics??=[];const index=state.biometrics.findIndex(row=>row.id===id);
  if(index<0)state.biometrics.push(record);else state.biometrics[index]=record;
  return record;
 }
 const prepared=prepareProfileSettingsCommand(state,action);
 if(prepared.type!=='settings.save')return;
 for(const [key,value]of Object.entries(prepared.payload)){if(value===null)delete state.settings[key];else state.settings[key]=value;}
}
