import {CaptureValidationError} from './../../report-source/public/capture-errors.js';
import {formatMessage} from './../../report-source/public/message-format.js';
import {recipeEntryFields} from './../../report-source/server/recipe-entry.mjs';
import {mealInputsReady,mealSourceFields} from './offline-meal.js';
import {parseServingAmount} from './../../report-source/server/food-quantity.mjs';
import {parseFoodDiaryFields} from './../server/diary-record-fields.mjs';
import {diaryDayComplete,assertDiaryDaysEditable} from './../../report-source/server/diary-day-status.mjs';
import {resourceReference} from './../../report-source/server/resource-reference.mjs';
import {parseReferencedQuantity} from './../server/resource-quantity.mjs';

export const isFoodEdit=type=>type==='entry.quantity'||type==='entry.details';
export const pendingTarget=pending=>isFoodEdit(pending.command.type)?pending.command.payload.id:pending.command.operationId;

export function foodEditAvailable(copy,id){
  const review=copy.snapshot.quantityReviews?.[id],row=copy.snapshot.state.entries.find(row=>row.id===id);
  if(!row||!mealInputsReady(copy.snapshot,row)||diaryDayComplete(copy.snapshot.state,row.date))return false;
  return Boolean(review?.revision&&!copy.pending.some(pending=>pending.preview.collection==='entries'&&pendingTarget(pending)===id));
}

function quantityEntry(state,row,quantity){
  const reference=resourceReference(row);
  const source=reference?parseReferencedQuantity(state,{[reference]:row[reference],...mealSourceFields(row),...recipeEntryFields(row),...quantity}).source:quantity;
  if(!reference){if(Object.keys(quantity).join(',')!=='amount')throw new CaptureValidationError('offlineServingQuantity');parseServingAmount(quantity.amount);}
  const value={...row};for(const key of ['amount','quantity','unit','portionId','portionLabel','grams'])delete value[key];Object.assign(value,source);return value;
}
export function prepareQuantityEdit(copy,id,quantity,language='en'){
  const day=copy.snapshot.state.entries.find(row=>row.id===id)?.date;if(day)assertDiaryDaysEditable(copy.snapshot.state,[day]);
  if(!foodEditAvailable(copy,id))throw Error(formatMessage(language,'offlineCorrection.unavailable'));
  const row=copy.snapshot.state.entries.find(row=>row.id===id),review=copy.snapshot.quantityReviews[id];
  return {payload:{id,date:row.date,revision:review.revision,quantity},preview:{collection:'entries',value:quantityEntry(copy.snapshot.state,row,quantity)}};
}

export function prepareFoodDetailsEdit(copy,id,changes,language='en'){
  if(!foodEditAvailable(copy,id))throw Error(formatMessage(language,'offlineCorrection.unavailable'));
  const row=copy.snapshot.state.entries.find(row=>row.id===id),normalized=parseFoodDiaryFields(changes,copy.snapshot.state.settings.groups);
  assertDiaryDaysEditable(copy.snapshot.state,[row.date,normalized.date]);
  return {type:'entry.details',payload:{id,date:row.date,revision:copy.snapshot.quantityReviews[id].revision,changes:normalized,confirmed:true},preview:{collection:'entries',value:{...row,...normalized}}};
}

export function projectPendingFoodEdit(state,snapshot,pending){
  const {id,revision,quantity,changes}=pending.command.payload;
  // The current matching record owns source facts. Stored previews cannot
  // replace ingredients omitted by an older client or newer captured facts.
  if(snapshot.quantityReviews?.[id]?.revision!==revision)return;
  const index=state.entries.findIndex(row=>row.id===id);if(index<0)return;
  const row=state.entries[index];
  try{
    assertDiaryDaysEditable(state,[row.date]);
    if(pending.command.type==='entry.details'){
      const normalized=parseFoodDiaryFields(changes,state.settings.groups);assertDiaryDaysEditable(state,[normalized.date]);state.entries[index]={...row,...normalized,_pending:true};
    }else state.entries[index]={...quantityEntry(state,row,quantity),_pending:true};
  }catch{return;}
}

export function acceptFoodEditReceipt(current,pending,result,projectRecord,language='en'){
  const {id,revision}=pending.command.payload;
  if(result.record?.collection!=='entries'||result.record.value?.id!==id||!/^[a-f0-9]{64}$/.test(result.quantityReview?.revision))throw Error(formatMessage(language,'quantity.receipt'));
  if(current.snapshot.quantityReviews?.[id]?.revision!==revision)return;
  const index=current.snapshot.state.entries.findIndex(row=>row.id===id);
  if(index<0)return;
  current.snapshot.state.entries[index]=projectRecord('entries',result.record.value);
  current.snapshot.quantityReviews[id]={...current.snapshot.quantityReviews[id],revision:result.quantityReview.revision};
}
