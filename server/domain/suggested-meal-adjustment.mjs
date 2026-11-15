import {textReviewGuidance} from './text-review-guidance.mjs';
import {contentDigest} from './content-digest.mjs';
import {suggestedMealName,suggestedMealRecord} from './suggested-meal-record.mjs';
import {assertDiaryDaysEditable} from './diary-day-status.mjs';
import {act} from './workspace.mjs';
const fail=(message,status=400)=>{throw Object.assign(Error(message),{status});};

export function readSuggestedMeal(state,id){
 if(typeof id!=='string'||!id)fail('Choose a logged suggested meal.');
 const entries=state.entries.filter(row=>row.suggestedMeal?.id===id);
 if(!entries.length)fail('This suggested meal no longer has diary entries.',404);
 const meal=suggestedMealRecord(entries[0].suggestedMeal),seen=new Set(),foods=[];
 if(entries.length>30)fail('This meal exceeds the 30-food review limit.');
 for(const row of entries){
  if(seen.has(row.id))fail('This meal has duplicate diary identities.',409);seen.add(row.id);
  if(contentDigest(suggestedMealRecord(row.suggestedMeal))!==contentDigest(meal))fail('This meal has conflicting links.',409);
  const matches=state.foods.filter(food=>food.id===row.foodId);
  if(!row.foodId||matches.length!==1)fail('An ingredient no longer has one food record. Edit that diary item individually before adjusting this meal.',409);
  foods.push(matches[0]);
 }
 assertDiaryDaysEditable(state,entries.map(row=>row.date));
 const revision=contentDigest({entries,foods}),first=entries[0];
 const rows=entries.map((row,index)=>({id:row.id,description:foods[index].name,preparation:'',selection:{kind:'library',id:row.foodId},confirmed:false,phrase:null,uncertainty:'',guidance:textReviewGuidance('currentQuantity'),override:{quantity:(row.quantity??row.amount)>0?(row.quantity??row.amount):null,unit:row.quantity!==undefined?row.unit:'servings',...(row.unit==='portion'?{portionId:row.portionId}:{})}}));
 const originalText=`Adjust suggested meal: ${meal.name}\n${entries.map((row,index)=>`${row.quantity??row.amount} ${row.unit??'servings'} ${foods[index].name}`).join('\n')}`;
 if(originalText.length>10000)fail('This meal exceeds the text review limit.');
 return {meal,revision,entryIds:entries.map(row=>row.id),originalText,provider:'Manual lines',notes:'Current diary ingredients. Existing source descriptions are retained; changing or removing entries also retains a workspace history snapshot.',date:first.date,group:first.group,time:first.time??'',rows};
}

export function reviewSuggestedMealChange(input,state){
 if(input.suggestedMeal!==undefined&&input.adjustMeal!==undefined)fail('Choose a new suggested meal or an adjustment.');
 if(input.suggestedMeal!==undefined)return {suggestedMeal:suggestedMealName(input.suggestedMeal)};
 if(input.adjustMeal===undefined)return {};
 const value=input.adjustMeal;
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).sort().join(',')!=='id,revision'||typeof value.revision!=='string'||!/^[a-f0-9]{64}$/.test(value.revision))fail('Reopen the meal to review its current entries.');
 if(input.destination?.kind!=='diary')fail('Meal adjustments update their diary entries.');
 const current=readSuggestedMeal(state,value.id);
 if(current.revision!==value.revision)fail('The meal or its food records changed. Reopen Adjust meal before saving.',409);
 assertDiaryDaysEditable(state,[input.date]);
 return {adjustMeal:{id:value.id,revision:value.revision},replacingEntryIds:current.entryIds,meal:current.meal};
}

/** Runs inside the shared reviewed-save transaction and receipt boundary. */
export function saveSuggestedMealEntries(store,state,input,review,entryMetadata){
 const change=review.mealChange,existing=new Set(change.replacingEntryIds??[]),ids=[];
 const meal=change.meal??suggestedMealRecord({version:1,id:input.save.operationId,...change.suggestedMeal});
 if(existing.size)store.retainSnapshot(state);
 for(const [index,item] of review.items.entries()){
  const id=review.rows[index].id,payload={date:input.date,group:input.group,time:input.time,...item,...entryMetadata(review,index),suggestedMeal:meal};
  if(existing.has(id)){act(state,'entry.update',{...payload,id});ids.push(id);existing.delete(id);}
  else{act(state,'entry.add',payload);ids.push(state.entries.at(-1).id);}
 }
 for(const id of existing)act(state,'entry.delete',{id});
 return ids;
}
