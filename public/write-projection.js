import {updateFavoriteList,applyFastingChange,prepareDiaryRecordUpdate,storeChartDefinition,applyTargetPolicyToState,applyMealSuggestionPreferenceLocal,changeCoachPreferences} from './local-diary-projection.js';
// Serializable local effects for acknowledged and pending background commands.
import {removeLibraryItem,applyProfileSettingsProjection,projectDiaryBulkWrite,copiedDiaryRecords} from './local-diary-projection.js';
import {diaryGroupSlots,editDiaryGroupSlot,renameDiaryGroup} from './local-group-rename.js';
import {mergeEntryUpdate} from './report-source/server/entry-update-fields.mjs';
import {expandedDiarySources} from './report-source/server/resource-expansion.mjs';
export function applyWriteToState(state,row,result){
 const {type,payload:p}=row.command,id=result?.records?.entries?.[0]?.id??result?.records?.biometrics?.[0]?.id??result?.records?.notes?.[0]?.id??result?.item?.id??result?.id??row.command.operationId;
 const replace=(collection,value)=>{state[collection]??=[];const i=state[collection].findIndex(item=>item.id===value.id);if(i<0)state[collection].push(value);else state[collection][i]=value;};
 const remove=(collection,id)=>{state[collection]=(state[collection]??[]).filter(item=>item.id!==id);};
 const fastingChange=result?.fastingChange??row.projection?.fastingChange;
 if(fastingChange)applyFastingChange(state,fastingChange);
 projectDiaryBulkWrite(state,row.command);
 if(['food.delete','recipe.delete','meal.delete'].includes(type))removeLibraryItem(state,type.split('.')[0],p.id);
 if(row.projection?.library&&!result?.records){
  const {kind,resource,mode,previousId}=row.projection.library;
  if(mode==='preserve'){const previous=state[kind+'s']?.find(item=>item.id===previousId);if(previous)previous.retired=true;}
  replace(kind+'s',{...structuredClone(resource),id:mode==='update'?resource.id:id,_pending:!result});
 }

 if(type==='barcode.log'&&!result?.records){
  const food=row.projection.barcodeFood;
  if(!state.foods.some(item=>item.id===food.id))replace('foods',{...food,_pending:!result});
  if(row.projection.barcodeEntry)replace('entries',{...row.projection.barcodeEntry,id:result?.entryIds?.[0]??row.command.operationId,_pending:!result});
 }
 if((type==='selection.recipe'||type==='selection.meal')&&!result?.records){
  const draft=row.projection?.reusable;
  if(draft){
   const foods=new Map((draft.foods??[]).map((food,index)=>[food.id,{...structuredClone(food),id:`${row.command.operationId}-food-${index}`} ]));
   for(const food of foods.values())replace('foods',food);
   const resource=structuredClone(draft.resource),field=draft.kind==='recipe'?'ingredients':'items';
   resource[field]=resource[field].map(item=>foods.has(item.foodId)?{...item,foodId:foods.get(item.foodId).id}:item);
   replace(draft.kind+'s',{...resource,id:row.command.operationId,name:p.draft?.name??p.name});
  }
 }
 if(type==='records.copy'&&!result?.records){
  const selection=p.selection;
  const records=selection.scope==='selected'?selection.records.map(ref=>({collection:ref.collection,row:state[ref.collection]?.find(item=>item.id===ref.id&&item.date===selection.date)})).filter(item=>item.row):['entries','biometrics','notes'].flatMap(collection=>(state[collection]??[]).filter(item=>item.date===selection.date&&(selection.scope==='day'||item.group===selection.group)).map(row=>({collection,row})));
  for(const {collection,record} of copiedDiaryRecords(records,p.destination,(collection,index)=>`${row.command.operationId}-${collection}-${index}`))replace(collection,{...record,_pending:!result});
 }
 for(const food of row.projection?.foods??[])if(!(state.foods??[]).some(item=>item.id===food.id))replace('foods',structuredClone(food));
 if(type==='favorite.set')state.settings.favorites=updateFavoriteList(state.settings.favorites??[],{kind:p.kind,id:p.id},p.enabled);
 if(type.startsWith('profileSettings.')){const record=applyProfileSettingsProjection(state,row.command,id);if(record)record._pending=!result;}
 if(type.startsWith('targetPolicy.')){try{applyTargetPolicyToState(state,row.command,{today:row.projection?.today??new Date().toLocaleDateString('en-CA')});}catch{/* Server validation remains authoritative. */}}
 if(type==='coach.preferences'){try{changeCoachPreferences(state,p);state.settings.coachStarted=true;}catch{if(p?.preferences){state.settings.coachPreferences=structuredClone(p.preferences);state.settings.coachStarted=true;}}}
 if(type==='foodSuggestion.preference'){try{applyMealSuggestionPreferenceLocal(state,p);}catch{/* Server validation remains authoritative. */}}
 if((type==='text.log'||type==='repeat.apply')&&!result?.records?.entries&&row.projection?.entries){
  row.projection.entries.forEach((item,index)=>replace('entries',{...item,id:`${row.command.operationId}-${index}`,_pending:!result}));
 }
 if(type==='food.copy'&&!result?.records?.foods&&row.projection?.foods?.[0]){
  replace('foods',{...structuredClone(row.projection.foods[0]),id:result?.item?.id??row.command.operationId,_pending:!result});
 }
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
 if(type==='exercise.catalog.add'&&!result&&row.projection?.entries?.[0])replace('entries',{...row.projection.entries[0],id,_pending:true});
 if(type==='record.correct'&&!result?.records?.[p.collection]){const old=state[p.collection]?.find(item=>item.id===p.id);if(old)replace(p.collection,{...prepareDiaryRecordUpdate(state,p,row.projection?.exerciseActivity).after,_pending:!result});}
 if(type==='note.photo.save'){
  const noteId=p.id??id,existing=state.notes?.find(item=>item.id===noteId);
  const note={...row.projection?.notes?.[0],...existing,...p.fields,id:noteId,_pending:!result};
  const photo=row.transport.body.photo;
  if(photo.mode!=='keep'){
   delete note.imageId;delete note.localPhoto;
   if(photo.mode==='replace'){
    if(photo.id)note.imageId=photo.id;
    if(!result)note.localPhoto=row.projection?.noteSource??photo.dataUrl;
   }
  }
  replace('notes',note);
 }

 if(type==='water.add')replace('biometrics',{id,date:p.date,time:p.time,...(Object.hasOwn(p,'group')?{group:p.group}:{}),type:'Water',unit:'mL',value:p.amount,_pending:!result});
 if(type==='day.complete'){state.settings.completedDays=(state.settings.completedDays??[]).filter(day=>day!==p.date);if(p.completed)state.settings.completedDays.push(p.date);}
 if(row.projection?.diarySettings)Object.assign(state.settings,row.projection.diarySettings);
 if(type==='pauseLife.save')state.settings.pauseLife=structuredClone(p.policy);
 if(type==='dashboard.widgets'){
  const base=state.settings.dashboard??{widgets:{},weightMetric:null};
  state.settings.dashboard={widgets:{energy:true,weight:true,fasting:true,nutrition:true,coach:true,streaks:true,sleep:true,glucose:false,cycle:false,...base.widgets,...p.patch},weightMetric:base.weightMetric??null};
 }
 if(type==='dashboard.preferences')state.settings.discover={...state.settings.discover,version:1,...p.patch};
 if(type==='addMenu.save')state.settings.addMenu=structuredClone(p.addMenu);
 if(type==='cycle.display')state.settings.cycleDisplay=structuredClone(p.policy);
 if(type==='glucose.settings')state.settings.glucoseTimeline=structuredClone(p.policy);
 if(type==='display.save'||type==='preferences.patch')Object.assign(state.settings,p);
 if(type==='group.editSlot'&&state.settings.groups&&diaryGroupSlots(state.settings)[p.slot-1]===p.from)editDiaryGroupSlot(state,p);
 if(type==='group.rename'&&state.settings.groups?.includes(p.from))renameDiaryGroup(state,p);
 if(row.projection?.chartState&&type!=='chart.save'){state.settings.mobileCharts=structuredClone(row.projection.chartState.mobileCharts);state.charts=structuredClone(row.projection.chartState.charts);}
 if(type==='chart.delete'){remove('charts',p.id);if(state.settings.mobileCharts?.custom)delete state.settings.mobileCharts.custom[p.id];}
 if(type==='chart.save'&&Array.isArray(state.charts))storeChartDefinition(state,structuredClone(result?.records?.charts?.[0]??p));
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
 if(type==='food.multi.add'&&!result?.records){
  for(const [index,entry] of (row.projection.entries??[]).entries())replace('entries',{...entry,id:row.command.operationId+'-'+index,_pending:true});
  for(const recipe of row.projection.recipes??[])replace('recipes',{...recipe,id:row.command.operationId,_pending:true});
 }
 if(type==='photo.log'||type==='meal.log'){
  const rows=row.projection?.entries??p.rows??[];
  if(p.destination&&p.destination.kind!=='diary')return;
  rows.forEach((item,index)=>replace('entries',{...item,id:result?.records?.entries?.[index]?.id??result?.entryIds?.[index]??`${row.command.operationId}-${index}`,date:p.date,time:p.time,group:p.group,_pending:!result}));
 }
 if(result?.records){
  for(const [collection,rows] of Object.entries(result.records))for(const record of rows)replace(collection,record);
 }
}

