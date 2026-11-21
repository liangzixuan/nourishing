import {prepareRecordSelection,prepareRecordCopy,referencedRecordFacts,captureRecordSelection,previewRecordCopy,previewClearAmounts,prepareSelectionDraft} from './diary-selection.mjs';
import {libraryIngredientRows} from './library-item-view.mjs';
import {normalizeCompositeDraft} from './composite-draft.mjs';
import {fail,objectKeys} from './workspace-validation.mjs';
import {assertDiaryDaysEditable} from './diary-day-status.mjs';
import {previewEntryExpansion} from './diary-entry-expansion.mjs';
export function prepareDiaryReview(state,input){
 if(input?.operation==='expand'){
  const {operation,...source}=input;
  assertDiaryDaysEditable(state,[source.date]);
  return previewEntryExpansion(state,source);
 }
 objectKeys(input,['operation','selection','destination'],'Diary review');
 if(input.operation!=='copy'&&input.destination!==undefined)fail('Choose a copy destination.');
 switch(input.operation){
 case 'capture':return captureRecordSelection(state,input.selection);
 case 'copy':return previewRecordCopy(state,{selection:input.selection,destination:input.destination});
 case 'clear':return previewClearAmounts(state,{selection:input.selection});
 case 'recipe':case 'meal':{
  const source=prepareSelectionDraft(state,{kind:input.operation,selection:input.selection});
  const context={...state,foods:[...state.foods,...source.inlineFoods]},resource=normalizeCompositeDraft(context,source.kind,source.draft);
  return {selection:source.selection,fingerprint:source.fingerprint,name:source.draft.name,selectedCount:source.selectedCount,warningCodes:source.warningCodes,resource,foods:source.inlineFoods,items:libraryIngredientRows(context,source.draft.items??source.draft.ingredients)};
 }
 default:fail('Choose a diary action.');
 }
}

// Guards retain the facts shown before a background write. Canonical records may
// add defaults to a pending row; every supplied fact and every row identity must
// still agree. Array lengths prevent changed selections/targets from slipping in.
export function diaryReviewGuard(state,input){
 const selection=input.operation==='expand'?{date:input.date,scope:'selected',records:[{collection:'entries',id:input.id}]}:input.selection;
 const prepared=input.operation==='copy'?prepareRecordCopy(state,{selection:input.selection,destination:input.destination}):prepareRecordSelection(state,selection);
 const records=prepared.records.map(({collection,row})=>{const {_pending,...value}=row;return {collection,row:value};});
 const guard={records,resources:referencedRecordFacts(state,records.filter(row=>row.collection==='entries').map(item=>item.row))};
 if(input.operation==='copy')guard.targets=prepared.targets.map(({collection,row})=>{const {_pending,...value}=row;return {collection,row:value};});
 if(['recipe','meal'].includes(input.operation))guard.libraryIds=Object.fromEntries(['foods','recipes','meals'].map(key=>[key,state[key].map(row=>row.id)]));
 return guard;
}
const agrees=(expected,current)=>Array.isArray(expected)?Array.isArray(current)&&expected.length===current.length&&expected.every((item,index)=>agrees(item,current[index])):expected&&typeof expected==='object'?current&&typeof current==='object'&&Object.entries(expected).every(([key,value])=>value===undefined&&!Object.hasOwn(current,key)||agrees(value,current[key])):Object.is(expected,current);
export function assertDiaryReviewGuard(expected,current){
 if(!agrees(expected,current))throw Object.assign(Error('The selected records changed. Review the selection again.'),{status:409});
}
