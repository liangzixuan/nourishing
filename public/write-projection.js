import {prepareDiaryRecordUpdate} from './local-diary-projection.js';
// Serializable local effects for acknowledged and pending background commands.
import {applyProfileSettingsProjection,projectDiaryBulkWrite,copiedDiaryRecords} from './local-diary-projection.js';
import {renameDiaryGroup} from './local-group-rename.js';
import {mergeEntryUpdate} from './report-source/server/entry-update-fields.mjs';
import {expandedDiarySources} from './report-source/server/resource-expansion.mjs';
export function applyWriteToState(state,row,result){
 const {type,payload:p}=row.command,id=result?.records?.entries?.[0]?.id??result?.records?.biometrics?.[0]?.id??result?.records?.notes?.[0]?.id??result?.item?.id??result?.id??row.command.operationId;
 const replace=(collection,value)=>{state[collection]??=[];const i=state[collection].findIndex(item=>item.id===value.id);if(i<0)state[collection].push(value);else state[collection][i]=value;};
 const remove=(collection,id)=>{state[collection]=(state[collection]??[]).filter(item=>item.id!==id);};
 projectDiaryBulkWrite(state,row.command);
 if(row.projection?.library&&!result?.records){
  const {kind,resource,mode,previousId}=row.projection.library;
  if(mode==='preserve'){const previous=state[kind+'s']?.find(item=>item.id===previousId);if(previous)previous.retired=true;}
  replace(kind+'s',{...structuredClone(resource),id:mode==='update'?resource.id:id,_pending:!result});
 }

 if((type==='selection.recipe'||type==='selection.meal')&&!result?.records){
  const draft=row.projection?.reusable;
  if(draft){
   const foods=new Map((draft.foods??[]).map((food,index)=>[food.id,{...structuredClone(food),id:`${row.command.operationId}-food-${index}`} ]));
   for(const food of foods.values())replace('foods',food);
   const resource=structuredClone(draft.resource),field=draft.kind==='recipe'?'ingredients':'items';
   resource[field]=resource[field].map(item=>foods.has(item.foodId)?{...item,foodId:foods.get(item.foodId).id}:item);
   replace(draft.kind+'s',{...resource,id:row.command.operationId,name:p.name});
  }
 }
 if(type==='records.copy'&&!result?.records){
  const selection=p.selection;
  const records=selection.scope==='selected'?selection.records.map(ref=>({collection:ref.collection,row:state[ref.collection]?.find(item=>item.id===ref.id&&item.date===selection.date)})).filter(item=>item.row):['entries','biometrics','notes'].flatMap(collection=>(state[collection]??[]).filter(item=>item.date===selection.date&&(selection.scope==='day'||item.group===selection.group)).map(row=>({collection,row})));
  for(const {collection,record} of copiedDiaryRecords(records,p.destination,(collection,index)=>`${row.command.operationId}-${collection}-${index}`))replace(collection,{...record,_pending:!result});
 }
 for(const food of row.projection?.foods??[])if(!(state.foods??[]).some(item=>item.id===food.id))replace('foods',structuredClone(food));
 if(type.startsWith('profileSettings.')){const record=applyProfileSettingsProjection(state,row.command,id);if(record)record._pending=!result;}
 if(type==='entry.add'&&!result?.records?.entries){
  if(p.mealId&&state.settings.alwaysExpandMeals===true){
   for(const [index,child] of expandedDiarySources(state,{...p,id:row.command.operationId}).entries())replace('entries',{...child,id:`${row.command.operationId}-${index}`,_pending:!result});
  }else replace('entries',{...p,id,_pending:!result});
 }
 if(type==='entry.update'){const old=state.entries?.find(item=>item.id===p.id);if(old)replace('entries',{...mergeEntryUpdate(old,p),_pending:!result});}
 if(type==='entry.delete')remove('entries',p.id);
 if(type==='note.delete')remove('notes',p.id);
 if(type==='biometric.delete')remove('biometrics',p.id);
 if(type==='note.add')replace('notes',{...p,id,_pending:!result});
 if(type==='exercise.add')replace('entries',{date:p.date,time:p.time,group:p.group,name:p.name,duration:p.duration,caloriesBurned:p.calories,kind:'exercise',id,_pending:!result});
 if(type==='record.correct'){const old=state[p.collection]?.find(item=>item.id===p.id);if(old)replace(p.collection,{...prepareDiaryRecordUpdate(state,p).after,_pending:!result});}
 if(type==='note.photo.save')for(const note of row.projection?.notes??[])replace('notes',{...note,id:p.id??id,_pending:!result});

 if(type==='water.add')replace('biometrics',{id,date:p.date,time:p.time,...(Object.hasOwn(p,'group')?{group:p.group}:{}),type:'Water',unit:'mL',value:p.amount,_pending:!result});
 if(type==='day.complete'){state.settings.completedDays=(state.settings.completedDays??[]).filter(day=>day!==p.date);if(p.completed)state.settings.completedDays.push(p.date);}
 if(type==='display.save'||type==='preferences.patch')Object.assign(state.settings,p);
 if(type==='group.rename'&&state.settings.groups?.includes(p.from))renameDiaryGroup(state,p);
 if(row.projection?.chartState){state.settings.mobileCharts=structuredClone(row.projection.chartState.mobileCharts);state.charts=structuredClone(row.projection.chartState.charts);}
 if(type==='entry.ingredients.adjust'){
  const entry=state.entries.find(row=>row.id===p.id);
  if(entry){if(p.kind==='meal'){entry.mealItems=structuredClone(p.items);entry.amount=1;delete entry.quantity;delete entry.unit;delete entry.portionId;}
   else entry.recipeOverride={version:1,ingredients:structuredClone(p.items),...structuredClone(p.basis)};}
 }
 if(type==='snapshot.delete')remove('progressSnapshots',p.id);
 if(type==='snapshot.update'){const old=state.progressSnapshots?.find(row=>row.id===p.id);if(old)replace('progressSnapshots',{...old,...p});}
 if(type==='snapshot.add')for(const item of row.projection?.snapshots??[])replace('progressSnapshots',{...item,id});
 if(type==='repeat.delete')remove('repeats',p.id);
 if(type==='repeat.setEnabled'){const item=state.repeats?.find(row=>row.id===p.id);if(item)item.enabled=p.enabled;}
 if(type==='entry.expand'){
  const position=state.entries.findIndex(entry=>entry.id===p.id);
  if(position!==-1){
   const children=result?.records?.entries??row.projection.entries.map((item,index)=>({...item,id:`${row.command.operationId}-${index}`,_pending:true}));
   state.entries.splice(position,1,...children);
  }
 }
 if(type==='repeat.save')replace('repeats',{...p,id:p.id??id});
 if(type==='photo.log'||type==='meal.log'){
  const rows=row.projection?.entries??p.rows??[];
  if(p.destination&&p.destination.kind!=='diary')return;
  rows.forEach((item,index)=>replace('entries',{...item,id:result?.records?.entries?.[index]?.id??result?.entryIds?.[index]??`${row.command.operationId}-${index}`,date:p.date,time:p.time,group:p.group,_pending:!result}));
 }
 if(result?.records){
  for(const [collection,rows] of Object.entries(result.records))for(const record of rows)replace(collection,record);
 }
}
