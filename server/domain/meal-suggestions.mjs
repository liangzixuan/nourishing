import {mealSuggestionGuidance,captureMealSuggestionGuidance} from './meal-suggestion-guidance.mjs';
import {MEAL_OPTIONS_VERSION} from './meal-suggestion-options.mjs';
import {mergeSourceAttributions} from './catalog-source.mjs';
import {isActiveLibraryItem} from './library-status.mjs';
import {isQuantityUnit} from './quantity-units.mjs';
import {catalog,calculateDailyNutrition,calculateSelectionNutrition,recipeNutrition} from './nutrition.mjs';
import {canonicalReviewedQuantity,reviewDigest,reviewedQuantityError} from './reviewed-foods.mjs';
import {recipeWeightContext} from './recipe-weight.mjs';
import {expandResourceQuantity} from './resource-expansion.mjs';
import {date as parseDate} from './workspace.mjs';
import {resolveScoreDisplay} from './nutrition-score-policy.mjs';
import {MEAL_LIBRARY} from './meal-suggestion-library.mjs';
import {MEAL_DIETS,MEAL_CATEGORIES,MEAL_EXCLUSIONS,parseMealSuggestionPolicy,parseMealSuggestionFilters,mealReference,mealReferenceKey,mealReferenceList,mealTags} from './meal-suggestion-policy.mjs';
const fail=message=>{throw Object.assign(Error(message),{status:400});};
const known=value=>typeof value==='number'&&Number.isFinite(value)&&value>=0;
const positive=value=>known(value)&&value>0;
const compare=(a,b)=>Buffer.compare(Buffer.from(a),Buffer.from(b));
const macroIds=['protein','carbs','fat'];
const seekIds=new Set(catalog.filter(row=>(['Vitamins','Minerals'].includes(row.category)&&row.id!=='sodium')||['fiber','omega3','omega6'].includes(row.id)).map(row=>row.id));
const exact=(value,required,optional=[])=>{if(!value||typeof value!=='object'||Array.isArray(value)||required.some(key=>!Object.hasOwn(value,key))||Object.keys(value).some(key=>![...required,...optional].includes(key)))fail('Meal suggestion request contains missing or unsupported fields.');};
const summary=day=>({attributions:day.attributions,totals:day.totals,targets:day.targets,nutrientCoverage:day.nutrientCoverage,carbohydrate:day.carbohydrate,scores:day.scores,complete:day.complete,logged:day.logged});
function resolvedRows(state,foodCatalog,rows,{allowSample=false}={}){
  if(!Array.isArray(rows)||!rows.length||rows.length>30)fail('Review between 1 and 30 meal ingredients.');
  return rows.map(row=>{
    exact(row,['ref','quantity','unit'],['portionId']);exact(row.ref,['kind','id']);
    if(!['catalog','library'].includes(row.ref.kind)||typeof row.ref.id!=='string'||!row.ref.id.trim())fail('Choose an exact catalog or saved food reference.');
    const food=row.ref.kind==='catalog'?foodCatalog?.get?.(row.ref.id):state.foods.find(food=>food.id===row.ref.id);
    if(!food||food.sample===true&&!allowSample)fail('A meal ingredient is unavailable or is sample data.');
    if(!positive(row.quantity)||row.quantity>(row.unit==='servings'?100000:1000000)||!(isQuantityUnit(row.unit)||['portion','servings'].includes(row.unit))||row.unit!=='portion'&&Object.hasOwn(row,'portionId'))fail('Enter a supported positive ingredient quantity.');
    const measured=canonicalReviewedQuantity(row,food);if(measured.conversion.status!=='resolved')throw reviewedQuantityError(measured.conversion);
    return {ref:{...row.ref},quantity:row.quantity,unit:row.unit,...(row.unit==='portion'?{portionId:row.portionId}:{}),food,amount:measured.conversion.amount,grams:measured.conversion.grams};
  });
}
function mealNutrition(state,rows){
  const foods=rows.map((row,index)=>({...row.food,id:String(index)})),ingredients=rows.map((row,index)=>({foodId:String(index),amount:row.amount})),calculation={settings:state.settings,foods},recipe={servings:1,ingredients};
  const facts=recipeNutrition(calculation,recipe);
  return {totals:facts.nutrients,coverage:facts.coverage,carbohydrate:facts.carbohydrate,attributions:facts.attributions};
}
// Virtual IDs keep selected catalog foods separate from changed local snapshots
// with the same source ID. The real diary and library are never rewritten.
function projectMeal(state,date,rows){
  const ids=new Set([...state.foods,...state.entries].map(row=>row.id)),foods=[...state.foods],entries=[...state.entries];
  for(const [index,row] of rows.entries()){
    let id='meal-preview:'+index;while(ids.has(id))id+=':';ids.add(id);
    foods.push({...row.food,id});
    entries.push({id,kind:'food',foodId:id,amount:row.amount,date,group:state.settings.groups[0],time:''});
  }
  return {...state,foods,entries};
}
function impact(state,date,rows,before=calculateDailyNutrition(state,date)){
  const after=calculateDailyNutrition(projectMeal(state,date,rows),date),meal=mealNutrition(state,rows);
  return {meal,before:summary(before),after:summary(after),highlighted:after.diaryDisplay.highlights.filter(row=>row.active).map(row=>row.id),scoreSelection:resolveScoreDisplay(state.settings).selected,limitations:['The preview adds only the listed ingredients and quantities to the recorded day. Unlogged intake stays unknown.','Scores use the implemented score formulas. Missing measurements and partial coverage remain visible.']};
}
export function previewSuggestedMeal({state,foodCatalog=null,input}){
  exact(input,['date','rows']);const date=parseDate(input.date),rows=resolvedRows(state,foodCatalog,input.rows,{allowSample:true});
  return {date,rows:presentMealRows(rows),...impact(state,date,rows)};
}
const refSource=ref=>({[ref.kind==='foods'?'foodId':ref.kind==='recipes'?'recipeId':'mealId']:ref.id,amount:1});
const expandedFoodRows=expanded=>expanded.map(({source})=>({ref:{kind:'library',id:source.foodId},quantity:source.quantity??source.amount,unit:source.unit??'servings',...(source.unit==='portion'?{portionId:source.portionId}:{})}));
const presentMealRows=rows=>rows.map(({food,amount,grams,...row})=>({...row,name:food.name,serving:food.serving,servingGrams:food.grams??null,servingMilliliters:food.milliliters??null,servingTranslations:food.servingTranslations??[],amount,grams,source:food.source,portions:food.portions??[]}));
/** Preview one exact ingredient without importing it or changing the diary. */
export function previewSuggestedIngredient({state,foodCatalog=null,input}){
  exact(input,['date','row']);const date=parseDate(input.date),rows=resolvedRows(state,foodCatalog,[input.row],{allowSample:true}),projected=projectMeal(state,date,rows);
  return {row:presentMealRows(rows)[0],nutrition:calculateSelectionNutrition(projected,date,[projected.entries.at(-1).id])};
}
/** Resolve an explicit search selection without importing or logging any food. */
export function resolveMealIngredient({state,foodCatalog=null,input}){
  exact(input,['selection','date'],['quantity']);exact(input.selection,['kind','id']);
  const selected=input.selection,date=parseDate(input.date),quantity=Object.hasOwn(input,'quantity')?input.quantity:{amount:1};
  exact(quantity,[],['amount','quantity','unit','portionId']);
  if(Object.hasOwn(quantity,'amount'))exact(quantity,['amount']);else exact(quantity,['quantity','unit'],['portionId']);
  if(!positive(quantity.amount??quantity.quantity))fail('Enter a supported positive ingredient quantity.');
  if(typeof selected.id!=='string'||!selected.id.trim())fail('Choose an exact food reference.');
  let rows,resource,kind;
  if(selected.kind==='catalog'){
    kind='foods';resource=foodCatalog?.get?.(selected.id);
    rows=[{ref:{kind:'catalog',id:selected.id},...(quantity.amount!==undefined?{quantity:quantity.amount,unit:'servings'}:quantity)}];
  }else{
    const ref=mealReference(selected);kind=ref.kind;resource=state[kind]?.find(item=>item.id===ref.id);
    if(!resource||!isActiveLibraryItem(resource))fail('This food or meal is unavailable.');
    rows=expandedFoodRows(expandResourceQuantity(state,{[kind==='foods'?'foodId':kind==='recipes'?'recipeId':'mealId']:ref.id,...quantity},{limit:30}));
  }
  if(!resource)fail('This food or meal is unavailable.');
  const resolved=resolvedRows(state,foodCatalog,rows,{allowSample:true}),projected=projectMeal(state,date,resolved);
  const fields=['id','name','serving','grams','milliliters','servings','ingredients','cookedWeightGrams','batchVolumeMl','portions','servingTranslations','source'];
  return {selection:{...selected},quantity:{...quantity},kind,resource:Object.fromEntries(fields.filter(key=>resource[key]!==undefined).map(key=>[key,structuredClone(resource[key])])),context:kind==='recipes'?recipeWeightContext(resource,state):{},rows:presentMealRows(resolved),nutrition:calculateSelectionNutrition(projected,date,projected.entries.slice(-resolved.length).map(row=>row.id))};
}

