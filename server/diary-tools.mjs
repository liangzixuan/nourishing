import {prepareDiaryReview} from './domain/diary-preparation.mjs';
export {diaryEnergy,diaryToolsPresentation} from './diary-presentation.mjs';
import {act,prepareRecordSelection,prepareSelectionDraft,removeDiaryRecords,previewEntryExpansion} from './domain/workspace.mjs';
import {digest} from './data-codec.mjs';
import {sortAllDiaryEntriesByTime} from './domain/diary-order.mjs';
import {diarySelectionNutrition} from './domain/diary-selection-nutrition.mjs';

const fail=message=>{throw Object.assign(Error(message),{status:400,code:400,publicMessage:message});};
function exact(input,fields){if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(key=>!fields.includes(key)))fail('Invalid diary action.');}
export const diaryToolCommandFields=Object.freeze({
 'entry.expand':['date','id','fingerprint','confirmed','alwaysExpandMeals'],
 'records.copy':['selection','destination','fingerprint','confirmed'],
 'records.clear-amounts':['selection','fingerprint','confirmed'],
 'records.move-group':['date','group','records'],
 'records.set-time':['date','time','records'],
 'records.delete':['selection','confirmed'],
 'selection.meal':['selection','fingerprint','name','confirmed'],
 'selection.recipe':['selection','fingerprint','name','confirmed'],
 'diary.order':['mode'],
 'diary.sort-all':[],
 'group.order':['group','mode']
});
export function diaryToolsReview(state,input){
 exact(input,input?.operation==='expand'?['operation','date','id']:input?.operation==='nutrition'?['operation','selection','revision']:['operation','selection','destination']);let review;
 if(input.operation!=='copy'&&input.destination!==undefined)fail('Choose a copy destination.');
 switch(input.operation){
  case 'expand':review=previewEntryExpansion(state,{date:input.date,id:input.id});break;
  case 'nutrition':review=diarySelectionNutrition(state,input.selection);break;
  default:review=prepareDiaryReview(state,input);break;
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
 }else if(type==='selection.meal'||type==='selection.recipe'){
  const kind=type.slice('selection.'.length),prepared=prepareSelectionDraft(candidate,{kind,selection:payload.selection});
  result=act(candidate,'selection.save',{kind,selection:payload.selection,fingerprint:payload.fingerprint,confirmed:payload.confirmed,draft:{...prepared.draft,name:payload.name}});
 }else if(type==='diary.sort-all')sortAllDiaryEntriesByTime(candidate);
 else if(type==='diary.order')result=act(candidate,'settings.save',{diarySort:payload.mode});
 else result=act(candidate,type,payload);
 Object.assign(state,candidate);return {handled:true,result};
}
