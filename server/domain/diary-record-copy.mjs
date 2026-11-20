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
