import {createInstance} from 'i18next';
import {digest} from './data-codec.mjs';
import {date as calendarDate} from './domain/calendar.mjs';
import {catalog,calculateSummary,calculateTrends} from './domain/nutrition.mjs';
import {coachPreferencesView,coachPreferenceFacts,changeCoachPreferences} from './domain/coach-preferences.mjs';
import {convertEnergy,parseEnergyUnit} from './domain/energy-units.mjs';
import {localCoachIntent} from './domain/public/local-coach-intent.js';
import {coachMessages} from './domain/public/locales/coach.js';
import {nutrientDisplayName} from './domain/public/nutrient-language.js';

// Same formatter configuration as the source browser helper, using its installed library.
const i18n=createInstance();
i18n.init({initAsync:false,lng:'en',fallbackLng:'en',supportedLngs:Object.keys(coachMessages),resources:Object.fromEntries(Object.entries(coachMessages).map(([language,translation])=>[language,{translation}])),keySeparator:false,nsSeparator:false,returnNull:false,returnEmptyString:false,interpolation:{escapeValue:false}});
const formatMessage=(language,key,values={})=>i18n.t(key,{...values,lng:language});
const displayUnit=(unit,energyUnit)=>unit==='kcal'?energyUnit:unit;
const displayValue=(value,unit,energyUnit)=>unit==='kcal'&&value!==undefined?convertEnergy(value,'kcal',energyUnit):value;
const goals=['Health','Longevity','Weight Loss','Weight Gain','Strength','Build Muscle','Manage Condition','Athletic Performance','Improve Mood','Improve Sleep','Improve Energy','Research','Tracking','Accountability','Motivation','Education','GLP-1 Medication','Support'];
const diets=['None','Carnivore','Keto','Low Carb','Low Fat','Mediterranean','Paleo','Pescatarian','Vegan','Vegetarian','Dairy Free','Gluten Free','Fasting'];
const language=state=>Object.hasOwn(coachMessages,state.settings?.appLanguage)?state.settings.appLanguage:'en';
const invalid=message=>{throw Object.assign(Error(message),{code:400,status:400,publicMessage:message});};
function project(work){try{return work();}catch(error){if([400,409].includes(error.status))throw Object.assign(error,{code:error.status,publicMessage:error.message});throw error;}}

export function coachView(state){return project(()=>{const view=coachPreferencesView(state);return {revision:digest(state),setupComplete:state.settings.coachStarted===true||Boolean(state.settings.coachPreferences),preferencesRevision:view.revision,preferences:view.preferences,choices:{goals,dietaryPreferences:diets},energyUnit:parseEnergyUnit(state.settings.energyUnit??'kcal'),language:language(state)};});}
export const coachCommandFields={'coach.preferences':['preferences','revision']};
export function applyCoachCommand(state,action){if(!Object.hasOwn(coachCommandFields,action.type))return {handled:false};
 const result=changeCoachPreferences(state,action.payload);state.settings.coachStarted=true;return {handled:true,result};}
export function coachAnswer(state,input){return project(()=>{
 if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(key=>!['date','question','preferencesRevision'].includes(key)))invalid('Choose a diary date and question.');
 const date=calendarDate(input.date);
 if(typeof input.question!=='string'||!input.question.trim()||input.question.length>2000)invalid('Enter a question of up to 2,000 characters.');
 if(typeof input.preferencesRevision!=='string')invalid('Reload your Coach preferences.');
 coachPreferenceFacts(state,input.preferencesRevision);
 const question=input.question.trim(),selectedLanguage=language(state),waterOnly=localCoachIntent(question,selectedLanguage).waterOnly;
 const daily=waterOnly?calculateSummary(state,date):calculateTrends(state,date,date)[0];
 const answer=localCoachResult(question,daily,catalog,{waterOnly,energyUnit:parseEnergyUnit(state.settings.energyUnit??'kcal'),language:selectedLanguage});
 // The source local helper already uses one day. No unavailable model action is advertised.
 return {...answer,date,question,mode:'recorded',limitations:answer.limitations.slice(1)};
});}

// Verbatim local result projection from the source Coach; imports are adapted above.
function localCoachResult(question, daily, nutrientCatalog, {waterOnly = false,energyUnit='kcal',language='en'} = {}) {
  parseEnergyUnit(energyUnit);
  const intent=localCoachIntent(question,language),selected=intent.selected,message=(key,values)=>formatMessage(language,'coach.'+key,values),number=value=>Number.isFinite(value)?value.toLocaleString(language,{maximumFractionDigits:2}):message('unknown');
  if(!waterOnly&&selected.includes('carbs')&&!daily.carbohydrate)throw Error(message('freshCarbohydrate'));
  const facts = waterOnly ? [{id: `local:${daily.date}:logged-water`, source: '/api/summary', date: daily.date, kind: 'recorded-water', value: daily.hydration.logged, target: daily.hydration.target, unit: 'mL'}] : selected.map(id => id==='carbs'?{id:`local:${daily.date}:tracked-carbohydrate`,source:'/api/trends',date:daily.date,kind:'tracked-carbohydrate',nutrient:'trackedCarbohydrate',name:daily.carbohydrate.label,...daily.carbohydrate,completeDay:daily.complete,loggedDay:daily.logged}:({id: `local:${daily.date}:${id}`, source: '/api/trends', date: daily.date, nutrient: id, name: nutrientDisplayName({id,name:nutrientCatalog.find(n => n.id === id)?.name || id},language), value: daily.totals[id], target: daily.targets[id], unit: nutrientCatalog.find(n => n.id === id)?.unit || '', coverage: daily.nutrientCoverage[id], completeDay: daily.complete, loggedDay: daily.logged}));
  const observations=facts.map(fact=>{
    const id=fact.kind==='tracked-carbohydrate'&&['total','net'].includes(fact.definition?.mode)?(fact.definition.mode==='net'?'netCarbohydrate':'carbs'):fact.nutrient;
    const values={name:nutrientDisplayName({id,name:fact.name},language),value:number(displayValue(fact.value,fact.unit,energyUnit)),target:number(displayValue(fact.target,fact.unit,energyUnit)),unit:displayUnit(fact.unit,energyUnit)};
    let text=message(waterOnly?'waterFact':'nutrientFact',values);
    if(!waterOnly&&fact.coverage&&!fact.coverage.complete)text+=' '+message('partial',fact.coverage);
    return {text,factIds:[fact.id],...(fact.kind==='tracked-carbohydrate'?{carbohydrateDefinition:fact.definition}:{})};
  });
  if(!waterOnly&&daily.energy&&intent.includeEnergy){const fact={id:`local:${daily.date}:energy`,source:'/api/trends',kind:'energy',date:daily.date,...daily.energy,unit:'kcal'};facts.push(fact);observations.push({text:message('energyFact',{...Object.fromEntries(['expenditure','target','remaining','balance'].map(key=>[key,number(convertEnergy(fact[key],'kcal',energyUnit))])),unit:energyUnit}),reasonCodes:fact.reasons,factIds:[fact.id]});}
  return {attributions:waterOnly?[]:[...(daily.attributions??[])],presentation:{energyUnit},answer:message('localAnswer',{date:daily.date}),observations,facts,limitations:[message('endDateOnly'),message('localLimits')]};

}
