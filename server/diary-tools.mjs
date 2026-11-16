import {act,prepareRecordSelection,captureRecordSelection,previewRecordCopy,previewClearAmounts,prepareSelectionDraft,removeDiaryRecords} from './domain/workspace.mjs';
import {orderDiaryEntries,diaryGroupOrders} from './domain/diary-order.mjs';
import {parseEnergyUnit,convertEnergy} from './domain/energy-units.mjs';
import {digest} from './data-codec.mjs';
import {diaryRecordPresentation} from './diary-record-presentation.mjs';
import {calculateSummary,calculateSelectionNutrition,isExerciseEntry} from './domain/nutrition.mjs';

const fail=message=>{throw Object.assign(Error(message),{status:400,code:400,publicMessage:message});};
function exact(input,fields){if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(key=>!fields.includes(key)))fail('Invalid diary action.');}
export const diaryToolCommandFields=Object.freeze({
 'records.copy':['selection','destination','fingerprint','confirmed'],
 'records.clear-amounts':['selection','fingerprint','confirmed'],
 'records.move-group':['date','group','records'],
 'records.set-time':['date','time','records'],
 'records.delete':['selection','confirmed'],
 'selection.meal':['selection','fingerprint','name','confirmed'],
 'diary.order':['mode'],
 'group.order':['group','mode']
});
export function diaryToolsReview(state,input){
 exact(input,input?.operation==='nutrition'?['operation','selection','revision']:['operation','selection','destination']);let review;
 if(input.operation!=='copy'&&input.destination!==undefined)fail('Choose a copy destination.');
 switch(input.operation){
  case 'nutrition':{
   if(input.revision!==digest(state))throw Object.assign(Error('Diary changed. Reload diary.'),{status:409});
   const source=prepareRecordSelection(state,input.selection),date=source.selection.date;
   const entryIds=source.records.filter(({collection,row})=>collection==='entries'&&!isExerciseEntry(row)).map(({row})=>row.id),day=calculateSummary(state,date);
   const facts=entryIds.length?calculateSelectionNutrition(state,date,entryIds):day,consumed=facts.totals?.calories;
   const chartSummary=entryIds.length?{...day,consumedEnergy:facts.consumedEnergy,energy:{...day.energy,consumed,remaining:Number.isFinite(consumed)?day.energy.target-consumed:null}}:day;
   review={selection:source.selection,facts,chartSummary};break;
  }
  case 'capture':review=captureRecordSelection(state,input.selection);break;
  case 'copy':review=previewRecordCopy(state,{selection:input.selection,destination:input.destination});break;
  case 'clear':review=previewClearAmounts(state,{selection:input.selection});break;
  case 'meal':{
   const source=prepareSelectionDraft(state,{kind:'meal',selection:input.selection});
   review={selection:source.selection,fingerprint:source.fingerprint,name:source.draft.name,selectedCount:source.selectedCount,warningCodes:source.warningCodes,items:source.draft.items.map(item=>{const kind=item.recipeId?'recipe':'food',resource=state[kind+'s'].find(row=>row.id===item[kind+'Id'])??source.inlineFoods.find(row=>row.id===item.foodId);return {...item,name:resource?.name??'Food'};})};break;
  }
  default:fail('Choose a diary action.');
 }
 return {...review,revision:digest(state)};
}
export function applyDiaryToolsCommand(state,{type,payload}){
 if(!Object.hasOwn(diaryToolCommandFields,type))return {handled:false};
 exact(payload,diaryToolCommandFields[type]);const candidate=structuredClone(state);let result;
 if(type==='records.delete'){
  if(payload.confirmed!==true)fail('Confirm the selected records.');
  const {records}=prepareRecordSelection(candidate,payload.selection);if(!records.length)fail('Select at least one record.');
  for(const collection of ['entries','biometrics','notes']){const ids=records.filter(row=>row.collection===collection).map(row=>row.row.id);if(ids.length)removeDiaryRecords(candidate,collection,ids);}
 }else if(type==='selection.meal'){
  const prepared=prepareSelectionDraft(candidate,{kind:'meal',selection:payload.selection});
  result=act(candidate,'selection.save',{kind:'meal',selection:payload.selection,fingerprint:payload.fingerprint,confirmed:payload.confirmed,draft:{...prepared.draft,name:payload.name}});
 }else if(type==='diary.order')result=act(candidate,'settings.save',{diarySort:payload.mode});
 else result=act(candidate,type,payload);
 Object.assign(state,candidate);return {handled:true,result};
}
export function diaryEnergy(state,calories){const unit=parseEnergyUnit(state.settings.energyUnit??'kcal');return {value:convertEnergy(calories??null,'kcal',unit),unit};}
/** Presentation is resolved once from the same account settings that own the actions. */
export function diaryToolsPresentation(state,view){
 const orders=diaryGroupOrders(state.settings),mode=state.settings.diarySort??'source',entries=[];
 for(const group of [...new Set([...view.groups,...view.entries.map(row=>row.group)])])entries.push(...orderDiaryEntries(view.entries.filter(row=>row.group===group),orders.get(group)??mode));
 const energy=diaryEnergy(state,view.summary.energy?.consumed??view.summary.totals?.calories);
 return {...view,recordDisplay:diaryRecordPresentation(state.settings,{...view,entries}),energyUnit:energy.unit,consumedEnergy:energy.value,diarySort:mode,groupOrders:Object.fromEntries(orders),entries:entries.map(row=>({...row,energyValue:diaryEnergy(state,row.kind==='exercise'?row.caloriesBurned:row.facts?.nutrients?.calories).value}))};
}
