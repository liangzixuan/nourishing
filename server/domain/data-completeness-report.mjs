import {completenessDefinitionFields} from './completeness-metric.mjs';
import {captureCompletenessGuidance,isCompletenessGuidance} from './completeness-guidance.mjs';

const dailyMethod='local-food-leaf-completeness-v1',denominator='food-leaf-occurrences';
const invalid=()=>{throw new Error('Daily food-data completeness does not match the report capture.');};
function period(rows,{membership=false}={}){
  if(rows.some(row=>!row||row.percent!==null&&(typeof row.percent!=='number'||!Number.isFinite(row.percent)||row.percent<0||row.percent>100)))invalid();
  const defined=rows.filter(row=>row.percent!==null),fullDays=defined.filter(row=>row.percent===100).length;
  const result={meanPercent:defined.length?defined.reduce((sum,row)=>sum+row.percent,0)/defined.length:null,eligibleDays:rows.length,definedDays:defined.length,unknownDays:rows.length-defined.length,fullDays,incompleteDays:defined.length-fullDays};
  if(membership){const sets=new Set(rows.map(row=>JSON.stringify([...row.componentIds].sort())));result.membershipVaries=sets.size>1;}
  return result;
}

/** Aggregate already resolved daily facts; no workspace, target or food lookups. */
export function captureDataCompletenessReport(days,identities){
  const captures=days.map(day=>{
    const value=day.dataCompleteness;
    if(!value||value.version!==3||value.date!==day.date||value.method!==dailyMethod||value.denominator!==denominator||JSON.stringify(value.limitations)!==JSON.stringify(captureCompletenessGuidance('daily')))invalid();
    const nutrients=new Map(value.nutrients.map(row=>[row.id,row])),groups=new Map(value.groups.map(row=>[row.id,row]));
    if(nutrients.size!==identities.nutrients.length||groups.size!==identities.groups.length)invalid();
    for(const row of identities.nutrients){const actual=nutrients.get(row.id);if(!actual||actual.name!==row.name||actual.unit!==row.unit||JSON.stringify(actual.definition)!==JSON.stringify(row.definition))invalid();completenessDefinitionFields(actual);}
    for(const row of identities.groups)if(groups.get(row.id)?.name!==row.name)invalid();
    return {value,nutrients,groups};
  });
  return {version:4,dailyLimitations:captureCompletenessGuidance('daily'),method:'mean-defined-daily-food-completeness-v1',dailyMethod,denominator,
    overall:period(captures.map(row=>row.value.overall),{membership:true}),
    nutrients:identities.nutrients.map(({id,name,unit,...definition})=>({id,name,nutrientUnit:unit,...structuredClone(definition),...period(captures.map(row=>row.nutrients.get(id)))})),
    groups:identities.groups.map(({id,name})=>({id,name,...period(captures.map(row=>row.groups.get(id)),{membership:true})})),
    limitations:captureCompletenessGuidance('period')};}


/** Capture only date-varying facts; identities and method notes belong to the period. */
export function captureDataCompletenessDay(value){
 return {nutrients:value.nutrients.map(({id,known,total,percent})=>({id,known,total,percent})),groups:value.groups.map(({id,componentIds,percent})=>({id,componentIds:[...componentIds],percent})),overall:{componentIds:[...value.overall.componentIds],percent:value.overall.percent}};
}
const exact=(value,fields)=>value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).length===fields.length&&fields.every(key=>Object.hasOwn(value,key));
/** Resolve one date from captured identities, without consulting current workspace rules. */
export function createDataCompletenessDayReader(capture){
 if(!capture||capture.version!==4||!Array.isArray(capture.nutrients)||!Array.isArray(capture.groups)||!Array.isArray(capture.dailyLimitations)||!capture.dailyLimitations.every(isCompletenessGuidance))invalid();
 const nutrients=new Map(capture.nutrients.map(row=>[row.id,row])),groups=new Map(capture.groups.map(row=>[row.id,row]));
 if(nutrients.size!==capture.nutrients.length||groups.size!==capture.groups.length)invalid();
 return day=>{
  const value=day.dataCompleteness;
  if(!exact(value,['nutrients','groups','overall'])||!Array.isArray(value.nutrients)||!Array.isArray(value.groups)||value.nutrients.length!==nutrients.size||value.groups.length!==groups.size)invalid();
  const seenNutrients=new Set(),seenGroups=new Set();
  return {version:3,date:day.date,method:capture.dailyMethod,denominator:capture.denominator,
   nutrients:value.nutrients.map(row=>{if(!exact(row,['id','known','total','percent'])||!nutrients.has(row.id)||seenNutrients.has(row.id))invalid();seenNutrients.add(row.id);const identity=nutrients.get(row.id),{name,nutrientUnit:unit}=identity;completenessDefinitionFields(identity);return {id:row.id,name,unit,...(Object.hasOwn(identity,'definition')?{definition:structuredClone(identity.definition)}:{}),known:row.known,total:row.total,percent:row.percent};}),
   groups:value.groups.map(row=>{if(!exact(row,['id','componentIds','percent'])||!groups.has(row.id)||seenGroups.has(row.id))invalid();seenGroups.add(row.id);return {id:row.id,name:groups.get(row.id).name,componentIds:row.componentIds,percent:row.percent};}),
   overall:value.overall,limitations:capture.dailyLimitations};
 };
}