// Apply one saved definition to every cached view that contains its collection.
export function projectSavedDefinition(path,view,row,receipt){
 const {type,payload}=row.command;
 if(type==='favorite.set'&&path==='/api/library/favorites'&&view?.items){
  const ref={kind:payload.kind,id:payload.id};
  const item=row.projection.favoriteItem;
  if(!payload.enabled||item)return {...view,items:updateFavoriteList(view.items,item??ref,payload.enabled)};
 }
 if(type==='fasting.schedule.save'&&!row.projection?.fastingChange&&/^\/api\/fasting(?:\?|$)/.test(path)&&view?.schedules){
  const schedule=receipt?.fastingSchedule??{...payload,timeZone:row.projection.scheduleZone,revision:payload.revision+1,nextStart:null,_pending:true};
  return {...view,schedules:withRecord(view.schedules,schedule)};
 }
 if(type==='chart.delete'&&/^\/api\/dashboard(?:\?|$)/.test(path)&&view?.pinnedCharts){
  return {...view,pinnedCharts:projectSavedDefinition('/api/charts',view.pinnedCharts,row,receipt)};
 }
 if(/^\/api\/dashboard(?:\?|$)/.test(path)&&view?.dashboard?.widgets){
  if(type==='dashboard.widgets'){
   const next=structuredClone(view);
   Object.assign(next.dashboard.widgets,payload.patch);
   if(next.capture?.settings?.widgets)Object.assign(next.capture.settings.widgets,payload.patch);
   return next;
  }
  if(type==='dashboard.preferences'){
   const next=structuredClone(view);
   Object.assign(next.preferences,payload.patch);
   if(payload.patch?.reportWidget&&next.summaries?.[payload.patch.reportWidget])next.summary=structuredClone(next.summaries[payload.patch.reportWidget]);
   return next;
  }
  if(type==='dashboard.streakReset'){
   const next=structuredClone(view);
   if(next.streaks)next.streaks={...next.streaks,current:payload.count};
   if(next.capture?.cards?.streaks)next.capture.cards.streaks={...next.capture.cards.streaks,current:payload.count};
   return next;
  }
 }
 if(!/^\/api\/charts(?:\?|$)/.test(path)||!view?.saved)return view;
 if(type==='chart.delete'){
  const id='custom:'+payload.id;
  return {...view,saved:view.saved.filter(chart=>chart.id!==payload.id),catalog:view.catalog.filter(card=>card.id!==id),cards:view.cards.filter(card=>card.id!==id)};
 }
 if(type!=='chart.save'||!row.projection?.chartDate)return view;
 const chart=receipt?.records?.charts?.[0]??payload,id='custom:'+chart.id;
 const cached=row.projection?.chartCard;
 const card=cached&&row.projection.chartDate===view.to&&(!cached.cycleOverlayEnabled||cached.cycleOverlay.calendar.asOf===view.calendar.asOf)?{...cached,name:chart.name,definition:chart}:null;
 const selected=new URL(path,'http://localhost').searchParams.get('card');
 const previous=view.catalog.find(item=>item.id===id);
 const descriptor={...previous,id,kind:'custom',chartId:chart.id,name:chart.name,settings:{...(card?.settings??previous?.settings),visible:chart.visible}};
 const cards=card&&(selected===id||!selected&&chart.visible)?withRecord(view.cards,card):view.cards.filter(item=>item.id!==id);
 return {...view,saved:withRecord(view.saved,card?chart:{...chart,_awaitingPlot:true}),cards,catalog:withRecord(view.catalog,descriptor)};
}
function withRecord(rows,item){
 return rows.some(row=>row.id===item.id)?rows.map(row=>row.id===item.id?item:row):[...rows,item];
}
