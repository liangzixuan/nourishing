import {previewLibraryResource} from './library-editor-preview.mjs';
import {normalizeLibraryDraft as normalizeLibraryDraftCore,foodPortions,foodSource,retainSourceReviews} from './library-normalization.mjs';

import {parseWaterSettings} from './water-settings.mjs';
import {fail,array,objectKeys,exactId,maxRecordCollectionRows} from './workspace-validation.mjs';
import {nutrients} from './nutrient-values.mjs';
export {nutrients} from './nutrient-values.mjs';
import {referencedRecordFacts,copyCollections,prepareRecordSelection,recordSelectionRevision,prepareRecordCopy,prepareSelectionDraft,previewClearAmounts,reviewQuantity} from './diary-selection.mjs';
export {prepareRecordSelection,captureRecordSelection,prepareSelectionDraft,previewRecordCopy,previewClearAmounts} from './diary-selection.mjs';
import {applyChartPreference} from './chart-display-command.mjs';
import {copiedDiaryRecords,recordCopyLineage} from './diary-record-copy.mjs';
import {mergeEntryUpdate} from './entry-update-fields.mjs';
import {parseProfileDemographics} from './profile-demographics.mjs';
import {scoreDisplayPatch} from './score-display-controls.mjs';
import {prepareSharedItemGraph} from './shared-item-graph.mjs';
import {reconcileInactiveEnergyTarget} from './energy-target-state.mjs';
import {reconcileNutrientTargetModes} from './nutrient-target-modes.mjs';
import {nutrientReferenceOptions} from './nutrient-references.mjs';
import {nutrientUpperLimitOptions} from './nutrient-upper-limits.mjs';
import {nutrientTargetSettingsPatch,nutrientTargetCustomPatch} from './nutrient-target-edit.mjs';
import {parseMobileChartSettings} from './mobile-chart-settings.mjs';
import {parsePauseLife} from './pause-life.mjs';
import {parseAddMenu} from './add-menu.mjs';
import {contentDigest} from './content-digest.mjs';
import {parseDiscoverSettings} from './discover-settings.mjs';
import {previewEntryExpansion} from './diary-entry-expansion.mjs';
import {capabilities} from './capabilities.mjs';
export {capabilities} from './capabilities.mjs';
import {parseAppLanguage} from './app-language.mjs';
import {parseDiaryCalendar} from './diary-calendar.mjs';
import {parseFontScale} from './font-scale.mjs';
import {suggestedMealRecord} from './suggested-meal-record.mjs';
import {catalogIdentity,catalogMeasurementBasis,sourceLocatorMatches} from './catalog-source.mjs';
import {checkLibraryDeletion,removeLibraryItem} from './library-references.mjs';
import {isQuantityUnit} from './quantity-units.mjs';
import {servingTranslationFields,validateMeasureTranslations} from './measure-translations.mjs';
import {parseFoodTranslations} from './food-translations.mjs';
import {parseFoodNotes,withoutFoodNotes} from './food-notes.mjs';
import {notePhotoFields} from './note-photo-fields.mjs';
import {foodSourceFacts,catalogSourceId,catalogSnapshotId} from './food-catalog-identity.mjs';
import {text,time,number,biometricIdentity,parseNoteFields,parseBiometricFields,parseFoodDiaryFields,requiredRecordGroup,optionalRecordGroup,parseExerciseFields,waterLimits} from './diary-record-fields.mjs';
export {text,number} from './diary-record-fields.mjs';
import {assertDiaryDaysEditable} from './diary-day-status.mjs';
import {parseHealthConnectGroup} from './health-import-group.mjs';
import {parseDiaryGroupOrder,setDiaryGroupOrder} from './diary-order.mjs';
import {editDiaryGroupSlot,renameDiaryGroup} from './diary-group-rename.mjs';
import {parseDiaryQuickAdd} from './diary-quick-add.mjs';
import {parseDiaryGroups} from './diary-group-display.mjs';
import {parseEnergyUnit} from './energy-units.mjs';
import {parseScoreSelection,resolveScoreDisplay} from './nutrition-score-policy.mjs';
import {validateIngredientSource} from './recipe-ingredient-source.mjs';
import {validateRdfaSource} from './recipe-rdfa.mjs';
import {validatePlainRecipeSource} from './recipe-plain-text.mjs';
import {validateJsonLdSource} from './recipe-jsonld.mjs';
import {canonicalizeBodyComposition} from './body-composition-migration.mjs';
import {catalogExerciseRecord} from './catalog-exercise.mjs';
import {parseCustomBiometrics} from './biometric-library.mjs';
import {parseHealthSync,mergeHealthSync,healthImportBlock} from './health-reconciliation-state.mjs';
import {parseCycleRecords,mergeCycleRecords} from './cycle-records.mjs';
import {parseFastRecord,applyFastAction} from './fasting-records.mjs';
import {parseFastingPlan,disableFastingSchedules} from './fasting-schedules.mjs';
import {parseFoodOxalateSource} from './oxalate-source.mjs';
import {date} from './calendar.mjs';
import {parseBloodPressureMapping} from './blood-pressure.mjs';
import {parseGlucoseKetoneMapping} from './glucose-ketones.mjs';
export {date} from './calendar.mjs';
import {mergeLoggingStreaks} from './logging-streaks.mjs';
import {mergeProgressSnapshots} from './progress-snapshots.mjs';
import {canonicalizeCarbohydrates} from './carbohydrate-migration.mjs';
import {parseChart} from './chart-metrics.mjs';
import {parseCoachPreferences} from './coach-preferences.mjs';
import {parseDashboardSettings} from './dashboard-settings.mjs';
import {parseCycleDisplay} from './cycle-values.mjs';
import {parseCycleChartOverlays,updateCycleChartOverlays} from './cycle-overlay-settings.mjs';
import {normalizeChart} from './chart-migration.mjs';
import {randomUUID,createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {catalog,entryFacts,isExerciseEntry,calculateSummary,calculateSelectionNutrition} from './nutrition.mjs';
import {seedFoods} from './seed-foods.mjs';
import {canonicalFoodQuantityEntry,parseVolume,resolveFoodQuantity,parseServingAmount} from './food-quantity.mjs';
import {parseFoodClassification,foodWithoutClassification} from './food-classification.mjs';
import {parseLibraryStatus,withoutLibraryStatus,isActiveLibraryItem} from './library-status.mjs';
import {applyLibraryRetirement} from './library-retirement.mjs';
import {parseFoodTaxonomy} from './food-taxonomy.mjs';
import {parseMealSuggestionPolicy} from './meal-suggestion-policy.mjs';
import {recipePortionFields} from './recipe-portions.mjs';
import {parseRecipeSourceQuantity} from './recipe-measurement.mjs';
import {recipeWeightContext} from './recipe-weight.mjs';
import {photoMetadata,photoReviewMetadata} from './photo-records.mjs';
import {textReviewMetadata} from './text-records.mjs';
import {healthMeasurementSource} from './health-records.mjs';
import {parseGlucoseTimelinePolicy} from './glucose-timeline.mjs';
import {parseEnergyPolicy} from './energy-policy.mjs';
import {parseMacroPolicy} from './macro-policy.mjs';
import {parseMacroPlan} from './macro-templates.mjs';
import {parseBodyCompositionPolicy} from './body-composition.mjs';
import {parseNutrientReferencePolicy} from './nutrient-references.mjs';
import {parseNutrientDisplayPolicy} from './nutrient-display.mjs';
import {parseNutrientUpperLimitPolicy} from './nutrient-upper-limits.mjs';
import {parseNutrientBalancePolicy} from './nutrient-balance-settings.mjs';
import {parseDiaryDisplayPolicy,parseDiaryTablePolicy} from './diary-display.mjs';
import {resourceReference} from './resource-reference.mjs';
import {parseCompositeSources} from './composite-source.mjs';
import {recipeEntryFields,recipeForEntry} from './recipe-entry.mjs';
import {parseReferencedQuantity} from './resource-quantity.mjs';
import {collectResourceDependencies,orderRecipeDependencies,recipeAncestors} from './resource-dependencies.mjs';
import {expandedDiarySources} from './resource-expansion.mjs';
import {calculateTargetSetup,validateTargetSetupRecord,setupTargetKeys} from './target-setup.mjs';
import {parseCarbohydratePolicy,parseCarbohydrateBasis,NET_CARBOHYDRATE_TARGET_ID} from './carbohydrate-policy.mjs';

export const localDate = (date = new Date()) => `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;


export function initialState({demo=false}={}) {
  const date = localDate();
  const foods = demo ? seedFoods() : [];
  return {
    version: 1, sampleData: demo,
    profile: { name: 'My workspace', age: 30, height: 170, weight: 70, activity: 'moderate', goal: 'Maintain', units: 'metric' },
    settings: { targets: { calories: 2000, protein: 100, carbs: 250, fat: 65, water: 2500 }, macroSchedule: {}, groups: ['Breakfast','Lunch','Dinner','Snacks'], customBiometrics: [], theme: 'dark', showEnergy: true, completedDays: [], scoreSelection: [], reminders: [] },
    foods, recipes: [], meals: [],
    entries: foods.slice(0,3).map((food,i) => ({id:randomUUID(),date,foodId:food.id,name:food.name,amount:i===0?1:0.5,group:'Breakfast',time:'08:00',kind:'food'})),
    biometrics: demo ? [{id:randomUUID(),date,type:'Weight',value:70,unit:'kg',time:'07:30'}] : [],
    notes: demo ? [{id:randomUUID(),date,text:'Sample workspace. Food values are illustrative; replace them with verified labels or imported data.',time:'08:00'}] : [],
    repeats: [], fasts: [], charts: [], clients: [], messages: [], templates: [], progressSnapshots: [], capabilities
  };
}

function lookup(s,collection,id) { const item=s[collection].find(x=>x.id===id); if(!item) fail(`${collection} item does not exist.`); return item; }
function save(s,collection,item) { if(item.id) { const old=lookup(s,collection,item.id); Object.assign(old,item); } else s[collection].push({...item,id:randomUUID()}); }
function remove(s,collection,id) { lookup(s,collection,id); s[collection]=s[collection].filter(x=>x.id!==id); }
function addDiaryRecord(s,collection,record){assertDiaryDaysEditable(s,[record.date]);s[collection].push({id:randomUUID(),...record});}
export function removeDiaryRecords(s,collection,ids){const selected=new Set(ids),rows=s[collection].filter(row=>selected.has(row.id));if(rows.length!==selected.size)fail(`${collection} item does not exist.`);assertDiaryDaysEditable(s,rows.map(row=>row.date));s[collection]=s[collection].filter(row=>!selected.has(row.id));}
function* resourceConsumers(s){yield* s.entries;for(const entry of s.entries){if(entry.mealItems)yield* entry.mealItems;if(entry.recipeOverride)yield* entry.recipeOverride.ingredients;}yield* (s.repeats??[]);for(const recipe of s.recipes)yield* recipe.ingredients;for(const meal of s.meals)yield* meal.items;}
function validateMeasuredConsumers(s,reference,id,next){
  const collection=reference==='foodId'?'foods':'recipes',candidate={...s,[collection]:s[collection].map(row=>row.id===id?next:row)};
  for(const row of candidate.entries)if(row.recipeOverride)parseReferencedQuantity(candidate,row);
  const affected=recipeAncestors(candidate,reference,id),ids=new Set(affected.map(recipe=>recipe.id));
  if(reference==='recipeId')ids.add(id);
  for(const recipe of affected)recipePortionFields(recipe,candidate);
  for(const row of resourceConsumers(candidate))if(row.quantity!==undefined&&(row[reference]===id||ids.has(row.recipeId)))parseReferencedQuantity(candidate,row);
}
function validateFoodMeasures(food){
  parseVolume(food.milliliters);
  for(const portion of foodPortions(food.portions??[]))resolveFoodQuantity(food,{quantity:1,unit:'portion',portionId:portion.id});
}
const favoriteCollections=new Map([['food','foods'],['recipe','recipes'],['meal','meals']]);
function favoriteReference(s,value){
  if(!value||typeof value!=='object'||Array.isArray(value)||!favoriteCollections.has(value.kind)||Object.keys(value).some(key=>!['kind','id'].includes(key)))fail('Choose a food, recipe or meal favorite.');
  const item=lookup(s,favoriteCollections.get(value.kind),exactId(value.id,'Favorite ID',200));return {kind:value.kind,id:item.id};
}
function favoriteReferences(s,value){
  const seen=new Set();return array(value,'Favorites').map(item=>{const ref=favoriteReference(s,item),key=JSON.stringify([ref.kind,ref.id]);if(seen.has(key))fail('Favorite references must be unique.');seen.add(key);return ref;});
}
function expansionLineage(value){
  objectKeys(value,['version','id','date','parent','path','previous'],'Entry expansion history');
  if(value.version!==1)fail('Entry expansion history must use version 1.');
  const parent=value.parent,reference=resourceReference(parent);
  if(!['recipeId','mealId'].includes(reference))fail('Expansion history requires a recipe or meal source.');
  objectKeys(parent,[reference,'amount','quantity','unit','portionId','mealItems','recipeOverride'],'Expansion source quantity');
  const source={[reference]:exactId(parent[reference],'Expansion resource ID',200)};
  Object.assign(source,recipeEntryFields(parent));
  if(parent.mealItems!==undefined){if(reference!=='mealId')fail('Only a meal expansion can retain meal items.');source.mealItems=parseCompositeSources(parent.mealItems);}
  if(parent.quantity!==undefined){
    if(reference!=='recipeId')fail('Expansion source quantities require a recipe.');
    Object.assign(source,parseRecipeSourceQuantity(parent));
  }else{
    if(Object.hasOwn(parent,'unit')||Object.hasOwn(parent,'portionId'))fail('Expansion serving history cannot include a measured unit.');
    source.amount=parseServingAmount(parent.amount);
  }
  const path=array(value.path,'Expansion source path',2);
  if(!path.length||(reference==='recipeId'&&path.length!==1))fail('Expansion history requires its ordered ingredient path.');
  const parsed=path.map((part,index)=>{
    objectKeys(part,['kind','id','index'],'Expansion path item');
    const kind=index===0?(reference==='recipeId'?'recipe':'meal'):'recipe';
    if(part.kind!==kind||!Number.isInteger(part.index))fail('Expansion history contains an invalid ingredient path.');
    const id=exactId(part.id,'Expansion path resource ID',200);if(index===0&&id!==source[reference])fail('Expansion path must start at its recorded source.');
    return {kind,id,index:number(part.index,'Expansion item index',0,999)};
  });
  return {version:1,id:exactId(value.id,'Expanded record ID'),date:date(value.date),parent:source,path:parsed,...(value.previous!==undefined?{previous:expansionLineage(value.previous)}:{})};
}
function entry(s,p) {
  const reference=resourceReference(p);
  const fields=['id','date','amount','group','time','kind','photo','textReview','suggestedMeal','repeatId','copiedFrom','expandedFrom','name',...(reference?[reference]:['nutrients','carbohydrateBasis']),...(reference==='foodId'?['quantity','unit','portionId','portionLabel','grams','milliliters']:reference==='recipeId'?['quantity','unit','portionId','recipeOverride']:reference==='mealId'?['mealItems']:[])];
  if(Object.keys(p).some(key=>!fields.includes(key)))fail('Diary entry contains fields that do not belong to its selected food, recipe or meal.');
  if(p.kind!==undefined&&p.kind!=='food')fail('Use the exercise action for exercise records.');
  const parsed=reference?parseReferencedQuantity(s,p,{reference,defaultAmount:1}):null;
  const result={date:date(p.date),...(parsed?parsed.source:{amount:parseServingAmount(p.amount??1)}),group:text(p.group??s.settings.groups[0],'Group',100),time:time(p.time),kind:'food',...recordCopyLineage(p,'entries')};
  if(p.photo!==undefined)result.photo=photoMetadata(p.photo);
  if(p.textReview!==undefined)result.textReview=textReviewMetadata(p.textReview);
  if(p.suggestedMeal!==undefined)result.suggestedMeal=suggestedMealRecord(p.suggestedMeal);
  if(p.expandedFrom!==undefined)result.expandedFrom=expansionLineage(p.expandedFrom);
  requiredRecordGroup(result.group,s.settings.groups);
  if(parsed)result.name=parsed.resource.name;
  else { result.name=text(p.name,'Entry name',300); result.nutrients=nutrients(p.nutrients||{});Object.assign(result,parseCarbohydrateBasis(p)); }
  return result;
}
// The recorded quantity and portion ID are authoritative. Old display caches
// are removed once at the boundary and never become a runtime fallback.
export function canonicalizeFoodMeasurements(state){
  let examined=0,changed=0;
  state.entries=state.entries.map(row=>{
    if(!row.foodId||row.quantity===undefined)return row;
    examined++;const next=canonicalFoodQuantityEntry(row),differs=Object.keys(next).length!==Object.keys(row).length;
    entry(state,next);if(differs)changed++;return next;
  });
  return {examined,changed};
}
function validateTargets(input) {
  if(!input||typeof input!=='object'||Array.isArray(input))fail('Targets must be an object.');
  const raw={...input};delete raw[NET_CARBOHYDRATE_TARGET_ID];const result=nutrients(raw);
  for(const [id,value]of Object.entries(input))if(value===null)result[id]=null;
  if(Object.hasOwn(input,NET_CARBOHYDRATE_TARGET_ID)&&input[NET_CARBOHYDRATE_TARGET_ID]!==null&&input[NET_CARBOHYDRATE_TARGET_ID]!=='')result[NET_CARBOHYDRATE_TARGET_ID]=number(input[NET_CARBOHYDRATE_TARGET_ID],NET_CARBOHYDRATE_TARGET_ID);
  return result;
}
export function prepareTargetSetup(input){const plan=calculateTargetSetup(input);validateTargets(plan.targets);return plan;}
function timestamp(value,name) { const d=new Date(value); if(!Number.isFinite(d.getTime())) fail(`${name} must be a valid timestamp.`); return d.toISOString(); }
function repeatMatches(r,day){
  return r.enabled!==false&&day>=r.startDate&&(!r.endDate||day<=r.endDate)&&r.days.includes(new Date(`${day}T12:00:00Z`).getUTCDay());
}
function repeatSource(s,r,day){
  const quantity=parseReferencedQuantity(s,r).source;
  const source=entry(s,{...quantity,group:r.group,time:r.time,date:day});
  const fingerprint=createHash('sha256').update(JSON.stringify({day,repeat:r,alwaysExpandMeals:s.settings.alwaysExpandMeals===true,resources:referencedRecordFacts(s,[source])})).digest('hex');
  return {source,fingerprint};
}
export function previewRepeats(s,p){
  const day=date(p.date),items=[];let alreadyLogged=0;
  const applied=new Set(s.entries.filter(row=>row.date===day&&row.repeatId).map(row=>row.repeatId));
  for(const repeat of s.repeats){
    if(!repeatMatches(repeat,day))continue;
    if(applied.has(repeat.id)){alreadyLogged++;continue;}
    const prepared=repeatSource(s,repeat,day),facts=entryFacts(s,prepared.source),keys=['calories','protein','carbs','fat'];
    const quantity=reviewQuantity(facts);
    items.push({id:repeat.id,fingerprint:prepared.fingerprint,attributions:facts.attributions,name:facts.name,quantity,group:facts.group,time:facts.time,nutrients:Object.fromEntries(keys.map(key=>[key,facts.nutrients[key]])),nutrientCoverage:Object.fromEntries(keys.map(key=>[key,facts.coverage[key]]))});
  }
  return {version:1,date:day,items,alreadyLogged};
}
function applyReviewedRepeats(s,p){
  const day=date(p.date),selected=array(p.items,'Reviewed repeat items',100000),ids=new Set(),prepared=[];
  if(!selected.length)fail('Review and select at least one repeat item.');
  const applied=new Set(s.entries.filter(row=>row.date===day&&row.repeatId).map(row=>row.repeatId));
  for(const item of selected){
    if(!item||typeof item!=='object'||Array.isArray(item)||Object.keys(item).some(key=>!['id','fingerprint'].includes(key)))fail('Choose reviewed repeat items.');
    text(item.id,'Repeat ID',100);if(ids.has(item.id))fail('Select each repeat item once.');ids.add(item.id);
    if(typeof item.fingerprint!=='string'||!/^[a-f0-9]{64}$/.test(item.fingerprint))fail('Preview each repeat item before logging it.');
    const repeat=s.repeats.find(row=>row.id===item.id);
    if(!repeat)throw Object.assign(Error('A selected repeat no longer exists. Review the schedules again.'),{status:409});
    if(applied.has(repeat.id))continue;
    if(!repeatMatches(repeat,day))throw Object.assign(Error('This repeat selection changed. Review the date and schedules again.'),{status:409});
    const current=repeatSource(s,repeat,day);
    if(current.fingerprint!==item.fingerprint)throw Object.assign(Error('A schedule or its food definition changed. Review the repeat selection again.'),{status:409});
    prepared.push({...current.source,id:randomUUID(),repeatId:repeat.id});
  }
  appendLoggedDiaryRows(s,prepared);
}
function saveRepeat(s,p){
  if(p.enabled!==undefined&&typeof p.enabled!=='boolean')fail('Schedule enabled state must be true or false.');
  const reference=resourceReference(p);if(!reference)fail('Choose exactly one food, recipe or meal for this schedule.');
  const startDate=date(p.startDate),endDate=p.endDate?date(p.endDate):null,days=array(p.days,'Days',7);
  if(!days.length||days.some(day=>!Number.isInteger(day)||day<0||day>6)||new Set(days).size!==days.length)fail('Choose one or more distinct weekdays.');
  if(endDate&&endDate<startDate)fail('End date must follow start date.');
  const quantity=parseReferencedQuantity(s,p,{defaultAmount:1}).source;
  const validated=entry(s,{...quantity,date:startDate,group:p.group??s.settings.groups[0],time:p.time});
  const next={id:p.id||randomUUID(),...quantity,group:validated.group,time:validated.time,days,startDate,endDate,enabled:p.enabled??true};
  // A schedule is a complete value. Replacing it removes the previous resource
  // reference when the user changes between food, recipe and meal.
  if(p.id){const previous=lookup(s,'repeats',p.id);s.repeats[s.repeats.indexOf(previous)]=next;}else s.repeats.push(next);
}
function exerciseRecord(s,p) {return {...parseExerciseFields({...p,group:p.group||s.settings.groups[0]},s.settings.groups),...(p.photo===undefined?{}:{photo:photoMetadata(p.photo)}),...recordCopyLineage(p,'entries')};}

export function parseBiometricRecord(p,groups){const record={...parseBiometricFields(p),...recordCopyLineage(p,'biometrics')};Object.assign(record,optionalRecordGroup(p,groups));if(p.source!==undefined)record.source=healthMeasurementSource(p.source,record);return record;}
export function parseNoteRecord(p,groups){return {...parseNoteFields(p),...optionalRecordGroup(p,groups),...recordCopyLineage(p,'notes'),...notePhotoFields(p)};}
function resolveGroupedRecordSelection(s,input,extraFields=[]){
  const refs=array(input.records,'Selected records');
  if(!refs.length)fail('Select at least one diary record.');
  for(const ref of refs){
    objectKeys(ref,['collection','id','group',...extraFields],'Selected record');
    if(!Object.hasOwn(ref,'group')||(ref.group!==null&&typeof ref.group!=='string'))fail('Supply the current group for each selected record.');
  }
  const {records}=prepareRecordSelection(s,{date:input.date,scope:'selected',records:refs.map(({collection,id})=>({collection,id}))});
  for(let i=0;i<records.length;i++)if((records[i].row.group??null)!==refs[i].group)throw Object.assign(Error('A selected record changed groups. Reload the diary before changing it.'),{status:409});
  return records;
}
function setRecordTimes(s,input){
  objectKeys(input,['date','records','time'],'Diary timestamps');
  if(typeof input.time!=='string')fail('Supply a time, or an empty string to remove timestamps.');
  const targetTime=time(input.time);
  for(const ref of array(input.records,'Selected records')){
    if(typeof ref?.time!=='string')fail('Supply the current timestamp for each diary entry.');
    time(ref.time);
  }
  const records=resolveGroupedRecordSelection(s,input,['time']);
  for(let i=0;i<records.length;i++){
    const {row}=records[i],ref=input.records[i];
    if((row.time??'')!==ref.time)throw Object.assign(Error('A selected timestamp changed. Reload the diary before editing it.'),{status:409});
  }
  assertDiaryDaysEditable(s,records.map(({row})=>row.date));
  for(const {row}of records)row.time=targetTime;
}
function moveRecordGroups(s,input){
  objectKeys(input,['date','group','records'],'Diary movement');
  if(typeof input.group!=='string'||!s.settings.groups.includes(input.group))fail('Choose an existing destination group.');
  const records=resolveGroupedRecordSelection(s,input);
  // Group is local presentation metadata. Validate the whole batch before
  // changing it, and retain all current source facts and record identities.
  assertDiaryDaysEditable(s,records.map(({row})=>row.date));
  for(const {row}of records)row.group=input.group;
}
function expandedDiaryChild(s,source){
  const child=entry(s,source);
  if(source.repeatId!==undefined)child.repeatId=exactId(source.repeatId,'Repeat ID');
  return child;
}
function expandedDiaryItems(s,original){
  const normalized=entry(s,original);
  return expandedDiarySources(s,{...original,...normalized}).map(source=>expandedDiaryChild(s,source));
}
function loggedDiaryRows(s,original){
  return s.settings.alwaysExpandMeals===true&&original.mealId?expandedDiaryItems(s,original).map(row=>({...row,id:randomUUID()})):[original];
}
function appendLoggedDiaryRows(s,rows){
  const prepared=rows.flatMap(row=>loggedDiaryRows(s,row));
  assertDiaryDaysEditable(s,prepared.map(row=>row.date));
  if(s.entries.length+prepared.length>maxRecordCollectionRows)fail('Logging would exceed the 100000-entry workspace format.');
  s.entries.push(...prepared);
}
export function applyEntryExpansion(s,p){
  objectKeys(p,['date','id','fingerprint','confirmed','alwaysExpandMeals'],'Diary expansion confirmation');
  if(p.confirmed!==true||typeof p.fingerprint!=='string'||!/^[a-f0-9]{64}$/.test(p.fingerprint))fail('Preview and confirm this entry before expanding it.');
  if(p.alwaysExpandMeals!==undefined&&typeof p.alwaysExpandMeals!=='boolean')fail('Always expand meals must be true or false.');
  const review=previewEntryExpansion(s,{date:p.date,id:p.id});
  if(p.alwaysExpandMeals&&!s.entries.find(row=>row.id===p.id)?.mealId)fail('The always-expand choice applies to meals.');
  if(review.fingerprint!==p.fingerprint){
    // Previously queued expansions used the serialized source as their fingerprint.
    const original=s.entries.find(row=>row.id===review.id),legacy=createHash('sha256').update(JSON.stringify({original,resources:referencedRecordFacts(s,[original])})).digest('hex');
    if(legacy!==p.fingerprint)throw Object.assign(Error('The source entry or its ingredients changed. Review expansion again.'),{status:409});
  }
  assertDiaryDaysEditable(s,[review.date]);
  const children=review.items.map(item=>({...expandedDiaryChild(s,item),id:randomUUID()})),index=s.entries.findIndex(row=>row.id===p.id);
  s.entries.splice(index,1,...children);if(p.alwaysExpandMeals)s.settings.alwaysExpandMeals=true;return {parentId:p.id,childIds:children.map(row=>row.id)};
}
function reviewedSelectionDraft(s,p){
  if(typeof p.fingerprint!=='string'||!/^[a-f0-9]{64}$/.test(p.fingerprint))fail('Review the selected source and draft before saving.');
  const prepared=prepareSelectionDraft(s,{kind:p.kind,selection:p.selection});
  if(prepared.fingerprint!==p.fingerprint)throw Object.assign(Error('The selected records or library changed. Reopen the selection and review the draft again.'),{status:409});
  return prepared;
}
function prepareSelectionDraftSave(s,p){
  const prepared=reviewedSelectionDraft(s,p);
  const field=p.kind==='recipe'?'ingredients':'items';
  objectKeys(p.draft,p.kind==='recipe'?['name','servings','serving','servingBasis','cookedWeightGrams','batchVolumeMl','ingredients','instructions','source','servingTranslations','portions','categoryId','tags']:['name','items'],'New reusable item');
  const items=array(p.draft[field],'Reusable item rows',1000);if(!items.length)fail('Keep at least one item in the draft.');
  for(const item of items)objectKeys(item,['foodId','recipeId','amount','quantity','unit','portionId'],'Reusable item row');
  const referenced=new Set(items.map(item=>item.foodId)),inline=prepared.inlineFoods.filter(food=>referenced.has(food.id)),collection=favoriteCollections.get(p.kind);
  return {field,items,inline,collection};
}
function saveSelectionDraft(s,p,context){
  objectKeys(p,['kind','selection','fingerprint','confirmed','draft','catalogSources','barcodeSources'],'Reusable item save');
  if(p.confirmed!==true)fail('Review the selected source and draft before saving.');
  const {field,items,inline,collection}=prepareSelectionDraftSave(s,p);
  if(s[collection].length>=maxRecordCollectionRows||s.foods.length+inline.length>maxRecordCollectionRows)fail('This save would exceed the 100000-row workspace collection format.');
  const candidate=structuredClone(s),ids=new Map();
  for(const food of inline){const input={...food};delete input.id;const saved=act(candidate,'food.save',input);ids.set(food.id,saved.id);}
  // Capture newly chosen catalog foods after validating the original selection.
  for(const {foodId} of items){const food=context?.catalogFoods?.get(foodId);if(food&&!ids.has(foodId))ids.set(foodId,captureCatalogFood(candidate,food).id);}
  const draft={...p.draft,[field]:items.map(item=>item.foodId&&ids.has(item.foodId)?{...item,foodId:ids.get(item.foodId)}:item)};
  const saved=act(candidate,`${p.kind}.save`,{...draft,catalogSources:p.catalogSources,barcodeSources:p.barcodeSources},context);Object.assign(s,candidate);return saved;
}
// Resolved food quantities have one preview representation shared by copy and repeat.
function applyRecordCopy(s,p){
  objectKeys(p,['selection','destination','fingerprint','confirmed'],'Record copy');
  if(p.confirmed!==true||typeof p.fingerprint!=='string'||!/^[a-f0-9]{64}$/.test(p.fingerprint))fail('Review and confirm the selected records before copying.');
  const prepared=prepareRecordCopy(s,{selection:p.selection,destination:p.destination});
  if(prepared.fingerprint!==p.fingerprint)throw Object.assign(Error('The source or destination changed. Review the records again before copying.'),{status:409});
  if(!prepared.records.length)fail('Select at least one record to copy.');
  assertDiaryDaysEditable(s,[prepared.destination.date]);
  const additions={entries:0,biometrics:0,notes:0};for(const item of prepared.records)additions[item.collection]++;
  for(const collection of copyCollections)if(s[collection].length+additions[collection]>maxRecordCollectionRows)fail(`Copy would exceed the workspace limit of ${maxRecordCollectionRows} ${collection} records. Remove records before copying.`);
  for(const {collection,row} of prepared.records)recordCopyLineage(row,collection);
  const copies=copiedDiaryRecords(prepared.records,prepared.destination,()=>randomUUID()).map(({collection,record:input})=>{
    const id=input.id;delete input.id;
    const record=collection==='entries'?(input.kind==='exercise'?exerciseRecord(s,{...input,calories:input.caloriesBurned}):entry(s,input)):collection==='biometrics'?parseBiometricRecord(input):parseNoteRecord(input);
    return {collection,record:{...record,id}};
  });
  for(const {collection,record}of copies)s[collection].push(record);
}
function recipeReviewMetadata(value) {
  if(!value||typeof value!=='object'||Array.isArray(value)||value.version!==1)fail('Invalid recipe import provenance.');
  const originals=array(value.originalIngredients,'Original recipe ingredients',1000);
  const rows=array(value.rows,'Recipe review rows',1000);
  if(!originals.length||originals.length!==rows.length)fail('Recipe provenance must retain every original ingredient line.');
  originals.forEach(line=>text(line,'Original ingredient line',10000));
  if(value.ingredientSource!==undefined)validateIngredientSource(value.ingredientSource,originals);
  if(value.jsonldSource!==undefined)validateJsonLdSource(value.jsonldSource,originals,value.ingredientSource);
  if(value.rdfaSource!==undefined)validateRdfaSource(value.rdfaSource);
  if(value.plainTextSource!==undefined){validatePlainRecipeSource(value.plainTextSource,originals);if(value.sourceConfirmed!==true)fail('Confirm the extracted ingredient list before retaining plain recipe provenance.');}
  rows.forEach((row,index)=>{if(!row||row.id!==String(index))fail('Invalid recipe provenance row identity.');text(row.original,'Reviewed ingredient line',10000);});
  const encoded=JSON.stringify(value);if(Buffer.byteLength(encoded)>16777216)fail('Recipe provenance exceeds 16 MiB.');
  return JSON.parse(encoded);
}
function portableEntryBasis(row){
  const basis=parseCarbohydrateBasis(row);
  if(Object.hasOwn(row,'carbohydrateBasis')&&(resourceReference(row)||isExerciseEntry(row)))fail('Carbohydrate basis metadata applies only to inline nutrient entries.');
  return basis;
}
function parseCatalogFood(input) {
  if(!input||input.readOnly!==true||input.sample!==false)fail('Invalid catalog food snapshot.');
  const source=foodSource(input.source),identity=catalogIdentity(source);
  if(!identity)fail('Catalog food identity does not match its source.');
  const measures=catalogMeasurementBasis(source);
  if(!measures||input.grams!==measures.grams||input.serving!==measures.serving||input.milliliters!==measures.milliliters)fail('Invalid catalog food measurement basis.');
  validateMeasureTranslations(input);
  const translations=parseFoodTranslations(input);
  if(identity.provider==='usda'&&(input.servingTranslations?.length||input.portions?.some(p=>p.translations?.length)||translations.translations))fail('Create a custom copy to translate USDA foods or serving labels.');
  if(['cnf','cofid','afcd','nevo','bls','frida'].includes(identity.provider)&&!sourceLocatorMatches(source))fail('Catalog food locator does not match its source.');
  if(parseFoodNotes(input).notes)fail('Create a custom copy to add personal notes to a catalog food.');
  parseFoodOxalateSource(input);
  const classification=parseFoodClassification(input);parseFoodTaxonomy(input);parseLibraryStatus(input);
  const carbohydrateBasis=parseCarbohydrateBasis(input),portions=foodPortions(input.portions||[]);
  const food={id:input.id,name:text(input.name,'Food name',500),...measures,nutrients:nutrients(input.nutrients),portions,source,dataQuality:typeof input.dataQuality==='string'?input.dataQuality.slice(0,4000):'',sample:false,readOnly:true,...classification,...carbohydrateBasis,...translations,...servingTranslationFields(input)};
  if(food.id!==identity.id&&food.id!==catalogSnapshotId(food))fail('Catalog food identity does not match its source or captured facts.');
  return food;
}
// A catalog selection and a saved immutable copy have different lifetimes.
export function catalogFoodForWorkspace(foods,input) {
  const food=parseCatalogFood(input),snapshotId=catalogSnapshotId(food);
  const captured=foods.find(row=>row.id===snapshotId);
  if(captured){if(!isDeepStrictEqual(foodSourceFacts(captured),foodSourceFacts(food)))fail('The saved catalog snapshot has conflicting facts.');return captured;}
  const existing=foods.find(row=>row.id===food.id);
  if(!existing||isDeepStrictEqual(foodSourceFacts(existing),foodSourceFacts(food)))return existing??food;
  const profile=food.source.normalizerSha256;
  if(existing.readOnly!==true||catalogSourceId(existing)!==catalogSourceId(food)||existing.source.archiveSha256!==food.source.archiveSha256||!/^([a-f0-9]{64})$/.test(profile??'')||profile===existing.source.normalizerSha256)fail('A different food already has this source identity. Existing data was kept.');
  return {...food,id:snapshotId};
}
export function addCatalogFood(s,input) {
  const food=parseCatalogFood(input),existing=s.foods.find(row=>row.id===food.id);
  if(existing){if(!isDeepStrictEqual(foodSourceFacts(existing),foodSourceFacts(food)))fail('A different food already has this source identity. Existing data was kept.');return existing;}
  s.foods.push(food);return food;
}
export const captureCatalogFood=(state,input)=>addCatalogFood(state,catalogFoodForWorkspace(state.foods,input));
const ingredientSourceConflict=message=>{throw Object.assign(Error(message),{status:409});};
/** Read a catalog ingredient without persisting its immutable snapshot. */
export function readLibraryCatalogIngredient(state,input,foodCatalog){
  objectKeys(input,['catalogId'],'Catalog ingredient');
  const catalogId=exactId(input.catalogId,'Catalog ingredient ID',1000),installed=foodCatalog?.get(catalogId);
  if(!installed)ingredientSourceConflict('This catalog ingredient is no longer available. Choose it again.');
  const food=catalogFoodForWorkspace(state.foods,installed);
  if(!isActiveLibraryItem(food))ingredientSourceConflict('This ingredient was retired. Choose an active item.');
  const catalogSource={catalogId,foodId:food.id,revision:contentDigest(foodSourceFacts(food))};
  return {version:1,food,catalogSource:state.foods.some(row=>row.id===food.id)?null:catalogSource};
}
/** Ingredient descriptors carry identity and revision only; source owners retain all facts.
 * Unused descriptors are validated but never materialized. */
export function resolveLibraryIngredientSources(state,{kind,draft,catalogSources,barcodeSources},{foodCatalog,barcodeIngredients}={}){
  if(catalogSources===undefined&&barcodeSources===undefined)return state;
  if(!['recipe','meal'].includes(kind))fail('Ingredients belong to a recipe or meal.');
  const sources=array(catalogSources??[],'Catalog ingredients',1000),scanned=array(barcodeSources??[],'Scanned ingredients',1000),seen=new Set(),field=kind==='recipe'?'ingredients':'items';
  if(catalogSources===null||barcodeSources===null||sources.length+scanned.length>1000)fail('Supply at most 1000 ingredient sources.');
  const used=new Set((Array.isArray(draft?.[field])?draft[field]:[]).map(row=>row?.foodId)),candidate={...state,foods:[...state.foods]};
  for(const source of sources){
    objectKeys(source,['catalogId','foodId','revision'],'Catalog ingredient source');
    const catalogId=exactId(source.catalogId,'Catalog ingredient ID',1000),foodId=exactId(source.foodId,'Ingredient food ID',1000);
    if(typeof source.revision!=='string'||!/^([a-f0-9]{64})$/.test(source.revision))fail('Choose the catalog ingredient again.');
    if(seen.has(foodId))fail('Declare each catalog ingredient once.');seen.add(foodId);
    if(!used.has(foodId))continue;
    const installed=foodCatalog?.get(catalogId);if(!installed)ingredientSourceConflict('This catalog ingredient is no longer available. Choose it again.');
    const food=catalogFoodForWorkspace(candidate.foods,installed);
    if(food.id!==foodId)ingredientSourceConflict('The catalog ingredient identity changed. Choose it again.');
    if(contentDigest(foodSourceFacts(food))!==source.revision)ingredientSourceConflict('The catalog ingredient changed. Choose it again and review the draft.');
    if(!isActiveLibraryItem(food))ingredientSourceConflict('This ingredient was retired. Choose an active item.');
    addCatalogFood(candidate,food);
  }
  for(const source of scanned){
    objectKeys(source,['foodId','revision'],'Scanned ingredient source');
    const foodId=exactId(source.foodId,'Ingredient food ID',1000);
    if(typeof source.revision!=='string'||!/^([a-f0-9]{64})$/.test(source.revision))fail('Scan the ingredient again.');
    if(seen.has(foodId))fail('Declare each ingredient once.');seen.add(foodId);
    if(!used.has(foodId))continue;
    const existing=candidate.foods.find(food=>food.id===foodId),food=existing??barcodeIngredients?.get(foodId);
    if(!food||food.id!==foodId)ingredientSourceConflict('This scanned ingredient expired. Scan it again.');
    if(!isActiveLibraryItem(food)||contentDigest(food)!==source.revision)ingredientSourceConflict('This scanned ingredient changed. Choose it again and review the draft.');
    if(!existing)candidate.foods.push(food);
  }
  if(candidate.foods.length>maxRecordCollectionRows)fail('This save would exceed the 100000-row workspace collection format.');
  return candidate;
}
function saveCompositeLibraryDraft(state,kind,input,options={}){
  const {catalogSources,barcodeSources,...draft}=input,context=resolveLibraryIngredientSources(state,{kind,draft,catalogSources,barcodeSources},options),collection=kind+'s';
  const next=normalizeLibraryDraft(context,kind,draft),candidate={...context,[collection]:[...state[collection]]};
  const id=persistLibraryDraft(candidate,kind,next);
  state.foods=candidate.foods;state[collection]=candidate[collection];return {kind,id};
}
export function readDiaryQuantity(s,input){
  objectKeys(input,['date','id'],'Diary quantity');
  const {selection,records}=prepareRecordSelection(s,{date:input.date,scope:'selected',records:[{collection:'entries',id:input.id}]});
  const row=records[0].row;if(isExerciseEntry(row))fail('Choose a food, recipe or meal to edit its quantity.');
  assertDiaryDaysEditable(s,[row.date]);
  const reference=resourceReference(row),kind=reference==='foodId'?'foods':reference==='recipeId'?'recipes':reference==='mealId'?'meals':'inline';
  const revision=recordSelectionRevision(s,records),baseResource=reference?lookup(s,kind,row[reference]):null,resource=kind==='recipes'?recipeForEntry(baseResource,row):baseResource;
  return {date:selection.date,id:row.id,entry:structuredClone(row),kind,resource:resource?structuredClone(resource):null,revision,...(kind==='recipes'?{weightContext:recipeWeightContext(resource,s)}:{})};
}
function setEntryQuantity(s,input){
  objectKeys(input,['date','id','revision','quantity'],'Diary quantity edit');
  if(typeof input.revision!=='string'||!/^[a-f0-9]{64}$/.test(input.revision))fail('Supply the quantity review revision.');
  const q=input.quantity;
  objectKeys(q,['amount','quantity','unit','portionId'],'Quantity');
  const keys=Object.keys(q).sort().join(',');
  if(!(keys==='amount'||(keys==='quantity,unit'&&(isQuantityUnit(q.unit)||q.unit==='batch'))||(keys==='portionId,quantity,unit'&&q.unit==='portion')))fail('Supply a serving amount, grams, a recorded portion or full recipes.');
  const review=readDiaryQuantity(s,{date:input.date,id:input.id});
  if(review.revision!==input.revision)throw Object.assign(Error('The entry or its source changed. Reopen the quantity editor.'),{status:409});
  updateEntry(s,{id:input.id,...q});
}

function setEntryDetails(s,input){
  objectKeys(input,['date','id','revision','changes','confirmed'],'Food diary correction');
  if(input.confirmed!==true)fail('Review and confirm the food date, time and group changes.');
  if(typeof input.revision!=='string'||!/^[a-f0-9]{64}$/.test(input.revision))fail('Supply the food review revision.');
  const review=readDiaryQuantity(s,{date:input.date,id:input.id});
  if(review.revision!==input.revision)throw Object.assign(Error('The entry or its source changed. Reopen the food editor.'),{status:409});
  const changes=parseFoodDiaryFields(input.changes,s.settings.groups);
  updateEntry(s,{id:input.id,...changes});
}
function prepareEntryUpdate(s,p){
  const old=lookup(s,'entries',p.id);if(old.kind==='exercise')fail('Delete and add an exercise to change it.');
  const merged=mergeEntryUpdate(old,p);
  const next={...entry(s,merged),id:old.id,...(old.repeatId?{repeatId:old.repeatId}:{})};
  assertDiaryDaysEditable(s,[old.date,next.date]);
  retainSourceReviews(next,old,merged,['foodId','recipeId','mealId','mealItems','recipeOverride','amount','quantity','unit','portionId','nutrients','carbohydrateBasis']);
  return {old,next};
}
/** Read-only preview through the same parser and update preparation as saving. */
export function previewDiaryItem(s,p){
  if(!p||typeof p!=='object'||Array.isArray(p))fail('Choose a food, recipe or meal.');
  const next=p.id?prepareEntryUpdate(s,p).next:{...entry(s,p),id:randomUUID()};
  if(!resourceReference(next))fail('Choose a food, recipe or meal.');
  assertDiaryDaysEditable(s,[next.date]);
  const candidate={...s,entries:[...s.entries.filter(row=>row.id!==next.id),next]};
  return {version:1,nutrition:calculateSelectionNutrition(candidate,next.date,[next.id])};
}
function updateEntry(s,p){
  const {old,next}=prepareEntryUpdate(s,p);s.entries[s.entries.indexOf(old)]=next;
}

function clearDiaryAmounts(s,p){
  objectKeys(p,['selection','fingerprint','confirmed'],'Clear amounts confirmation');
  if(p.confirmed!==true||typeof p.fingerprint!=='string'||!/^[a-f0-9]{64}$/.test(p.fingerprint))fail('Review and confirm the amounts before clearing them.');
  if(p.selection?.scope!=='selected')fail('Confirm the exact food records from the preview.');
  const review=previewClearAmounts(s,{selection:p.selection});
  if(review.fingerprint!==p.fingerprint)throw Object.assign(Error('The selected entries or their food sources changed. Review Clear amounts again.'),{status:409});
  if(review.total!==p.selection.records.length)fail('The confirmation must contain only reviewed food records.');
  const planned=review.selection.records.map(({id})=>{const row=lookup(s,'entries',id);return prepareEntryUpdate(s,{id,...(row.quantity!==undefined?{quantity:0}:{amount:0})});});
  for(const {old,next}of planned)s.entries[s.entries.indexOf(old)]=next;
}

// Import provenance is validated on the server before the shared draft normalizer.
export function normalizeLibraryDraft(state,kind,draft){
  if(kind==='recipe'&&draft?.importReview!==undefined)draft={...draft,importReview:recipeReviewMetadata(draft.importReview)};
  return normalizeLibraryDraftCore(state,kind,draft);
}
/** Review an unsaved library item through the save validator and diary quantity owner.
 * A separate hypothetical identity keeps existing diary consumers unchanged.
 * This is a library review, so completed diary days do not prohibit it. */
export function previewLibraryDraft(state,input,options={}){
  objectKeys(input,['kind','draft','date','quantity','selectionReview','catalogSources','barcodeSources'],'Library draft preview');
  const kind=input.kind;
  if(!['food','recipe','meal'].includes(kind))fail('Choose a custom food, recipe or meal.');
  const day=date(input.date),quantity=input.quantity===undefined?{amount:1}:input.quantity;
  objectKeys(quantity,['amount','quantity','unit','portionId'],'Library preview quantity');
  let context=state;
  if(input.selectionReview!==undefined){
    objectKeys(input.selectionReview,['selection','fingerprint'],'Selection draft review');
    const {inline}=prepareSelectionDraftSave(state,{kind,...input.selectionReview,draft:input.draft});
    context={...state,foods:[...state.foods,...inline]};
  }
  context=resolveLibraryIngredientSources(context,input,options);
  return previewLibraryResource(context,kind,normalizeLibraryDraft(context,kind,input.draft),day,quantity);
}
// Keep the food editor's response shape while sharing all preview semantics.
export function previewFoodDraft(state,input){
  objectKeys(input,['draft','date','quantity'],'Food draft preview');
  const {version,resource,nutrition}=previewLibraryDraft(state,{kind:'food',...input});
  return {version,food:resource,nutrition};
}
/** Persist an already normalized value; consumer constraints apply only to the replaced identity. */
export function persistLibraryDraft(state,kind,next){
  const collection={food:'foods',recipe:'recipes',meal:'meals'}[kind];
  if(!collection)fail('Choose a custom food, recipe or meal.');
  const previous=next.id?lookup(state,collection,next.id):null;
  if(previous){
    if(previous.readOnly)fail('Catalog source foods are read-only. Create a custom copy to change values.');
    if(kind!=='meal')validateMeasuredConsumers(state,kind+'Id',previous.id,next);
    state[collection][state[collection].indexOf(previous)]={...next,id:previous.id};
    return previous.id;
  }
  const id=randomUUID();state[collection].push({...next,id});return id;
}

export function act(s,type,p={},context={}) {
  if(!p||typeof p!=='object'||Array.isArray(p)) fail('Payload must be an object.');
  switch(type) {
    case 'entry.add': appendLoggedDiaryRows(s,[{...entry(s,p),id:randomUUID()}]); break;
    case 'entry.update': updateEntry(s,p);break;
    case 'entry.quantity': setEntryQuantity(s,p);break;
    case 'entry.details': setEntryDetails(s,p);break;
    case 'entry.delete': removeDiaryRecords(s,'entries',[p.id]); break;
    case 'entry.carbohydrate-basis': {
      objectKeys(p,['id','carbohydrateBasis'],'Entry carbohydrate basis');const row=lookup(s,'entries',exactId(p.id,'Entry ID'));
      if(resourceReference(row)||isExerciseEntry(row))fail('Carbohydrate basis metadata applies only to inline nutrient entries.');
      assertDiaryDaysEditable(s,[row.date]);
      const basis=parseCarbohydrateBasis({...p,nutrients:row.nutrients});delete row.carbohydrateBasis;Object.assign(row,basis);break;
    }
    case 'records.clear-amounts': clearDiaryAmounts(s,p);break;
    case 'records.set-time': setRecordTimes(s,p);break;
    case 'records.move-group': moveRecordGroups(s,p);break;
    case 'records.copy': applyRecordCopy(s,p);break;
    case 'selection.save':return saveSelectionDraft(s,p,context);
    case 'entry.expand':return applyEntryExpansion(s,p);
    case 'day.complete': { date(p.date);if(typeof p.completed!=='boolean') fail('Completed must be true or false.');s.settings.completedDays=s.settings.completedDays.filter(x=>x!==p.date);if(p.completed)s.settings.completedDays.push(p.date);break; }
    case 'food.save': return {kind:'food',id:persistLibraryDraft(s,'food',normalizeLibraryDraft(s,'food',p))};
    case 'food.classify': {
      objectKeys(p,['id','classification'],'Food classification');const classification=parseFoodClassification(p),food=lookup(s,'foods',exactId(p.id,'Food ID'));
      delete food.classification;Object.assign(food,classification);break;
    }
    case 'food.carbohydrate-basis': {
      objectKeys(p,['id','carbohydrateBasis'],'Food carbohydrate basis');const food=lookup(s,'foods',exactId(p.id,'Food ID'));
      const basis=parseCarbohydrateBasis({...p,nutrients:food.nutrients});delete food.carbohydrateBasis;Object.assign(food,basis);break;
    }
    case 'recipe.save': return saveCompositeLibraryDraft(s,'recipe',p,context);
    case 'meal.save': return saveCompositeLibraryDraft(s,'meal',p,context);
    case 'favorite.set': {
      if(typeof p.enabled!=='boolean')fail('Favorite enabled must be true or false.');
      const ref=favoriteReference(s,{kind:p.kind,id:p.id}),favorites=favoriteReferences(s,s.settings.favorites??[]),matches=item=>item.kind===ref.kind&&item.id===ref.id;
      if(p.enabled){if(!favorites.some(matches))favorites.push(ref);s.settings.favorites=favorites;}else s.settings.favorites=favorites.filter(item=>!matches(item));break;
    }
    case 'library.retirement':applyLibraryRetirement(s,p);break;
    case 'food.delete':case 'recipe.delete':case 'meal.delete': {
      const kind=type.split('.')[0];checkLibraryDeletion(s,kind,p.id);removeLibraryItem(s,kind,p.id);break;
    }
    case 'biometric.add': addDiaryRecord(s,'biometrics',parseBiometricRecord(p));break;
    case 'biometric.delete':removeDiaryRecords(s,'biometrics',[p.id]);break;
    case 'water.add':addDiaryRecord(s,'biometrics',parseBiometricRecord({...p,type:'Water',value:number(p.amount,'Water',waterLimits.minimumMl,waterLimits.maximumMl),unit:'mL'},s.settings.groups));break;
    case 'exercise.add':addDiaryRecord(s,'entries',exerciseRecord(s,p));break;
    case 'exercise.catalog.add':addDiaryRecord(s,'entries',catalogExerciseRecord(s,p));break;
    case 'exercise.update': {if(Object.hasOwn(p,'exerciseBasis'))fail('The initial exercise calculation cannot be changed.');const old=lookup(s,'entries',p.id);if(old.kind!=='exercise')fail('This is not an exercise entry.');const next={id:old.id,...exerciseRecord(s,{...old,calories:old.caloriesBurned,...p})};assertDiaryDaysEditable(s,[old.date,next.date]);s.entries[s.entries.indexOf(old)]=next;break;}
    case 'note.add':{const record=parseNoteRecord(p,s.settings.groups);addDiaryRecord(s,'notes',record);break;}
    case 'note.delete':removeDiaryRecords(s,'notes',[p.id]);break;
    case 'repeat.save':saveRepeat(s,p);break;
    case 'repeat.setEnabled':{if(typeof p.enabled!=='boolean'||Object.keys(p).some(key=>!['id','enabled'].includes(key)))fail('Choose a schedule ID and an explicit enabled state.');lookup(s,'repeats',exactId(p.id,'Repeat ID',100)).enabled=p.enabled;break;}
    case 'repeat.delete':remove(s,'repeats',p.id);break;
    case 'repeat.apply':applyReviewedRepeats(s,p);break;
    case 'profile.save': { const result={...s.profile};for(const key of ['name','activity','goal','units'])if(p[key]!==undefined)result[key]=text(p[key],key,200);for(const key of ['age','height','weight'])if(p[key]!==undefined)result[key]=number(p[key],key,0.01,1000);s.profile=result;break; }
    case 'targets.setup': {
      if(p.confirmed!==true)fail('Review the target estimate before applying it.');
      const plan=prepareTargetSetup(p.input);
      const targets={...s.settings.targets,...plan.targets};
      act(s,'settings.save',{targets,targetSetup:{...plan,appliedAt:new Date().toISOString()},macroPolicy:null,...(s.settings.energyPolicy?{energyPolicy:{...s.settings.energyPolicy,target:{mode:'fixed',includeAboveBaseline:false}}}:{})});
      break;
    }
    case 'group.editSlot':editDiaryGroupSlot(s,p);break;
    case 'group.rename':renameDiaryGroup(s,p);break;
    case 'group.order':setDiaryGroupOrder(s,p);break;
    case 'nutrientTarget.setCustom':act(s,'settings.save',nutrientTargetCustomPatch(s,p));break;
    case 'nutrientTarget.patch':act(s,'settings.save',nutrientTargetSettingsPatch(s,p));break;
    case 'scoreDisplay.change':Object.assign(s.settings,scoreDisplayPatch(s.settings,p));break;
    case 'settings.save': {
      const next={...s.settings};if(Object.hasOwn(p,'mobileCharts'))next.mobileCharts=parseMobileChartSettings(p.mobileCharts,s);if(Object.hasOwn(p,'pauseLife')){const policy=parsePauseLife(p.pauseLife);if(policy===null)delete next.pauseLife;else next.pauseLife=policy;}if(Object.hasOwn(p,'diaryCalendar')){const policy=parseDiaryCalendar(p.diaryCalendar);if(policy===null)delete next.diaryCalendar;else next.diaryCalendar=policy;}if(Object.hasOwn(p,'addMenu'))next.addMenu=parseAddMenu(p.addMenu);if(Object.hasOwn(p,'appLanguage'))next.appLanguage=parseAppLanguage(p.appLanguage);if(Object.hasOwn(p,'discover'))next.discover=parseDiscoverSettings(p.discover);if(Object.hasOwn(p,'fontScale'))next.fontScale=parseFontScale(p.fontScale);if(Object.hasOwn(p,'energyUnit'))next.energyUnit=parseEnergyUnit(p.energyUnit);if(Object.hasOwn(p,'targets'))next.targets=validateTargets(p.targets);
      if(Object.hasOwn(p,'askToStopFast')){if(typeof p.askToStopFast!=='boolean')fail('Ask to stop fasting must be true or false.');next.askToStopFast=p.askToStopFast;}
      if(Object.hasOwn(p,'energyPolicy')){const policy=parseEnergyPolicy(p.energyPolicy);if(policy===null)delete next.energyPolicy;else next.energyPolicy=policy;}
      if(Object.hasOwn(p,'nutrientReferences')){const policy=parseNutrientReferencePolicy(p.nutrientReferences);if(policy===null)delete next.nutrientReferences;else next.nutrientReferences=policy;}
      if(Object.hasOwn(p,'nutrientUpperLimits')){const policy=parseNutrientUpperLimitPolicy(p.nutrientUpperLimits);if(policy===null)delete next.nutrientUpperLimits;else next.nutrientUpperLimits=policy;}
      if(Object.hasOwn(p,'nutrientDisplay')){const policy=parseNutrientDisplayPolicy(p.nutrientDisplay);if(policy===null)delete next.nutrientDisplay;else next.nutrientDisplay=policy;}
      if(Object.hasOwn(p,'nutrientBalances')){const policy=parseNutrientBalancePolicy(p.nutrientBalances);if(policy===null)delete next.nutrientBalances;else next.nutrientBalances=policy;}
      if(Object.hasOwn(p,'diaryTable')){const policy=parseDiaryTablePolicy(p.diaryTable);if(policy===null)delete next.diaryTable;else next.diaryTable=policy;}
      if(Object.hasOwn(p,'diaryDisplay')){const policy=parseDiaryDisplayPolicy(p.diaryDisplay);if(policy===null)delete next.diaryDisplay;else next.diaryDisplay=policy;}
      if(Object.hasOwn(p,'profileDemographics')){const value=parseProfileDemographics(p.profileDemographics);if(value===null)delete next.profileDemographics;else next.profileDemographics=value;}
      if(Object.hasOwn(p,'bodyComposition')){const policy=parseBodyCompositionPolicy(p.bodyComposition);if(policy===null)delete next.bodyComposition;else next.bodyComposition=policy;}
      if(Object.hasOwn(p,'macroPlan')){if(p.macroPlan===null)delete next.macroPlan;else next.macroPlan=parseMacroPlan(p.macroPlan);}
      if(Object.hasOwn(p,'macroPolicy')){const policy=parseMacroPolicy(p.macroPolicy);if(policy===null)delete next.macroPolicy;else next.macroPolicy=policy;}
      if(Object.hasOwn(p,'carbohydratePolicy'))next.carbohydratePolicy=parseCarbohydratePolicy(p.carbohydratePolicy);
      if(Object.hasOwn(p,'coachPreferences')){const value=parseCoachPreferences(p.coachPreferences);if(Object.values(value).some(Boolean))next.coachPreferences=value;else delete next.coachPreferences;}
      if(Object.hasOwn(p,'dashboard'))next.dashboard=parseDashboardSettings(p.dashboard);
      if(Object.hasOwn(p,'cycleChartOverlays')){const policy=parseCycleChartOverlays(p.cycleChartOverlays);if(policy===null)delete next.cycleChartOverlays;else next.cycleChartOverlays=policy;}
      if(Object.hasOwn(p,'cycleDisplay')){const policy=parseCycleDisplay(p.cycleDisplay);if(policy===null)delete next.cycleDisplay;else next.cycleDisplay=policy;}
      if(Object.hasOwn(p,'bloodPressure'))next.bloodPressure=parseBloodPressureMapping(p.bloodPressure);
      if(Object.hasOwn(p,'glucoseKetones'))next.glucoseKetones=parseGlucoseKetoneMapping(p.glucoseKetones);
      if(Object.hasOwn(p,'glucoseTimeline')){const policy=parseGlucoseTimelinePolicy(p.glucoseTimeline);if(policy===null)delete next.glucoseTimeline;else next.glucoseTimeline=policy;}
      reconcileInactiveEnergyTarget(s.settings,next,p);
      const modes=reconcileNutrientTargetModes(s.settings,next,p,{dailyIds:nutrientReferenceOptions.map(row=>row.id),maximumIds:nutrientUpperLimitOptions.map(row=>row.id)});if(Object.keys(modes.nutrients).length)next.nutrientTargetModes=modes;else delete next.nutrientTargetModes;
      if(p.targetSetup!==undefined)next.targetSetup=validateTargetSetupRecord(p.targetSetup,next.targets);
      else if(next.targetSetup&&setupTargetKeys.some(key=>next.targets[key]!==next.targetSetup.targets[key]))delete next.targetSetup;
      if(Object.hasOwn(p,'macroSchedule')){if(!p.macroSchedule||typeof p.macroSchedule!=='object'||Array.isArray(p.macroSchedule))fail('Macro schedule must be an object.');next.macroSchedule={};for(const [day,targets]of Object.entries(p.macroSchedule)){if(!/^[0-6]$/.test(day))fail('Invalid weekday.');next.macroSchedule[day]=validateTargets(targets);}}
      if(p.groups){const groups=array(p.groups,'Groups',30).map(x=>text(x,'Group',100));if(!groups.length||new Set(groups).size!==groups.length)fail('Use unique diary groups.');if(s.entries.some(x=>!groups.includes(x.group))||s.repeats.some(x=>!groups.includes(x.group))||[...s.biometrics,...s.notes].some(x=>typeof x.group==='string'&&!groups.includes(x.group)))fail('A group is still used by entries, repeats, biometrics or notes. Use Rename to keep its records.');next.groups=groups;}
      if(Object.hasOwn(p,'customBiometrics')){const definitions=parseCustomBiometrics(p.customBiometrics);if(parseCustomBiometrics(s.settings.customBiometrics??[]).some(row=>!definitions.some(next=>next.name===row.name&&next.unit===row.unit)))throw Object.assign(Error('Use the reviewed custom-biometric deletion flow to remove a definition and its history.'),{status:409});next.customBiometrics=definitions;}
      if(Object.hasOwn(p,'diaryGroups')){const policy=parseDiaryGroups(p.diaryGroups,next.groups);if(policy===null)delete next.diaryGroups;else next.diaryGroups=policy;}
      else if(next.diaryGroups&&Object.hasOwn(p,'groups'))next.diaryGroups=parseDiaryGroups({...next.diaryGroups,hiddenGroups:next.diaryGroups.hiddenGroups.filter(group=>next.groups.includes(group))},next.groups);
      if(Object.hasOwn(p,'waterSettings')){const policy=parseWaterSettings(p.waterSettings,next.groups);if(policy===null)delete next.waterSettings;else next.waterSettings=policy;}
      else if(next.waterSettings&&Object.hasOwn(p,'groups'))parseWaterSettings(next.waterSettings,next.groups);
      if(Object.hasOwn(p,'diaryQuickAdd')){const policy=parseDiaryQuickAdd(p.diaryQuickAdd,next.groups);if(policy===null)delete next.diaryQuickAdd;else next.diaryQuickAdd=policy;}
      else if(next.diaryQuickAdd&&Object.hasOwn(p,'groups'))next.diaryQuickAdd=parseDiaryQuickAdd({...next.diaryQuickAdd,shortcuts:next.diaryQuickAdd.shortcuts.filter(row=>next.groups.includes(row.group))},next.groups);
      if(Object.hasOwn(p,'diaryGroupOrder')){const policy=parseDiaryGroupOrder(p.diaryGroupOrder,next.groups);if(policy===null)delete next.diaryGroupOrder;else next.diaryGroupOrder=policy;}
      else if(next.diaryGroupOrder&&Object.hasOwn(p,'groups'))next.diaryGroupOrder=parseDiaryGroupOrder({...next.diaryGroupOrder,groups:next.diaryGroupOrder.groups.filter(row=>next.groups.includes(row.group))},next.groups);
      if(Object.hasOwn(p,'healthConnectGroup')){const group=parseHealthConnectGroup(p.healthConnectGroup,next.groups);if(group===null)delete next.healthConnectGroup;else next.healthConnectGroup=group;}
      else if(next.healthConnectGroup!==undefined)parseHealthConnectGroup(next.healthConnectGroup,next.groups);
      if(p.theme!==undefined){if(!['light','dark','system'].includes(p.theme))fail('Unknown theme.');next.theme=p.theme;}
      for(const key of ['showEnergy','showMacros','alwaysExpandMeals','showTimestamp','showWater','matchDeviceFontSize'])if(p[key]!==undefined){if(typeof p[key]!=='boolean')fail(`${key} must be boolean.`);next[key]=p[key];}
      if(Object.hasOwn(p,'diarySort')){if(!['source','time'].includes(p.diarySort))fail('Choose added order or time within each diary group.');next.diarySort=p.diarySort;}
      if(p.favorites!==undefined)next.favorites=favoriteReferences(s,p.favorites);
      if(Object.hasOwn(p,'scoreSelection'))next.scoreSelection=parseScoreSelection(p.scoreSelection);
      if(Object.hasOwn(p,'mealSuggestions'))next.mealSuggestions=parseMealSuggestionPolicy(p.mealSuggestions);
      if(Object.hasOwn(p,'showScores'))next.showScores=resolveScoreDisplay({showScores:p.showScores}).show;
      if(p.reminders)next.reminders=array(p.reminders,'Reminders',100).map(x=>({name:text(x.name,'Reminder',100),time:time(x.time)}));
      s.settings=next;break;
    }
    case 'fast.start':case 'fast.record':case 'fast.end':case 'fast.update':case 'fast.delete':applyFastAction(s,type,p,new Date());break;
    case 'chart.save':return {records:{charts:[applyChartPreference(s,{type,payload:p})]}};
    case 'cycle.overlay':{objectKeys(p,['chart','enabled'],'Cycle overlay');if(typeof p.chart!=='string')fail('Choose a supported chart.');s.settings.cycleChartOverlays=updateCycleChartOverlays(s.settings.cycleChartOverlays,{[p.chart]:p.enabled});break;}
    case 'chart.cycle-overlay':applyChartPreference(s,{type,payload:p});break;
    case 'chart.visibility':{objectKeys(p,['id','visible'],'Chart visibility');if(typeof p.visible!=='boolean')fail('Chart visibility must be true or false.');lookup(s,'charts',exactId(p.id)).visible=p.visible;break;}
    case 'chart.delete':remove(s,'charts',p.id);if(s.settings.mobileCharts?.custom)delete s.settings.mobileCharts.custom[p.id];break;
    case 'client.save':save(s,'clients',{id:p.id,name:text(p.name,'Client name',200),email:typeof p.email==='string'?p.email.slice(0,300):'',notes:typeof p.notes==='string'?p.notes.slice(0,100000):'',targets:p.targets?validateTargets(p.targets):{}});break;
    case 'client.delete':remove(s,'clients',p.id);s.messages=s.messages.filter(x=>x.clientId!==p.id);break;
    case 'message.add':lookup(s,'clients',p.clientId);s.messages.push({id:randomUUID(),clientId:p.clientId,text:text(p.text,'Message',100000),created:new Date().toISOString(),status:'Local draft; not sent'});break;
    case 'template.save':save(s,'templates',{id:p.id,name:text(p.name,'Template name',200),text:text(p.text,'Template text',100000)});break;
    case 'template.delete':remove(s,'templates',p.id);break;
    case 'share.import':importSharedItem(s,p);break;
    default:fail(`Unknown action: ${type}`);
  }
}

export function exportState(s) { orderRecipeDependencies(s);parseHealthSync(s.healthSync);parseCycleRecords(s.cycleRecords);parseCycleDisplay(s.settings?.cycleDisplay);parseCycleChartOverlays(s.settings?.cycleChartOverlays);for(const food of s.foods??[]){validateFoodMeasures(food);parseFoodOxalateSource(food);parseFoodNotes(food);parseFoodTranslations(food);validateMeasureTranslations(food);}for(const recipe of s.recipes??[]){validateMeasureTranslations(recipe);recipePortionFields(recipe,s);}return {...s,exportedAt:new Date().toISOString(),catalog:undefined,capabilities:undefined}; }
function sharedSourceReviews(value,{reject=false}={}){
  if(Array.isArray(value))return value.map(item=>sharedSourceReviews(item,{reject}));
  if(!value||typeof value!=='object')return value;
  const result={};for(const [key,item]of Object.entries(value)){if(key==='photoReview'||key==='textReview'){if(reject)fail('Shared nutrition items cannot contain source-photo or source-text review metadata. Use a full workspace backup to retain source evidence.');continue;}result[key]=sharedSourceReviews(item,{reject});}return result;
}
export function exportSharedItem(s,input){
  objectKeys(input,['kind','id'],'Shared item');if(!favoriteCollections.has(input.kind))fail('Choose a food, recipe or meal to export.');
  const collection=favoriteCollections.get(input.kind),item=lookup(s,collection,exactId(input.id));
  const graph=collectResourceDependencies(s,[{[input.kind==='food'?'foodId':input.kind==='recipe'?'recipeId':'mealId']:item.id}]);
  if(graph.missing.length)fail('A shared item dependency is missing. Repair it before exporting.');
  for(const food of graph.foods){validateFoodMeasures(food);parseFoodOxalateSource(food);parseFoodNotes(food);parseFoodTranslations(food);validateMeasureTranslations(food);}
  for(const recipe of graph.recipes){validateMeasureTranslations(recipe);recipePortionFields(recipe,graph);}
  return {...sharedSourceReviews({kind:input.kind,item:withoutLibraryStatus(input.kind==='food'?withoutFoodNotes(item):item),foods:graph.foods.map(withoutFoodNotes).map(withoutLibraryStatus).filter(row=>collection!=='foods'||row.id!==item.id),recipes:graph.recipes.map(withoutLibraryStatus).filter(row=>collection!=='recipes'||row.id!==item.id)}),notice:'Nutrition-only export: personal retirement status, food notes, source photo evidence and images are omitted, along with source text and review notes. Use a full workspace backup to retain them.'};
}
function importRecipeRows(candidate,rows,{shared=false}={}){
  const incoming=new Map();
  for(const row of rows){
    if(!row||typeof row!=='object'||Array.isArray(row))fail('Each imported recipe must be an object.');
    exactId(row.id,'Recipe ID',100);parseLibraryStatus(row);validateMeasureTranslations(row);parseFoodTaxonomy(row);
    if(!candidate.recipes.some(saved=>saved.id===row.id)&&!incoming.has(row.id))incoming.set(row.id,row);
  }
  const graph={...candidate,recipes:[...candidate.recipes,...incoming.values()]};
  const ordered=orderRecipeDependencies(graph);
  for(const row of rows)recipePortionFields(row,graph);
  for(const row of ordered){
    if(!incoming.has(row.id))continue;
    const item=shared?withoutLibraryStatus(row):{...row};delete item.id;
    act(candidate,'recipe.save',item);candidate.recipes.at(-1).id=row.id;
  }
}
function importSharedItem(s,p){
  sharedSourceReviews(p,{reject:true});
  if(!favoriteCollections.has(p.kind))fail('Unknown share type.');
  p=prepareSharedItemGraph(s,{...p,foods:array(p.foods??[],'Shared foods',maxRecordCollectionRows),recipes:array(p.recipes??[],'Shared recipes',1000)});
  const candidate=structuredClone(s);
  for(const food of p.foods){
    parseFoodNotes(food);parseFoodTranslations(food);validateMeasureTranslations(food);parseFoodClassification(food);parseFoodTaxonomy(food);parseLibraryStatus(food);parseCarbohydrateBasis(food);validateFoodMeasures(food);parseFoodOxalateSource(food);nutrients(food.nutrients||{});if(food.readOnly){addCatalogFood(candidate,food);continue;}
    const item=withoutLibraryStatus(food);delete item.id;act(candidate,'food.save',item);candidate.foods.at(-1).id=food.id;
  }
  importRecipeRows(candidate,p.recipes,{shared:true});
  if(p.kind==='food'||p.kind==='recipe'){validateMeasureTranslations(p.item);parseFoodTaxonomy(p.item);parseLibraryStatus(p.item);}if(p.kind==='recipe')recipePortionFields(p.item,candidate);
  if(p.kind==='food'){parseFoodTranslations(p.item);parseFoodNotes(p.item);parseFoodClassification(p.item);parseCarbohydrateBasis(p.item);validateFoodMeasures(p.item);parseFoodOxalateSource(p.item);}
  if(p.kind==='food'&&p.item.readOnly)addCatalogFood(candidate,p.item);
  else{const item=withoutLibraryStatus(p.item);delete item.id;act(candidate,`${p.kind}.save`,item);}
  Object.assign(s,candidate);
}
export function mergeImport(s,input) {
  if(!input||input.version!==1) fail('This is not a version 1 Nourish workspace export.');
  const originalInput=structuredClone(input);input=structuredClone(input);
  const bodyCompositionNormalization=canonicalizeBodyComposition(input);
  const carbohydrateNormalization=canonicalizeCarbohydrates(input);
  const candidate=structuredClone(s),originalCharts=new Map();
  if(Object.hasOwn(input,'cycleRecords'))candidate.cycleRecords=mergeCycleRecords(candidate.cycleRecords,input.cycleRecords);
  const sync=mergeHealthSync(candidate.healthSync,input.healthSync,candidate.biometrics);if(sync)candidate.healthSync=sync;
  if(Object.hasOwn(input,'fastingPlan')){
    const incoming={fastingPlan:parseFastingPlan(input.fastingPlan)};
    disableFastingSchedules(incoming);
    const current=parseFastingPlan(candidate.fastingPlan)||{version:1,schedules:[]};
    const existingIds=new Set(current.schedules.map(row=>row.id));
    candidate.fastingPlan=parseFastingPlan({...current,schedules:[...current.schedules,...incoming.fastingPlan.schedules.filter(row=>!existingIds.has(row.id))]});
  }
  if(Object.hasOwn(input,'loggingStreaks'))candidate.loggingStreaks=mergeLoggingStreaks(candidate.loggingStreaks,input.loggingStreaks);
  if(Object.hasOwn(input,'progressSnapshots'))candidate.progressSnapshots=mergeProgressSnapshots(candidate.progressSnapshots,input.progressSnapshots);
  // Validate through the same producer boundary as interactive writes, before committing any data.
  for(const collection of ['foods','recipes','meals','entries','biometrics','notes','repeats','fasts','charts','clients','messages','templates']) for(const row of array(input[collection]||[],collection,maxRecordCollectionRows)){if(!row||typeof row!=='object'||Array.isArray(row))fail(`Every ${collection} row must be an object.`);text(row.id,`${collection} ID`,100);if(['recipes','meals'].includes(collection)&&row.photoReview!==undefined)photoReviewMetadata(row.photoReview);if(['entries','recipes','meals'].includes(collection)&&row.textReview!==undefined)textReviewMetadata(row.textReview);if(collection==='entries'&&row.suggestedMeal!==undefined)suggestedMealRecord(row.suggestedMeal);}
  // Imported groups must exist before validating their dependent records.
  const mergedGroups=[...new Set([...candidate.settings.groups,...(input.settings?.groups||[])])];
  act(candidate,'settings.save',{groups:mergedGroups});
  for(const f of input.foods||[]) { validateMeasureTranslations(f);parseFoodTranslations(f);parseFoodNotes(f);parseFoodClassification(f);parseFoodTaxonomy(f);parseLibraryStatus(f);parseCarbohydrateBasis(f);validateFoodMeasures(f);parseFoodOxalateSource(f);nutrients(f.nutrients||{});text(f.id,'Food ID',100);if(f.readOnly){addCatalogFood(candidate,f);continue;}const existing=candidate.foods.find(x=>x.id===f.id);if(existing){continue;}const item={...f};delete item.id;act(candidate,'food.save',item);const created=candidate.foods.at(-1);created.id=f.id;if(f.sample===true){created.sample=true;created.source='Imported illustrative sample food';} }
  importRecipeRows(candidate,input.recipes??[]);
  for(const r of input.meals??[]){parseLibraryStatus(r);exactId(r.id,'Meal ID',100);if(candidate.meals.some(row=>row.id===r.id))continue;const item={...r};delete item.id;act(candidate,'meal.save',item);candidate.meals.at(-1).id=r.id;}
  for(const [collection,type]of [['entries','entry.add'],['biometrics','biometric.add'],['notes','note.add'],['charts','chart.save'],['clients','client.save'],['templates','template.save'],['repeats','repeat.save']])for(const row of input[collection]||[]){if(collection==='biometrics'){const parsed=parseBiometricRecord(row);if(healthImportBlock(candidate.healthSync,parsed))throw Object.assign(new Error('Imported biometric conflicts with explicit Health Connect reconciliation.'),{status:409});}if(collection==='entries'){portableEntryBasis(row);if(row.nutrients!==undefined)nutrients(row.nutrients);}const normalized=collection==='charts'?normalizeChart(row):null;if(candidate[collection].some(x=>x.id===row.id))continue;if(normalized?.changed)originalCharts.set(row.id,structuredClone(row));const p={...(normalized?.chart??row)};delete p.id;if(collection==='entries'&&row.kind!=='exercise')addDiaryRecord(candidate,'entries',entry(candidate,p));else act(candidate,row.kind==='exercise'&&collection==='entries'?'exercise.add':type,row.kind==='exercise'?{...p,calories:row.caloriesBurned}:p);const created=candidate[collection].at(-1);if(row.id) {created.id=row.id;}if(collection==='entries'&&row.repeatId)created.repeatId=exactId(row.repeatId,'Repeat ID',100); }
  for(const f of input.fasts||[]){const record=parseFastRecord(f);if(candidate.fasts.some(x=>x.id===record.id))continue;if(record.end===null&&candidate.fasts.some(x=>x.end===null))fail('Import contains another active fast.');candidate.fasts.push(record);}
  for(const row of input.messages||[]){if(candidate.messages.some(x=>x.id===row.id))continue;act(candidate,'message.add',{clientId:row.clientId,text:row.text});candidate.messages.at(-1).id=exactId(row.id,'Message ID',100);}
  if(input.profile)act(candidate,'profile.save',input.profile);
  if(input.settings){const settings={...input.settings,groups:mergedGroups};if(Object.hasOwn(settings,'customBiometrics')){const definitions=parseCustomBiometrics(candidate.settings.customBiometrics??[]),incoming=parseCustomBiometrics(settings.customBiometrics);settings.customBiometrics=[...definitions,...incoming.filter(row=>!definitions.some(saved=>saved.name===row.name&&saved.unit===row.unit))];}act(candidate,'settings.save',settings);}
  if(input.settings?.completedDays)candidate.settings.completedDays=[...new Set([...candidate.settings.completedDays,...array(input.settings.completedDays,'Completed days').map(date)])];
  const originalState=originalCharts.size?{...structuredClone(candidate),charts:candidate.charts.map(chart=>originalCharts.get(chart.id)??structuredClone(chart))}:null;
  // Partial imports are not complete recoverable workspaces. Keep their exact
  // parsed source as inert evidence inside a complete validated snapshot.
  const carbohydrateOriginalState=carbohydrateNormalization.changed?{...structuredClone(candidate),importedWorkspaceSource:originalInput}:null;
  if(carbohydrateOriginalState&&Buffer.byteLength(JSON.stringify(carbohydrateOriginalState))>20000000)fail('The normalized import and its recovery source exceed the 20 MB recovery record limit. Split the import before retrying.');
  const bodyCompositionOriginalState=bodyCompositionNormalization.changed?{...structuredClone(candidate),importedWorkspaceSource:originalInput}:null;
  if(bodyCompositionOriginalState&&Buffer.byteLength(JSON.stringify(bodyCompositionOriginalState))>20000000)fail('The normalized import and its recovery source exceed the 20 MB recovery record limit. Split the import before retrying.');
  Object.assign(s,candidate);return {bodyCompositionNormalization:{...bodyCompositionNormalization,originalState:bodyCompositionOriginalState},chartNormalization:{changed:originalCharts.size,originalState},carbohydrateNormalization:{...carbohydrateNormalization,originalState:carbohydrateOriginalState}};
}
