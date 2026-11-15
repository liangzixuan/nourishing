import {createHash} from 'node:crypto';
import {date,parseReportTimeZone} from './calendar.mjs';
import {previewIntakeGroup} from './health-intake-groups.mjs';
import {entryNutrientMeasurements,isExerciseEntry} from './nutrition.mjs';
import {projectIntakeGroup} from './health-intake-group-projection.mjs';
import {initializeHealthExportIdentity,readHealthExportIdentity} from './health-export-identity.mjs';

const fail=(message,status=400)=>{throw Object.assign(Error(message),{status});};
const exact=(value,keys)=>value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).length===keys.length&&keys.every(key=>Object.hasOwn(value,key));
const negative=facts=>Object.values(facts.nutrients).some(value=>typeof value==='number'&&value<0);


/** Read-only server review. Native history, SDK bounds and user confirmation are still required. */
export function createIntakeCorrectionReview({store}){
 initializeHealthExportIdentity(store.db);
 function preview(input){
  if(!exact(input,['kind','date','timeZone','groups'])||!['nutrition','hydration'].includes(input.kind)||!Array.isArray(input.groups)||!input.groups.length)fail('Select one date, intake type, time zone and correction groups.');
  const day=date(input.date),timeZone=parseReportTimeZone(input.timeZone),state=store.read(),namespace=readHealthExportIdentity(store.db),members=new Set();
  const groups=input.groups.map(value=>{
   if(!exact(value,['anchorId','entryIds']))fail('Supply an anchor and explicit entry IDs for each group.');
   const group=previewIntakeGroup(state,{date:day,...value},{namespace,kind:input.kind});
   for(const id of group.entryIds){if(members.has(id))fail('An entry cannot contribute to more than one correction group.');members.add(id);}
   return {...group,projection:projectIntakeGroup(group)};
  });
  const unassigned=state.entries.filter(row=>row.date===day&&!isExerciseEntry(row)&&!Object.hasOwn(row,'source')&&!members.has(row.id)).filter(row=>(row.quantity??row.amount??1)<0||negative(entryNutrientMeasurements(state,row))).map(row=>row.id);
  const payload={version:1,executable:false,selection:{kind:input.kind,date:day,timeZone,groups:input.groups},groups,unassigned,
   readyForNativeReview:unassigned.length===0&&groups.every(g=>g.projection.status==='needs-native-review'),
   limitations:['This is a correction draft, not a complete day export or a native write authorization.','The Android app must review existing records, validate every replacement with the installed SDK, and verify all updates and removals.','A missing local receipt does not establish that an old native record is absent.']};
  const result={...payload,draftToken:createHash('sha256').update(JSON.stringify([namespace,payload])).digest('hex')};
  if(Buffer.byteLength(JSON.stringify(result))>1048576)fail('The correction review exceeds the Android response limit. Select a smaller set of entries.',413);
  return result;
 }
 function verify(input){
  if(!exact(input,['selection','draftToken']))fail('Supply the captured correction selection and draft token.');
  const current=preview(input.selection);
  if(current.draftToken!==input.draftToken)fail('The selected food, quantity, source credit or correction membership changed. Review again.',409);
  return {valid:true,draftToken:current.draftToken,executable:false};
 }
 return {preview,verify};
}