function customCandidate(state,ref,policy){
  const resource=state[ref.kind]?.find(row=>row.id===ref.id);if(!resource)fail('This saved food or meal no longer exists.');
  const expanded=expandResourceQuantity(state,refSource(ref),{limit:30});
  if(!expanded.length)fail('This meal has no ingredients.');
  const rows=expandedFoodRows(expanded);
  // Tag review binds to ingredient facts. Import-added display fields such as
  // an empty data-quality note do not change those facts.
  const leaves=expanded.map(({source})=>{const food=state.foods.find(row=>row.id===source.foodId);return {id:food.id,name:food.name,serving:food.serving??'1 serving',grams:food.grams??null,...(food.milliliters!==undefined?{milliliters:food.milliliters}:{}),nutrients:food.nutrients??{},portions:food.portions??[],source:food.source??'',barcode:food.barcode??''};});
  const revision=reviewDigest({ref,name:resource.name,expanded,leaves});
  const assigned=policy.tags.find(row=>mealReferenceKey(row.ref)===mealReferenceKey(ref));
  return {ref,name:resource.name,rows,revision,tags:assigned?.revision===revision?assigned.tags:null,tagStatus:assigned?.revision===revision?'reviewed':assigned?'changed-since-review':'unknown',source:{kind:'local-library',resourceKind:ref.kind}};
}
export function mealSuggestionOptions(state){
  const policy=parseMealSuggestionPolicy(state.settings?.mealSuggestions),custom=[];
  for(const kind of ['foods','recipes','meals'])for(const resource of state[kind]??[]){
    if(!isActiveLibraryItem(resource)||resource.sample===true||kind==='foods'&&resource.readOnly===true)continue;
    const ref={kind,id:resource.id};try{const candidate=customCandidate(state,ref,policy);custom.push({ref,name:candidate.name,revision:candidate.revision,tags:candidate.tags,tagStatus:candidate.tagStatus,available:true});}catch(error){if(error.status!==400)throw error;custom.push({ref,name:resource.name,available:false,reason:error.message});}
  }
  const excluded=policy.excluded.map(ref=>{
    const resource=ref.kind==='template'?MEAL_LIBRARY.find(row=>row.ref.id===ref.id):state[ref.kind]?.find(row=>row.id===ref.id);
    return {ref,name:resource?.name??'Unavailable saved suggestion',available:!!resource&&(ref.kind==='template'||isActiveLibraryItem(resource))};
  });
  return {version:MEAL_OPTIONS_VERSION,diets:MEAL_DIETS,categories:MEAL_CATEGORIES,exclusions:MEAL_EXCLUSIONS,custom,lessOften:policy.lessOften,excluded,templateCount:MEAL_LIBRARY.length};
}
function matches(tags,filters){
  const active=filters.diets.length||filters.categories.length||filters.exclusions.length;
  if(!tags)return !active||filters.includeUnknownTags;
  return filters.diets.every(value=>tags.diets.includes(value))&&(!filters.categories.length||filters.categories.some(value=>tags.categories.includes(value)))&&!filters.exclusions.some(value=>tags.exclusions.includes(value));
}
function rankMeal(meal,before){
  const facts=id=>id==='carbs'?{current:before.carbohydrate.value,target:before.carbohydrate.target,coverage:before.carbohydrate.coverage,added:meal.carbohydrate.value,mealCoverage:meal.carbohydrate.coverage}:{current:before.totals[id],target:before.targets[id],coverage:before.nutrientCoverage[id],added:meal.totals[id],mealCoverage:meal.coverage[id]};
  const measured=id=>{const row=facts(id);return row.coverage?.complete&&(row.coverage.known>0||before.complete)&&known(row.current)&&positive(row.target)&&row.mealCoverage?.complete&&known(row.added);};
  const fit=ids=>{const rows=ids.filter(measured).flatMap(id=>{const row=facts(id),remaining=row.target-row.current;return remaining>0?[{id,remaining,added:row.added,fraction:Math.min(1,row.added/remaining)}]:[];});return {components:rows,value:rows.length?rows.reduce((sum,row)=>sum+row.fraction,0)/rows.length:0};};
  const nutrients=fit([...seekIds]),macros=fit(macroIds);
  const overshoot=measured('calories')?Math.max(0,before.totals.calories+meal.totals.calories-before.targets.calories)/before.targets.calories:null;
  return {value:nutrients.value+macros.value-(overshoot??0),nutrients,macros,energyOvershootFraction:overshoot,personalized:nutrients.components.length+macros.components.length>0||overshoot!==null};
}
export function suggestMeals({state,foodCatalog=null,input,library=MEAL_LIBRARY}){
  exact(input,['date'],['filters','omit','offset','limit']);const date=parseDate(input.date),filters=parseMealSuggestionFilters(input.filters),{omit:omittedInput=[],offset=0,limit=4}=input,omit=mealReferenceList(omittedInput);
  if(!Number.isSafeInteger(offset)||offset<0||!Number.isInteger(limit)||limit<1||limit>100)fail('Choose a nonnegative offset and a result limit from 1 to 100.');
  const policy=parseMealSuggestionPolicy(state.settings?.mealSuggestions),before=calculateDailyNutrition(state,date),candidates=[],unavailable=[];
  for(const template of library){
    const rows=[];let reason=null;
    for(const ingredient of template.ingredients){const food=foodCatalog?.get?.(ingredient.ref.id);if(!food||food.name!==ingredient.name||food.source?.archiveSha256!==ingredient.archiveSha256){reason=mealSuggestionGuidance.pinnedIngredients;break;}rows.push({ref:ingredient.ref,quantity:ingredient.quantity,unit:ingredient.unit});}
    if(reason)unavailable.push({ref:template.ref,name:template.name,reason,reasonCode:'pinnedIngredients'});else candidates.push({...template,rows,revision:reviewDigest(template),tagStatus:'template-ingredients'});
  }
  if(filters.includeCustom)for(const kind of ['foods','recipes','meals'])for(const resource of state[kind]??[]){
    if(!isActiveLibraryItem(resource)||resource.sample===true||kind==='foods'&&resource.readOnly===true)continue;
    const ref={kind,id:resource.id};try{candidates.push(customCandidate(state,ref,policy));}catch(error){if(error.status!==400)throw error;unavailable.push({ref,name:resource.name,reason:error.message});}
  }
  const omitted=new Set(omit.map(mealReferenceKey)),less=new Set(policy.lessOften.map(mealReferenceKey)),excluded=new Set(policy.excluded.map(mealReferenceKey));let filteredOut=0,removedOnce=0,alwaysExcluded=0;const items=[];
  for(const candidate of candidates){
    if(excluded.has(mealReferenceKey(candidate.ref))){alwaysExcluded++;continue;}
    if(omitted.has(mealReferenceKey(candidate.ref))){removedOnce++;continue;}
    if(!matches(candidate.tags,filters)){filteredOut++;continue;}
    try{
      const rows=resolvedRows(state,foodCatalog,candidate.rows),nutrition=mealNutrition(state,rows);
      const {ingredients,...facts}=candidate;
      items.push({...facts,attributions:mergeSourceAttributions(nutrition.attributions,before.attributions),rows:presentMealRows(rows),nutrition,ranking:rankMeal(nutrition,before),lessOften:less.has(mealReferenceKey(candidate.ref))});
    }catch(error){if(error.status!==400)throw error;unavailable.push({ref:candidate.ref,name:candidate.name,reason:error.message});}
  }
  items.sort((a,b)=>Number(a.lessOften)-Number(b.lessOften)||b.ranking.value-a.ranking.value||compare(mealReferenceKey(a.ref),mealReferenceKey(b.ref)));
  return {date,filters,items:items.slice(offset,offset+limit),total:items.length,offset,nextOffset:offset+limit<items.length?offset+limit:null,coverage:{candidates:candidates.length,filteredOut,removedOnce,alwaysExcluded,eligible:items.length,unavailable},method:'local-remaining-target-and-macro-fit-minus-energy-overshoot-v1',limitations:['independent','quantities','tags','unknownTags','preferences'].map(captureMealSuggestionGuidance)};
}
export function reviewedCustomMealTags(state,ref){return customCandidate(state,mealReference(ref),parseMealSuggestionPolicy(state.settings?.mealSuggestions));}
export function applyMealSuggestionPreference(state,input){
  const policy=parseMealSuggestionPolicy(state.settings?.mealSuggestions);
  if(input?.action==='tags'){
    exact(input,['action','ref','revision','tags']);const ref=mealReference(input.ref),current=customCandidate(state,ref,policy);
    if(input.revision!==current.revision)throw Object.assign(Error('This food or its ingredients changed. Review the current tags again.'),{status:409});
    const tags=input.tags===null?null:mealTags(input.tags);policy.tags=policy.tags.filter(row=>mealReferenceKey(row.ref)!==mealReferenceKey(ref));
    if(tags)policy.tags.push({ref,revision:current.revision,tags});
  }else if(input?.action==='feedback'){
    exact(input,['action','ref','lessOften']);const ref=mealReference(input.ref,{template:true});
    if(typeof input.lessOften!=='boolean')fail('Choose an explicit Show less value.');
    if(ref.kind==='template'?!MEAL_LIBRARY.some(row=>row.ref.id===ref.id):!state[ref.kind]?.some(row=>row.id===ref.id))fail('This suggestion is no longer available.');
    policy.lessOften=policy.lessOften.filter(row=>mealReferenceKey(row)!==mealReferenceKey(ref));if(input.lessOften)policy.lessOften.push(ref);
  }else if(input?.action==='exclude'){
    exact(input,['action','ref','excluded']);const ref=mealReference(input.ref,{template:true});
    if(typeof input.excluded!=='boolean')fail('Choose an explicit exclusion value.');
    if(input.excluded&&(ref.kind==='template'?!MEAL_LIBRARY.some(row=>row.ref.id===ref.id):!state[ref.kind]?.some(row=>row.id===ref.id&&isActiveLibraryItem(row))))fail('This suggestion is no longer available.');
    policy.excluded=policy.excluded.filter(row=>mealReferenceKey(row)!==mealReferenceKey(ref));if(input.excluded)policy.excluded.push(ref);
  }else fail('Choose a tag review, suggestion feedback or exclusion action.');
  state.settings.mealSuggestions=policy;
}
