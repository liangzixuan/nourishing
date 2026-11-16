import {requiredRecordGroup,time} from './diary-record-fields.mjs';
import {ingredientWarning} from './ingredient-warning.mjs';
import {foodQuantityReason} from './food-quantity.mjs';
import {photoPortionEvidence} from './photo-portion-estimate.mjs';
import {compactFoodSource} from './catalog-source.mjs';
import {saveIdentity} from './review-save-store.mjs';
import {isQuantityUnit} from './quantity-units.mjs';
import {contentDigest} from './content-digest.mjs';
import {catalogSourceId} from './food-catalog-identity.mjs';
import {captureLoggingRecords} from './logging-streaks.mjs';
import {parseIngredientLine} from './recipe-ingredients.mjs';
import {preparationFacts,mergePreparationFacts} from './ingredient-preparation.mjs';
import {assessIngredientMatch} from './recipe-matching.mjs';
import {resolveFoodQuantity} from './food-quantity.mjs';
import {recipeNutrition} from './nutrition.mjs';
import {act,addCatalogFood,catalogFoodForWorkspace,date,text} from './workspace.mjs';
import {reviewedFoodRows} from './reviewed-food-records.mjs';
const invalid=message=>{throw Object.assign(new Error(message),{status:400});};
const conflict=message=>{throw Object.assign(new Error(message),{status:409});};
export const reviewDigest=contentDigest;
/** Display diagnostics are assembled here; source facts remain on their owners. */
export function foodReviewIssues({parsed,conversion,match}){
  const issues=[...(parsed?.issues??[]),...(conversion?.issues??[]),...(match?.reasons??[]).map(reason=>({code:'food-match',reason}))].map(issue=>conversion?.status==='resolved'&&issue.code==='missing-quantity'?ingredientWarning('entered-quantity'):issue);
  const seen=new Set();
  return issues.filter(issue=>{const identity=issue.code==='food-match'?JSON.stringify(issue.reason):issue.explanation?JSON.stringify(issue.explanation):issue.kind==='ingredient'?JSON.stringify(issue):issue.message;if(seen.has(identity))return false;seen.add(identity);return true;});
}
const exact=(value,keys)=>value!==null&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).length===keys.length&&keys.every(key=>Object.hasOwn(value,key));
export function parseReviewedDestination(value){
  if(value===undefined)return {kind:'diary'};
  if(value?.kind==='diary'&&exact(value,['kind']))return {kind:'diary'};
  if(value?.kind==='meal'&&exact(value,['kind','name']))return {kind:'meal',name:text(value.name,'Meal name',300)};
  if(value?.kind==='recipe'&&exact(value,['kind','name','servings'])){
    if(typeof value.servings!=='number'||!Number.isFinite(value.servings)||value.servings<0.001||value.servings>100000)invalid('Enter an explicit recipe yield from 0.001 to 100,000 servings.');
    return {kind:'recipe',name:text(value.name,'Recipe name',300),servings:value.servings};
  }
  invalid('Choose a diary, named meal or named recipe destination.');
}
const rowSource=(row,foodId)=>row.unit==='servings'?{foodId,amount:row.quantity}:{foodId,quantity:row.quantity,unit:row.unit,...(row.unit==='portion'?{portionId:row.portionId}:{})};
export const reviewedRowEvidence=row=>({id:row.id,description:row.description,preparation:row.preparation,selection:row.selection,quantity:row.quantity,unit:row.unit,...(row.unit==='portion'?{portionId:row.portionId}:{}),confirmed:row.confirmed,...photoPortionEvidence(row)});
const compact=food=>{const source=typeof food.source==='object'?food.source:{name:food.source};return {id:food.id,name:food.name,serving:food.serving,grams:food.grams,...(food.milliliters!==undefined?{milliliters:food.milliliters}:{}),portions:food.portions||[],source:compactFoodSource(source),sample:food.sample===true};};
export function reviewedIngredient(description,preparation,id){
  const parsed=parseIngredientLine(description,id),extra=preparationFacts(preparation);
  return {...parsed,preparation:mergePreparationFacts(parsed.preparation,extra),...(parsed.alternatives?{alternatives:parsed.alternatives.map(option=>({...option,preparation:mergePreparationFacts(option.preparation,extra)}))}:{})};
}

