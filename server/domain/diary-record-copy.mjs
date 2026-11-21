import {fail,objectKeys,exactId} from './workspace-validation.mjs';
import {date} from './calendar.mjs';
import {healthSource} from './health-records.mjs';
export function recordCopyLineage(p,collection){
  if(p.copiedFrom===undefined)return {};
  if(p.source!==undefined||p.repeatId!==undefined)fail('Copied records cannot retain an active health import or repeat identity.');
  const value=p.copiedFrom;objectKeys(value,['version','collection','id','date','source','repeatId'],'Record copy history');
  if(value.version!==1||value.collection!==collection)fail('Record copy history must match its record collection.');
  if((value.source!==undefined&&collection!=='biometrics')||(value.repeatId!==undefined&&collection!=='entries'))fail('Health origins belong to biometric copies and repeat origins belong to diary entry copies.');
  const result={version:1,collection,id:exactId(value.id,'Original record ID'),date:date(value.date)};
  if(value.source!==undefined)result.source=healthSource(value.source);
  if(value.repeatId!==undefined)result.repeatId=exactId(value.repeatId,'Original repeat ID');
  return {copiedFrom:result};
}
// Copy origins remain historical facts; they must never become active import or
// repeat identities. Both the local projection and canonical save use this shape.
export function copiedDiaryRecords(records,destination,makeId){
 const meals=new Map(),positions={};
 return records.map(({collection,row})=>{
  const copiedFrom={version:1,collection,id:row.id,date:row.date};
  const source=row.source??row.copiedFrom?.source,repeatId=row.repeatId??row.copiedFrom?.repeatId;
  if(source!==undefined)copiedFrom.source=structuredClone(source);
  if(repeatId!==undefined)copiedFrom.repeatId=repeatId;
  const record={...structuredClone(row),date:destination.date,copiedFrom};
  delete record.source;delete record.repeatId;delete record._pending;
  if(destination.group!==null)record.group=destination.group;
  if(record.suggestedMeal){
   const sourceId=record.suggestedMeal.id;
   if(!meals.has(sourceId))meals.set(sourceId,makeId('meal',meals.size));
   record.suggestedMeal.id=meals.get(sourceId);
  }
  const index=positions[collection]??0;positions[collection]=index+1;
  record.id=makeId(collection,index);
  return {collection,record};
 });
}
