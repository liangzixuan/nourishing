import {captureContributionNotes} from './contribution-guidance.mjs';
import {nutrientDisplayOptions} from './nutrient-display.mjs';
import {NET_CARBOHYDRATE_TARGET_ID} from './carbohydrate-policy.mjs';

const options=new Map(nutrientDisplayOptions.map(option=>[option.id,option]));
const finite=value=>typeof value==='number'&&Number.isFinite(value);
const fail=message=>{throw Object.assign(new Error(message),{status:400});};
export const defaultDiaryDisplayPolicy=Object.freeze({version:1,highlighted:Object.freeze(['fiber','iron','calcium','potassium','vitaminC','sodium','magnesium','vitaminD']),showHighlights:true,macroDisplay:'consumed'});

/** Parse explicit choices without adding defaults to stored settings. */
export function parseDiaryDisplayPolicy(value){
  if(value===undefined||value===null)return null;
  const keys=['version','highlighted','showHighlights','macroDisplay'];
  if(typeof value!=='object'||Array.isArray(value)||Object.keys(value).length!==keys.length||!keys.every(key=>Object.hasOwn(value,key)))fail('Choose the required diary-display fields only.');
  if(value.version!==1||!Array.isArray(value.highlighted)||value.highlighted.length>8||typeof value.showHighlights!=='boolean'||!['consumed','remaining'].includes(value.macroDisplay))fail('Choose version 1, up to eight highlighted nutrients, a visibility setting and a macro display mode.');
  const highlighted=Array.from(value.highlighted);
  if(highlighted.some(id=>!options.has(id))||new Set(highlighted).size!==highlighted.length)fail('Choose each known highlighted nutrient once.');
  return {version:1,highlighted,showHighlights:value.showHighlights,macroDisplay:value.macroDisplay};
}

/** Retain raw partial sums: subtracting them gives an upper bound on remaining. */
export function projectDiaryTarget({id,totals,targets,coverage,complete,carbohydrate,carbohydrates}){
    if(!options.has(id))fail('Choose a known nutrient target.');
    const net=id===NET_CARBOHYDRATE_TARGET_ID,netFacts=carbohydrates?.net,active=!net||netFacts?.definition!==null&&netFacts?.definition!==undefined;
    const source=active?(net?netFacts?.coverage:coverage?.[id]):null;
    const measuredCoverage=source?{known:source.known,total:source.total,complete:source.complete}:{known:0,total:0,complete:false};
    const candidate=active?(net?netFacts?.value:totals?.[id]):null;
    const value=finite(candidate)&&(measuredCoverage.known>0||measuredCoverage.total===0&&complete===true)?candidate:null;
    const targetCandidate=active?(net?netFacts?.target:targets?.[id]):null,target=finite(targetCandidate)?targetCandidate:null;
    const status=value===null?'unknown':measuredCoverage.complete===true?'complete':'partial';
    const difference=value===null||target===null?null:target-value,remaining=finite(difference)?difference:null;
    return {...options.get(id),value,target,remaining,coverage:measuredCoverage,status,remainingStatus:remaining===null?'unknown':status==='complete'?'exact':'upper-bound',active};
}

export function projectDiaryDisplay({policy,hidden=[],totals,targets,coverage,complete,carbohydrate,carbohydrates}){
  const effectivePolicy=parseDiaryDisplayPolicy(policy)??parseDiaryDisplayPolicy(defaultDiaryDisplayPolicy),hiddenIds=new Set(hidden);
  const row=id=>projectDiaryTarget({id,totals,targets,coverage,complete,carbohydrate,carbohydrates});
  return {version:1,policy:effectivePolicy,hiddenHighlights:effectivePolicy.highlighted.filter(id=>hiddenIds.has(id)),highlights:effectivePolicy.showHighlights?effectivePolicy.highlighted.filter(id=>!hiddenIds.has(id)).map(row):[],macros:['calories','protein',carbohydrate?.definition?.mode==='net'?NET_CARBOHYDRATE_TARGET_ID:'carbs','fat'].map(row)};
}

/** Project an already captured nutrition scope without reading other records. */
export function createNutrientContributions(facts,id){
  const selected=facts.scope==='selection',target=projectDiaryTarget({id,totals:facts.totals,targets:facts.targets,coverage:facts.nutrientCoverage,complete:selected?false:facts.complete,carbohydrate:facts.carbohydrate,carbohydrates:facts.carbohydrates});
  const entries=facts.entries.map(entry=>{
    const net=id===NET_CARBOHYDRATE_TARGET_ID,value=target.active?(net?entry.carbohydrates.net.value:entry.nutrients[id]):null;
    const coverage=target.active?(net?entry.carbohydrates.net.coverage:entry.coverage[id]):{known:0,total:0,complete:false};
    return {id:entry.id,name:entry.name,time:entry.time??'',group:entry.group??'',value,coverage,kind:'food'};
  });
  // Hydration is already normalized by the nutrition owner. A selected-food
  // scope never borrows water logs from the rest of the day.
  if(!selected&&id==='water'&&facts.hydration?.logged>0)entries.push({id:null,name:'Logged water',time:'',group:'Water logs',value:facts.hydration.logged,coverage:null,kind:'water'});
  entries.sort((a,b)=>(a.value===null)-(b.value===null)||(b.value??0)-(a.value??0));
  return {version:3,attributions:[...(facts.attributions??[])],date:facts.date,scope:selected?'selection':'day',target,entries,notes:captureContributionNotes(selected?facts.selectedCount:null)};
}


export const diaryTableNutrients=nutrientDisplayOptions;
export const defaultDiaryTablePolicy=Object.freeze({version:1,summaryNutrient:'calories',groupSubtotals:'calories'});
export function parseDiaryTablePolicy(value){
  if(value===undefined||value===null)return null;
  if(typeof value!=='object'||Array.isArray(value)||Object.keys(value).length!==3||!['version','summaryNutrient','groupSubtotals'].every(key=>Object.hasOwn(value,key))||value.version!==1||!options.has(value.summaryNutrient)||!['none','calories','macros','summary'].includes(value.groupSubtotals))fail('Choose a known summary nutrient and a valid group subtotal mode.');
  return {version:1,summaryNutrient:value.summaryNutrient,groupSubtotals:value.groupSubtotals};
}

/** Project nutrient facts already aggregated by the nutrition owner. */
export function projectDiaryTable({policy,day,groups}){
  const effective=parseDiaryTablePolicy(policy)??defaultDiaryTablePolicy;
  const ids=effective.groupSubtotals==='none'?[]:effective.groupSubtotals==='calories'?['calories']:effective.groupSubtotals==='summary'?[effective.summaryNutrient]:['calories','protein',day.carbohydrate?.definition?.mode==='net'?NET_CARBOHYDRATE_TARGET_ID:'carbs','fat'];
  return {version:1,policy:effective,summary:projectDiaryTarget({...day,id:effective.summaryNutrient}),groups:groups.map(group=>({name:group.name,rows:ids.map(id=>projectDiaryTarget({...group,id}))}))};
}