export function foodReviewContext(foodCatalog,foods){
  const selected=new Map(),originals=new Map();
  return {
    get(ref){const key=JSON.stringify(ref);if(!selected.has(key)){let food=ref.kind==='catalog'?foodCatalog.get(ref.id):foods.find(x=>x.id===ref.id);if(food&&ref.kind==='catalog')food=catalogFoodForWorkspace(foods,food);if(!food)invalid('This selected food is no longer available. Choose another match.');selected.set(key,food);}return selected.get(key);},
    original(food){if(!originals.has(food.id)){let original=null;if(food.readOnly&&food.source?.archiveSha256){const installed=foodCatalog.get(catalogSourceId(food));if(installed?.source?.archiveSha256===food.source.archiveSha256)original=foodCatalog.getOriginal(catalogSourceId(food));}originals.set(food.id,original);}return originals.get(food.id);},
    originalFacts(){return [...originals.entries()];}
  };
}
export function canonicalReviewedQuantity(row,food){
  const quantity=row.quantity??null,unit=row.unit??'g',portionId=row.portionId??'';
  let conversion={status:'needs-review',amount:null,grams:null,reason:{code:'choose-food-and-quantity'}};
  if(food&&quantity!==null){
    if(unit==='servings')conversion={status:'resolved',amount:quantity,grams:Number.isFinite(food.grams)?food.grams*quantity:null,reason:{code:'reviewed-servings'}};
    else if(unit==='portion'&&!portionId)conversion.reason={code:'select-portion'};
    else {try{conversion={status:'resolved',...resolveFoodQuantity(food,{quantity,unit,portionId}),reason:{code:'reviewed-measure'}};}catch(error){if(error.status!==400)throw error;conversion.reason=foodQuantityReason(error);}}
  }else if(food)conversion.reason={code:'enter-quantity'};
  return {quantity,unit,portionId,conversion};
}
/** Convert a rejected reviewed quantity into an API error at its owning boundary. */
export function reviewedQuantityError(conversion){
 const reason=conversion.reason,messages={'choose-food-and-quantity':'Choose a food and enter its quantity.','select-portion':'Choose a recorded portion.','enter-quantity':'Enter a reviewed quantity.'};
 return Object.assign(Error(reason.sourceMessage??messages[reason.code]??'Review the ingredient quantity.'),{status:400,quantityReviewCode:reason.code});
}
/** Shared source resolution, quantity facts and nutrition preview for photo/text adapters. */
export function evaluateReviewedFoods(input,{foodCatalog,foods,settings,reviewSaves},{tokenSource,quantityForRow=canonicalReviewedQuantity,rowExtras=()=>({}),tokenRows=rows=>rows.map(reviewedRowEvidence),includeOriginals=false}={}){
  const selectedDestination=parseReviewedDestination(input.destination);
  if(!Array.isArray(input.rows)||input.rows.length>30)invalid('Review up to 30 foods.');
  date(input.date);
  requiredRecordGroup(input.group,settings.groups);
  time(input.time);
  const identities=new Set(),resolvedFoods=new Map(),catalogFoods=new Map(),items=[],context=foodReviewContext(foodCatalog,foods);
  const rows=input.rows.map((row,index)=>{
    if(!row||typeof row!=='object'||Array.isArray(row))invalid('Each reviewed food must be an object.');
    const id=text(row.id,'Food row ID',100);if(identities.has(id))invalid('Food row IDs must be unique.');identities.add(id);
    const description=typeof row.description==='string'&&row.description.trim()?text(row.description,'Food description',500):'';
    const preparation=row.preparation??'';
    if(typeof preparation!=='string'||preparation.length>100)invalid('Preparation must be text up to 100 characters.');
    if(row.confirmed!==undefined&&typeof row.confirmed!=='boolean')invalid('Food review confirmation must be true or false.');
    const confirmed=row.confirmed===true;
    let selection=null,food=null,match={requiresConfirmation:true,reasons:[]};
    if(row.selection!==null&&row.selection!==undefined){
      const ref=row.selection;
      if(!ref||!['catalog','library'].includes(ref.kind)||typeof ref.id!=='string'||!ref.id.trim()||ref.id.length>200)invalid('Choose a catalog or saved food.');
      selection={kind:ref.kind,id:ref.id};food=context.get(selection);
      if(ref.kind==='catalog')catalogFoods.set(food.id,food);
      match=description?assessIngredientMatch(reviewedIngredient(description,preparation,id),food):{requiresConfirmation:true,reasons:[{code:'missing-description',values:{}}]};
    }
    const {quantity,unit,portionId='',conversion,...quantityFacts}=quantityForRow(row,food,context);
    if(!(isQuantityUnit(unit)||['portion','servings'].includes(unit)))invalid('Choose grams, a recorded portion or food servings.');
    if(quantity!==null&&(typeof quantity!=='number'||!Number.isFinite(quantity)||quantity<=0||quantity>(unit==='servings'?100000:1000000)))invalid('Food quantity is outside its supported range.');
    if(typeof portionId!=='string')invalid('Choose a source portion.');
    if(food&&conversion.status==='resolved'){
      const previous=resolvedFoods.get(food.id);
      if(previous&&reviewDigest(previous)!==reviewDigest(food))invalid('Selected catalog and saved foods share an ID but have different facts. Use one version or create a custom copy before combining them.');
      resolvedFoods.set(food.id,food);items.push(rowSource({quantity,unit,portionId},food.id));
    }
    else items.push({foodId:`unknown-reviewed-row:${index}`,amount:1});
    const ready=Boolean(description&&food&&conversion.status==='resolved'&&confirmed);
    const nutrition=food&&conversion.status==='resolved'?recipeNutrition({foods:[food]},{servings:1,ingredients:[rowSource({quantity,unit,portionId},food.id)]}):null;
    return {id,description,preparation,selection,quantity,unit,portionId,confirmed,selectedFood:food?compact(food):null,conversion,match,issues:foodReviewIssues({parsed:quantityFacts.parsed,conversion,match}),status:ready?'ready':!food?'unmatched':conversion.status!=='resolved'?'quantity-needed':'needs-review',nutrition:nutrition?{totals:nutrition.nutrients,coverage:nutrition.coverage}:null,...quantityFacts,...rowExtras(row)};
  });
  const calculation={foods:[...resolvedFoods.values()]},recipe={servings:1,ingredients:items};
  const canSave=rows.length>0&&rows.every(row=>row.status==='ready');
  if(canSave)reviewedFoodRows(rows.map(reviewedRowEvidence));
  const reviewToken=reviewDigest({...tokenSource,destination:selectedDestination,date:input.date,group:input.group,time:input.time??'',rows:tokenRows(rows),foods:[...resolvedFoods.values()],...(includeOriginals?{originals:context.originalFacts()}:{})});
  const batch=recipeNutrition(calculation,recipe),serving=selectedDestination.kind==='recipe'?recipeNutrition(calculation,{...recipe,servings:selectedDestination.servings}):null;
  const perServing=serving?{totals:serving.nutrients,coverage:serving.coverage,attributions:serving.attributions}:null;
  return {review:{destination:selectedDestination,items,rows,attributions:batch.attributions,totals:batch.nutrients,coverage:batch.coverage,perServing,canSave,reviewToken,saveScope:reviewSaves?.saveScope()??null},catalogFoods:[...catalogFoods.values()]};
}
/** Source adapters supply provenance and optional source persistence, never duplicate commits. */
export function saveReviewedFoods(store,input,{kind,reviewSaves,evaluate,source,afterSave,createFastingPrompt,isFastingPromptCurrent}){
  const save=saveIdentity(input.save),requestDigest=reviewDigest(input);let receipt,replayed=false;
  const saved=store.update(state=>{
    receipt=reviewSaves.savedReceipt(kind,save,requestDigest);if(receipt){replayed=true;return;}
    const {review,catalogFoods}=evaluate(state);
    if(!review.canSave)invalid('Choose and confirm a food and supported quantity for every included row.');
    if(review.reviewToken!==save.reviewToken)conflict('The reviewed inputs or selected food facts changed. Preview them again before saving.');
    const diary=review.destination.kind==='diary',before=diary&&afterSave?captureLoggingRecords(state):null,entryIds=[];
    source.persist?.();for(const food of catalogFoods)addCatalogFood(state,food);
    let resource=null;
    if(diary){if(source.saveDiary)entryIds.push(...source.saveDiary(state,review));else review.items.forEach((item,index)=>{act(state,'entry.add',{date:input.date,group:input.group,time:input.time,...item,...source.entryMetadata(review,index)});entryIds.push(state.entries.at(-1).id);});}
    else{const {kind,name}=review.destination;act(state,kind+'.save',{name,...source.libraryMetadata(review),...(kind==='recipe'?{servings:review.destination.servings,cookedWeightGrams:null,ingredients:review.items}:{items:review.items})});resource={kind,id:state[kind==='recipe'?'recipes':'meals'].at(-1).id};}
    source.verify?.(state);if(diary)afterSave?.(state,before);
    const fastingPrompt=diary?createFastingPrompt?.(state,entryIds):null;
    receipt={operationId:save.operationId,scope:save.scope,destination:review.destination,...source.identity,entryIds,resource,...(fastingPrompt?{fastingPrompt}:{})};reviewSaves.recordSave(kind,save,requestDigest,receipt);
  });
  const offer=receipt.fastingPrompt&&(!replayed||isFastingPromptCurrent?.(saved,receipt.fastingPrompt))?receipt.fastingPrompt:null;
  return {state:saved,...Object.fromEntries(Object.keys(source.identity).map(key=>[key,receipt[key]])),entryIds:receipt.entryIds,resource:receipt.resource,replayed,receipt,...(offer?{fastingPrompt:offer}:{})};
}
