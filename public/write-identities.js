// Translate record references only. Names, notes and other user text are data.
export function remapWriteReferences(value, identities) {
 if(!value||typeof value!=='object')return value;
 if(Array.isArray(value)){for(const item of value)remapWriteReferences(item,identities);return value;}
 for(const [key,item] of Object.entries(value)){
  if(['id','previousId','entryId','anchorId','foodId','recipeId','mealId'].includes(key)&&typeof item==='string'&&identities[item])value[key]=identities[item];
  else if(['entryIds','memberIds'].includes(key)&&Array.isArray(item))value[key]=item.map(id=>identities[id]??id);
  else if(item&&typeof item==='object')remapWriteReferences(item,identities);
 }
 return value;
}

export function writeReceiptIdentities(row,result){
 const operation=row.command.operationId,type=row.command.type;
 const entries=result?.records?.entries?.map(item=>item.id)??result?.entryIds??[];
 if(['food.save','recipe.save','meal.save','library.edit'].includes(type)){
  const id=result?.item?.id??result?.id;
  return id&&(type!=='library.edit'||row.command.payload.mode==='preserve')?{[operation]:id}:{};
 }

 if(type==='selection.recipe'||type==='selection.meal'){
  const collection=type==='selection.recipe'?'recipes':'meals',id=result?.records?.[collection]?.[0]?.id??result?.item?.id;
  return Object.fromEntries([...(id?[[operation,id]]:[]),...(result.records?.foods??[]).map((food,index)=>[`${operation}-food-${index}`,food.id])]);
 }
 if(type==='records.copy')return Object.fromEntries(Object.entries(result?.records??{}).flatMap(([collection,rows])=>rows.map((item,index)=>[`${operation}-${collection}-${index}`,item.id])));
 if(['photo.log','meal.log','entry.expand'].includes(type)||type==='entry.add'&&row.command.payload.mealId&&result?.records?.entries?.some(item=>item.expandedFrom?.parent?.mealId))return Object.fromEntries(entries.map((id,index)=>[`${operation}-${index}`,id]));
 if(['entry.add','water.add','snapshot.add','repeat.save','note.add','note.photo.save','exercise.add'].includes(type)){
  const id=entries[0]??result?.records?.biometrics?.[0]?.id??result?.records?.notes?.[0]?.id??result?.item?.id??result?.id;
  if(id&&!(type==='note.photo.save'&&row.command.payload.id))return {[operation]:id};
 }
 return {};
}

export function remapDiaryReviewIdentities(review,identities){
 for(const ids of Object.values(review?.guard?.libraryIds??{}))for(let i=0;i<ids.length;i++)ids[i]=identities[ids[i]]??ids[i];
}
