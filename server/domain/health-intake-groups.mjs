import {date} from './calendar.mjs';
import {isExerciseEntry,entryNutrientMeasurements,combinedEntryNutrientMeasurements} from './nutrition.mjs';
import {healthIntakeClientId} from './health-export-identity.mjs';
const fail=message=>{throw Object.assign(Error(message),{status:400});};
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const exact=(value,keys)=>object(value)&&Object.keys(value).length===keys.length&&keys.every(key=>Object.hasOwn(value,key));
const id=value=>typeof value==='string'&&value.trim().length>0;
const negative=facts=>Object.values(facts.nutrients).some(value=>typeof value==='number'&&value<0);

/** Read-only grouping draft. It is not an executable native write plan.
 * A person chooses an existing anchor and every contributing diary entry.
 * Grouping never invents a correction's target from its name or timestamp. */
export function previewIntakeGroup(state,input,{namespace,kind}){
 if(!['nutrition','hydration'].includes(kind))fail('Choose nutrition or food water.');
 if(!exact(input,['date','anchorId','entryIds'])||!id(input.anchorId)||!Array.isArray(input.entryIds)||input.entryIds.length<2||!input.entryIds.every(id)||new Set(input.entryIds).size!==input.entryIds.length||!input.entryIds.includes(input.anchorId))fail('Choose an anchor and at least two distinct food entries.');
 date(input.date);const wanted=new Set(input.entryIds),entries=state.entries.filter(row=>wanted.has(row.id));
 if(entries.length!==wanted.size||new Set(entries.map(row=>row.id)).size!==wanted.size||entries.some(row=>row.date!==input.date||isExerciseEntry(row)||Object.hasOwn(row,'source')))fail('Every selected ID must identify one local food entry on the selected date.');
 const anchor=entries.find(row=>row.id===input.anchorId),components=entries.map(row=>({row,facts:entryNutrientMeasurements(state,row)}));
 if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(anchor.time??''))fail('The anchor needs a recorded time.');
 const anchorFacts=components.find(c=>c.row.id===anchor.id).facts;
 if((anchor.quantity??anchor.amount??1)<=0||negative(anchorFacts))fail('Choose a positive food entry as the anchor.');
 if(!components.some(c=>(c.row.quantity??c.row.amount??1)<0||negative(c.facts)))fail('This grouping needs a subtraction entry.');
 const combined=combinedEntryNutrientMeasurements(state,entries);
 const identity=row=>healthIntakeClientId(namespace,kind,'entries',row.id);
 return {
  version:1,executable:false,kind,date:input.date,
  anchor:{id:anchor.id,name:anchorFacts.name,time:anchor.time,clientRecordId:identity(anchor)},
  entryIds:entries.map(row=>row.id),
  components:components.map(({row,facts})=>({id:row.id,name:facts.name,date:row.date,time:row.time??null,quantity:Object.fromEntries(['amount','quantity','unit','portionId'].filter(key=>Object.hasOwn(row,key)).map(key=>[key,row[key]])),nutrients:facts.nutrients,coverage:facts.coverage,attributions:facts.attributions})),
  ...combined,
  retire:entries.filter(row=>row.id!==anchor.id).map(row=>({id:row.id,clientRecordId:identity(row)})),
  limitations:['Grouping changes the native export only; diary records stay separate.','The selected anchor retains its recorded time and native client identity.','Every other selected native client identity must be removed and its absence verified, including a subtraction entry that was exported while positive.','This draft cannot be written until native reconciliation and explicit review are implemented.'],
 };
}
