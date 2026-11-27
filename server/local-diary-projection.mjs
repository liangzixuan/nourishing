export {diaryGroups,defaultDiaryGroup} from './domain/diary-groups.mjs';
import {diaryGroups} from './domain/diary-groups.mjs';
import {calculateSummary,entryFacts} from './domain/nutrition.mjs';
import {diarySummaryPresentation} from './diary-summary.mjs';
import {diaryToolsPresentation} from './diary-presentation.mjs';
import {mergeEntryUpdate} from './domain/entry-update-fields.mjs';
import {setDiaryGroupOrder,sortAllDiaryEntriesByTime} from './domain/diary-order.mjs';
import {nutrientTargetSettingsPatch,nutrientTargetCustomPatch,resetNutrientTargetSettings} from './domain/nutrient-target-edit.mjs';
export {diaryQuickAddAction,defaultDiaryQuickAddAction} from './domain/diary-quick-add.mjs';
export {resolvePauseLife} from './domain/pause-life.mjs';
export {createReportNutrientDetail} from './domain/report-nutrient-detail.mjs';
export {createNutrientTargetsView} from './domain/nutrient-target-view.mjs';
export {usesNutrientTargets,projectNutrientTargetResponse} from './domain/nutrient-target-responses.mjs';
export {copiedDiaryRecords} from './domain/diary-record-copy.mjs';
export {libraryItems,favoriteItems,updateFavoriteList} from './domain/library-list.mjs';

/** Replay already-prepared bulk commands over the retained account baseline.
 * Server validation remains authoritative; projection must also work after an
 * acknowledgement, when the server returns no changed-record payload. */
export function projectDiaryBulkWrite(state,{type,payload:p}){
 if(type==='nutrientTarget.reset'){resetNutrientTargetSettings(state.settings);return;}
 if(type==='nutrientTarget.patch'||type==='nutrientTarget.setCustom'){Object.assign(state.settings,(type==='nutrientTarget.patch'?nutrientTargetSettingsPatch:nutrientTargetCustomPatch)(state,p));return;}
 if(type==='diary.sort-all'){sortAllDiaryEntriesByTime(state);return;}
 if(type==='diary.order'){state.settings.diarySort=p.mode;return;}
 if(type==='group.order'){setDiaryGroupOrder(state,p);return;}
 if(type==='records.move-group'||type==='records.set-time'){
  const field=type==='records.move-group'?'group':'time';
  for(const ref of p.records){const row=state[ref.collection]?.find(row=>row.id===ref.id&&row.date===p.date);if(row)row[field]=p[field];}
  return;
 }
 if(type!=='records.delete'&&type!=='records.clear-amounts')return;
 const selected=p.selection;
 const includes=(collection,row)=>row.date===selected.date&&(selected.scope==='day'||selected.scope==='group'&&row.group===selected.group||selected.scope==='selected'&&selected.records.some(ref=>ref.collection===collection&&ref.id===row.id));
 if(type==='records.delete'){
  for(const collection of ['entries','notes','biometrics'])state[collection]=(state[collection]??[]).filter(row=>!includes(collection,row));
 }else state.entries=(state.entries??[]).map(row=>includes('entries',row)&&row.kind!=='exercise'?mergeEntryUpdate(row,{id:row.id,...(row.quantity!==undefined?{quantity:0}:{amount:0})}):row);
}

/** Shared diary projection; transport owns revision and captured cycle metadata. */
export function projectLocalDiary(state,date,template={},clock={now:new Date()}){
 const summary=calculateSummary(state,date);
 return diaryToolsPresentation(state,{
  ...template,date,cycleDays:template.date===date?template.cycleDays:[],
  theme:state.settings.theme??'dark',groups:diaryGroups(state.settings.groups),
  completed:state.settings.completedDays?.includes(date)??false,
  entries:state.entries.filter(row=>row.date===date).map(row=>({...row,facts:entryFacts(state,row)})),
  biometrics:state.biometrics.filter(row=>row.date===date),notes:state.notes.filter(row=>row.date===date),
  summary,presentation:diarySummaryPresentation(state,summary,clock),
 });
}

export {projectProfileSettings} from './profile-settings-view.mjs';
export {applyProfileSettingsProjection} from './domain/profile-settings-command.mjs';
export {projectDiaryCalendar} from './domain/diary-calendar.mjs';

export {prepareDiaryReview,diaryReviewGuard,assertDiaryReviewGuard} from './domain/diary-preparation.mjs';
export {resolveWaterSettings,parseWaterSettings,waterToMilliliters,waterFromMilliliters,waterUnits} from './domain/water-settings.mjs';
export {isLoggedWater,loggedWaterMilliliters} from './domain/water-measurement.mjs';

export {prepareDiaryDisplayCommand} from './diary-display-settings.mjs';
export {changeScoreDisplay} from './domain/score-display-controls.mjs';
export {createDisplayView} from './domain/display-view.mjs';

export {diarySelectionNutrition} from './domain/diary-selection-nutrition.mjs';

export {previewFoodLabel} from './food-editor.mjs';
export {libraryIngredientRows} from './domain/library-item-view.mjs';
export {previewLibraryEditor} from './domain/library-editor-preview.mjs';
export {prepareLibraryDraft,libraryDraftRows} from './domain/library-editor-draft.mjs';
export {inspectLibraryUses,checkLibraryDeletion,removeLibraryItem} from './domain/library-references.mjs';
export {libraryItem,recipePreview,libraryCollectionView} from './domain/library-item-view.mjs';

export {prepareDiaryRecordUpdate,manuallyEditableRecord,sourceRecordReason} from './domain/diary-record-update.mjs';
export {walkingEfforts,walkingPresets} from './domain/general-walking.mjs';
export {catalogExerciseRecord,resolveExerciseWeight,savedExerciseSettings,priorWalkingEfforts} from './domain/catalog-exercise.mjs';

export {storeChartDefinition} from './domain/chart-definition-store.mjs';

export {applyFastingChange,applyFastingCommand,fastingView} from './fasting.mjs';
export {fastingRecordLabel} from './domain/fasting-view.mjs';

export {prepareFoodMultiReview} from './domain/food-multi-review.mjs';

export {checkLocalReviewSave} from './domain/signed-review-time.mjs';
export {applyTargetPolicyToState,applyMealSuggestionPreferenceLocal} from './local-target-policy.mjs';
export {changeCoachPreferences,coachPreferencesView} from './domain/coach-preferences.mjs';
