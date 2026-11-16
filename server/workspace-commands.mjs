import {diaryDisplayCommandFields,prepareDiaryDisplayCommand} from './diary-display-settings.mjs';
import {healthCommandFields,applyHealthCommand} from './health-controls.mjs';
import {chartDisplayCommandFields,applyChartDisplayCommand} from './dashboard-pinned-charts.mjs';
import {librarySharingCommandFields,validateSharedImport,applySharedImport} from './library-sharing.mjs';
import {coachCommandFields,applyCoachCommand} from './coach-view.mjs';
import {textLogCommandFields,validateTextLog,applyTextLog} from './text-log.mjs';
import {libraryExtrasCommandFields,prepareLibraryExtrasCommand,libraryExtrasCatalogReferences} from './library-extras.mjs';
import {notePhotoCommandFields,validateNotePhotoAction,applyNotePhotoCommand} from './note-photos.mjs';
import {diaryToolCommandFields,applyDiaryToolsCommand} from './diary-tools.mjs';
import {barcodeCommandFields,validateBarcodeAction,applyBarcodeLog} from './barcode.mjs';
import {dashboardCommandFields,applyDashboardCommand} from './dashboard-view.mjs';
import {entryAdjustmentFields,validateEntryAdjustmentAction,prepareEntryAdjustmentCommand} from './entry-adjustments.mjs';
import {libraryToolCommandFields,prepareLibraryToolCommand} from './library-tools.mjs';
import {profileSettingsCommandFields,prepareProfileSettingsCommand} from './profile-settings.mjs';
import {snapshotCommandFields,validateSnapshotAction,applySnapshotCommand} from './snapshots.mjs';
import {fastingCommandFields,applyFastingCommand} from './fasting.mjs';
import {foodInsightCommandFields,prepareFoodInsightCommand} from './food-insights.mjs';
import {validateMealLog,applyMealLog} from './meal-commands.mjs';
import {photoCommandFields,validatePhotoAction,applyPhotoLog} from './photo-commands.mjs';
import {act,captureCatalogFood,previewLibraryDraft} from './domain/workspace.mjs';
import {parseCompositeSources} from './domain/composite-source.mjs';
import {repeatCommandFields,validateRepeatAction} from './repeat-commands.mjs';
import {recordCommandFields,applyRecordCommand} from './record-commands.mjs';
import {targetPolicyCommandFields,prepareTargetPolicyCommand} from './target-policy-commands.mjs';
import {invalid} from './request-errors.mjs';
const fields={
 ...diaryDisplayCommandFields,...healthCommandFields,...chartDisplayCommandFields,...librarySharingCommandFields,...coachCommandFields,...textLogCommandFields,...libraryExtrasCommandFields,...notePhotoCommandFields,...diaryToolCommandFields,...barcodeCommandFields,...dashboardCommandFields,...entryAdjustmentFields,...libraryToolCommandFields,...profileSettingsCommandFields,...snapshotCommandFields,...repeatCommandFields,...recordCommandFields,...targetPolicyCommandFields,...photoCommandFields,...foodInsightCommandFields,...fastingCommandFields,
 'meal.log':['date','time','group','rows'],
 'chart.save':['version','id','name','primary','secondary','days','visible','cycleOverlay'],
 'chart.delete':['id'],
 'chart.visibility':['id','visible'],
 'nutrientTarget.patch':['date','id','changes'],
 'nutrientTarget.setCustom':['date','id','custom'],
 'preferences.patch':['theme'],
 'entry.add':['foodId','recipeId','mealId','date','time','group','amount','quantity','unit','portionId'],
 'entry.update':['id','date','time','group','amount','quantity','unit','portionId'],
 'entry.delete':['id'],
 'day.complete':['date','completed'],
 'note.add':['date','time','group','text'],
 'note.delete':['id'],
 'food.save':['id','name','serving','grams','milliliters','barcode','nutrients','notes'],
 'recipe.save':['id','name','servings','ingredients','instructions','source','importReview','cookedWeightGrams','batchVolumeMl'],
 'meal.save':['id','name','items'],
 'food.delete':['id'],'recipe.delete':['id'],'meal.delete':['id']
};
export function validateAction(input){
 if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(k=>!['type','payload'].includes(k)))invalid('Invalid diary action.');
 const allowed=Object.hasOwn(fields,input.type)?fields[input.type]:null,p=input.payload;
 if(!allowed||!p||typeof p!=='object'||Array.isArray(p)||Object.keys(p).some(k=>!allowed.includes(k)))invalid('Invalid diary fields.');
 if(Object.hasOwn(entryAdjustmentFields,input.type))validateEntryAdjustmentAction(input);
 if(Object.hasOwn(snapshotCommandFields,input.type))validateSnapshotAction(input);
 if(input.type==='note.photo.save')validateNotePhotoAction(input);
 if(input.type==='barcode.log')validateBarcodeAction(input);
 if(input.type==='photo.log')validatePhotoAction(input);
 if(input.type==='meal.log')validateMealLog(p);
 if(input.type==='text.log')validateTextLog(p);
 if(input.type==='share.import')validateSharedImport(p);
 if(Object.hasOwn(repeatCommandFields,input.type))validateRepeatAction(input);
 if(input.type==='preferences.patch'&&(!Object.keys(p).length||!['light','dark','system'].includes(p.theme)))invalid('Choose a theme.');
 if(input.type!=='note.photo.save'&&p.id!==undefined&&(typeof p.id!=='string'||!p.id||p.id.length>1000))invalid('Choose a record.');
 if(input.type.endsWith('.delete')&&allowed.includes('id')&&!p.id)invalid('Choose a record.');
 if(['recipe.save','meal.save'].includes(input.type)){
  const items=p[input.type==='recipe.save'?'ingredients':'items'];
  if(items!==undefined)try{parseCompositeSources(items);}catch(error){throw Object.assign(error,{code:400,publicMessage:error.message});}
 }
 if(input.type==='entry.add'&&['foodId','recipeId','mealId'].filter(k=>typeof p[k]==='string'&&p[k].length>0).length!==1)invalid('Choose a food.');
 if(['entry.update','entry.delete','note.delete'].includes(input.type)&&(typeof p.id!=='string'||!p.id||p.id.length>1000))invalid('Choose a record.');
 return input;
}
export function parseCommand(input){
 if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(k=>!['requestId','revision','type','payload'].includes(k)))invalid('Invalid diary action.');
 if(typeof input.requestId!=='string'||typeof input.revision!=='string'||!/^[a-zA-Z0-9-]{16,64}$/.test(input.requestId)||!/^[a-f0-9]{64}$/.test(input.revision))invalid('Refresh the diary and try again.');
 validateAction({type:input.type,payload:input.payload});return input;
}
export function applyWorkspaceCommand(state,input,context={}){
 validateAction(input);
 try{if(Object.hasOwn(diaryDisplayCommandFields,input.type)){const prepared=prepareDiaryDisplayCommand(state,input);return act(state,prepared.type,prepared.payload);}const health=applyHealthCommand(state,input);if(health.handled)return health.result;const chartDisplay=applyChartDisplayCommand(state,input);if(chartDisplay.handled)return chartDisplay.result;if(input.type==='share.import')return applySharedImport(state,input.payload);const coach=applyCoachCommand(state,input);if(coach.handled)return coach.result;if(Object.hasOwn(libraryExtrasCommandFields,input.type)){const prepared=prepareLibraryExtrasCommand(state,input);return act(state,prepared.type,prepared.payload);}const notePhoto=applyNotePhotoCommand(state,input,context);if(notePhoto.handled)return notePhoto.result;const diaryTools=applyDiaryToolsCommand(state,input);if(diaryTools.handled)return diaryTools.result;if(input.type==='barcode.log')return applyBarcodeLog(state,input.payload,context);const dashboard=applyDashboardCommand(state,input,context);if(dashboard.handled)return dashboard.result;if(Object.hasOwn(entryAdjustmentFields,input.type)){const prepared=prepareEntryAdjustmentCommand(state,input);return act(state,prepared.type,prepared.payload);}if(Object.hasOwn(libraryToolCommandFields,input.type)){const prepared=prepareLibraryToolCommand(state,input);return act(state,prepared.type,prepared.payload);}if(Object.hasOwn(profileSettingsCommandFields,input.type)){const prepared=prepareProfileSettingsCommand(state,input);return act(state,prepared.type,prepared.payload);}const snapshot=applySnapshotCommand(state,input,context);if(snapshot.handled)return snapshot.result;const fasting=applyFastingCommand(state,input,context);if(fasting.handled)return fasting.result;if(Object.hasOwn(foodInsightCommandFields,input.type)){const prepared=prepareFoodInsightCommand(state,input);return act(state,prepared.type,prepared.payload);}if(input.type==='text.log')return applyTextLog(state,input.payload);if(input.type==='meal.log')return applyMealLog(state,input.payload);if(input.type==='photo.log')return applyPhotoLog(state,input.payload,context);if(Object.hasOwn(targetPolicyCommandFields,input.type)){const prepared=prepareTargetPolicyCommand(state,input,context);return act(state,prepared.type,prepared.payload);}const record=applyRecordCommand(state,input);if(record.handled)return record.result;return act(state,input.type==='preferences.patch'?'settings.save':input.type,libraryPayload(state,input));}catch(error){if([400,404,409].includes(error.status))throw Object.assign(error,{code:error.status,publicMessage:error.message});throw error;}
}
function libraryPayload(state,{type,payload}){
 if(!['food.save','recipe.save','meal.save'].includes(type)||!payload.id)return payload;
 const item=state[type.split('.')[0]+'s'].find(row=>row.id===payload.id);
 if(!item)invalid('This library item no longer exists.');
 return {...item,...payload};
}
function actionFoodRows({type,payload}){
 return ['entry.add','repeat.save'].includes(type)?[payload]:['photo.log','meal.log','text.log'].includes(type)?(payload.rows??[]):type==='recipe.save'?(payload.ingredients??[]):['meal.save','entry.ingredients.adjust'].includes(type)?(payload.items??[]):[];
}
export function catalogReferences(action){return [...new Set([...actionFoodRows(action).map(row=>row.foodId).filter(id=>typeof id==='string'),...libraryExtrasCatalogReferences(action)])];}
export async function readActionFoods(input,readCatalog){
 const ids=catalogReferences(input),foods=new Map();
 for(let i=0;i<ids.length;i+=4){for(const [id,food] of await Promise.all(ids.slice(i,i+4).map(async id=>[id,await readCatalog(id)])))foods.set(id,food);}
 return foods;
}
export function captureActionFoods(state,input,foods){
 const action=structuredClone(input),replacements=new Map();
 for(const id of catalogReferences(action)){const food=foods.get(id);if(food)replacements.set(id,captureCatalogFood(state,food).id);}
 for(const row of actionFoodRows(action))if(replacements.has(row.foodId))row.foodId=replacements.get(row.foodId);
 if(action.type==='favorite.set'&&action.payload.kind==='food'&&replacements.has(action.payload.id))action.payload.id=replacements.get(action.payload.id);
 return action;
}
export function validateLibraryPreview(input){
 if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(key=>!['kind','draft','date'].includes(key))||!['food','recipe','meal'].includes(input.kind))invalid('Choose a library item.');
 return validateAction({type:input.kind+'.save',payload:input.draft});
}
export function previewLibrary(state,input){
 const action=validateLibraryPreview(input);
 try{return previewLibraryDraft(state,{...input,draft:libraryPayload(state,action)});}catch(error){if([400,404,409].includes(error.status))throw Object.assign(error,{code:error.status,publicMessage:error.message});throw error;}
}
