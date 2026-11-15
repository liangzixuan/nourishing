import {digest} from './data-codec.mjs';
import {act,readDiaryQuantity} from './domain/workspace.mjs';
import {offlineFoodVersionFacts} from './domain/offline-food-version.mjs';
import {readDiaryRecordCorrection,readDiaryRecordReviews,applyDiaryRecordCorrection} from './domain/diary-record-correction.mjs';
import {configuredBiometricPairs} from './domain/biometric-library.mjs';
import {applyBiometricLog} from './domain/biometric-logging.mjs';
import {compactFoodSource} from './domain/catalog-source.mjs';
import {recipeEntryFields} from './domain/recipe-entry.mjs';
import {parseCompositeSources} from './domain/composite-source.mjs';
import {canonicalFoodQuantityEntry} from './domain/food-quantity.mjs';

export const offlinePayloadFields=Object.freeze({
 'entry.add':['date','time','group','foodId','amount','quantity','unit','portionId'],
 'entry.quantity':['date','id','revision','quantity'],
 'entry.details':['date','id','revision','changes','confirmed'],
 'note.add':['date','time','group','text'],
 'water.add':['date','time','amount'],
 'exercise.add':['date','time','group','name','duration','calories','confirmed'],
 'exercise.correct':['collection','id','revision','changes','confirmed'],
 'note.correct':['collection','id','revision','changes','confirmed'],
 'biometric.correct':['collection','id','revision','changes','confirmed'],
 'biometric.log':['selection','unit','values','date','time','group','reviewToken','confirmed'],
});
const collections={'entry.add':'entries','entry.quantity':'entries','entry.details':'entries','exercise.add':'entries','exercise.correct':'entries','note.add':'notes','note.correct':'notes','water.add':'biometrics','biometric.correct':'biometrics','biometric.log':'biometrics'};
const fail=(message,status=400)=>{throw Object.assign(Error(message),{code:status,status,publicMessage:message});};
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const fields=(value,allowed)=>{if(!object(value)||Object.keys(value).some(key=>!allowed.includes(key)))fail('Unsupported offline fields.');};
function json(value){if(value===null||typeof value==='string'||typeof value==='boolean')return value;if(typeof value==='number'&&Number.isFinite(value))return value;if(Array.isArray(value))return value.map(json);if(object(value)&&[Object.prototype,null].includes(Object.getPrototypeOf(value)))return Object.fromEntries(Object.keys(value).sort().map(key=>[key,json(value[key])]));fail('Offline commands require finite JSON values.');}
export function parseOfflineCommand(input){
 fields(input,['ownerId','generation','operationId','type','payload','foodVersion']);
 for(const key of ['ownerId','generation'])if(typeof input[key]!=='string'||!input[key]||input[key].length>128)fail('Choose a saved account and workspace.');
 if(typeof input.operationId!=='string'||!uuid.test(input.operationId)||!Object.hasOwn(offlinePayloadFields,input.type))fail('Unsupported offline operation.');
 fields(input.payload,offlinePayloadFields[input.type]);
 if(input.type==='entry.add'){if(typeof input.payload.foodId!=='string'||!input.payload.foodId||input.payload.foodId.length>500||typeof input.foodVersion!=='string'||!/^[a-f0-9]{64}$/.test(input.foodVersion))fail('Choose a saved food version.');}
 else if(Object.hasOwn(input,'foodVersion'))fail('Only food additions use a food version.');
 if(input.type.endsWith('.correct')&&input.payload.collection!==collections[input.type])fail('The correction collection does not match.');
 if(input.type==='exercise.add'&&(input.payload.confirmed!==true||offlinePayloadFields[input.type].some(key=>!Object.hasOwn(input.payload,key))))fail('Confirm all exercise fields.');
 return json(input);
}
export function assertOfflineIdentity(command,{ownerId,generation}){if(command.ownerId!==ownerId||command.generation!==generation)fail('This offline copy belongs to another account or an earlier restore.',409);}
const pick=(value,keys)=>Object.fromEntries(keys.filter(key=>Object.hasOwn(value??{},key)).map(key=>[key,structuredClone(value[key])]));
function offlineState(state){
 const copy=Object.fromEntries(['foods','recipes','meals','entries','biometrics','notes','settings'].map(key=>[key,structuredClone(state[key])]));
 copy.foods=state.foods.map(food=>({...pick(food,['id','name','serving','grams','milliliters','nutrients','carbohydrateBasis','portions','translations','categoryId','tags','retired','readOnly']),...(food.source!==undefined?{source:compactFoodSource(food.source)}:{})}));
 copy.recipes=state.recipes.map(recipe=>pick(recipe,['id','name','servings','cookedWeightGrams','batchVolumeMl','ingredients','portions','retired']));
 copy.meals=state.meals.map(meal=>pick(meal,['id','name','items','retired']));
 copy.entries=state.entries.map(row=>canonicalFoodQuantityEntry({...pick(row,['id','date','time','group','name','kind','foodId','recipeId','mealId','amount','quantity','unit','portionId','portionLabel','grams','nutrients','carbohydrateBasis','source','duration','caloriesBurned','exerciseCalories','calories']),...recipeEntryFields(row),...(row.mealItems!==undefined?{mealItems:parseCompositeSources(row.mealItems)}:{})}));
 copy.notes=state.notes.map(row=>pick(row,['id','date','time','group','text']));
 copy.biometrics=state.biometrics.map(row=>pick(row,['id','date','time','group','type','unit','value','source','copiedFrom']));
 copy.settings=pick(state.settings,['groups','customBiometrics','theme','energyUnit','targets','macroSchedule','diaryGroups','diarySort','diaryGroupOrder','diaryDisplay','diaryTable','carbohydratePolicy','energyPolicy','macroPolicy','macroPlan','bodyComposition','nutrientReferences','nutrientUpperLimits','nutrientDisplay','nutrientBalances','scoreSelection','showScores','completedDays']);
 return copy;
}
export function offlineSnapshot(state,{ownerId,generation,now=new Date()}){
 const quantityReviews={};for(const row of state.entries){if(row.kind==='exercise')continue;try{const {revision,kind}=readDiaryQuantity(state,{date:row.date,id:row.id});quantityReviews[row.id]={revision,kind};}catch(error){if(![400,409].includes(error.status))throw error;quantityReviews[row.id]={error:error.message};}}
 return {version:1,identity:{ownerId,generation},savedAt:now.toISOString(),state:offlineState(state),quantityReviews,noteReviews:readDiaryRecordReviews(state,'notes'),biometricReviews:readDiaryRecordReviews(state,'biometrics'),exerciseReviews:readDiaryRecordReviews(state,'entries'),foodVersions:Object.fromEntries(state.foods.map(food=>[food.id,digest(offlineFoodVersionFacts(food))])),biometricConfiguredPairs:configuredBiometricPairs(state)};
}
const recordReview=(state,collection,id)=>{const {revision,editable,reason}=readDiaryRecordCorrection(state,{collection,id});return {revision,editable,reason};};
/** The cloud store owns account authentication, receipt replay and atomic persistence. */
export function applyOfflineCommand(state,raw,identity){
 const command=parseOfflineCommand(raw);assertOfflineIdentity(command,identity);const candidate=structuredClone(state),collection=collections[command.type],foodEditing=['entry.quantity','entry.details'].includes(command.type),recordEditing=command.type.endsWith('.correct'),editing=foodEditing||recordEditing;
 if(!editing&&candidate[collection].some(row=>row.id===command.operationId))fail('This operation already exists without a matching receipt.',409);
 if(command.type==='entry.add'){const food=candidate.foods.find(row=>row.id===command.payload.foodId);if(!food||digest(offlineFoodVersionFacts(food))!==command.foodVersion)fail('This saved food changed. Review the pending entry.',409);}
 let result;
 if(command.type==='biometric.log'){const batch=applyBiometricLog(candidate,{operationId:command.operationId,...command.payload},{allowReplay:false});result={...batch,biometricReviews:Object.fromEntries(batch.records.map(row=>[row.id,recordReview(candidate,'biometrics',row.id)]))};}
 else{
  const before=candidate[collection].length;if(recordEditing)applyDiaryRecordCorrection(candidate,command.payload);else act(candidate,command.type,command.payload);
  const value=editing?candidate[collection].find(row=>row.id===command.payload.id):candidate[collection][before];if(!editing)value.id=command.operationId;
  result={operationId:command.operationId,record:{collection,value:structuredClone(value)},replayed:false,...(foodEditing?{quantityReview:{revision:readDiaryQuantity(candidate,{date:value.date,id:value.id}).revision}}:{}),...(command.type==='exercise.correct'||command.type==='exercise.add'?{exerciseReview:recordReview(candidate,'entries',value.id)}:{}),...(['notes','biometrics'].includes(collection)?{[collection==='notes'?'noteReview':'biometricReview']:recordReview(candidate,collection,value.id)}:{})};
 }
 Object.assign(state,candidate);return result;
}
