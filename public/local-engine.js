import {libraryItem,libraryCollectionView,projectProfileSettings,createDisplayView,fastingView,coachPreferencesView} from './local-diary-projection.js';
import {remapWriteReferences} from './write-identities.js';
// Local-first read & nutrition preview engine backed by the persisted IndexedDB offline snapshot.
// Computes libraryItem and previewDiaryItem in ~1ms without network round-trips whenever the
// referenced item is present in the local workspace snapshot; returns null to fall back to the server.

import {offlineCopy} from './offline-store.js';
import {offlineEffectiveState} from './offline-model.js';
import {readDeviceCache} from './device-cache.js';
import {accountDisplayKey} from './account-display.js';
import {calculateSelectionNutrition} from './report-source/server/nutrition.mjs';
import {convertEnergy} from './report-source/server/energy-units.mjs';
import {mergeEntryUpdate} from './report-source/server/entry-update-fields.mjs';

const LIBRARY_KINDS = ['food', 'recipe', 'meal'];
let cachedState = null;
let cachedIdentity = null;

export function invalidateLocalState() {
  cachedState = null;
}

if (typeof window !== 'undefined') {
  window.addEventListener('nourishing-data-changed', invalidateLocalState);
  window.addEventListener('nourishing-local-changed', invalidateLocalState);
}

// Keep record aliases and projected state from the same account revision.
export function workspaceViewFromCopy(copy) {
  if (!copy?.snapshot?.state || copy.locked) return null;
  const identity = JSON.stringify([copy.ownerId, copy.ticket.epoch, copy.revision]);
  if (!cachedState || cachedIdentity !== identity) {
    cachedState = offlineEffectiveState(copy);
    cachedIdentity = identity;
  }
  return {state:cachedState,recordIds:copy.recordIds??{},revision:copy.snapshot.revision};
}
export async function localWorkspaceView() {
  try { return workspaceViewFromCopy(await offlineCopy()); }
  catch { return null; }
}
export async function localWorkspaceState() {
  return (await localWorkspaceView())?.state??null;
}
const readLocalState = localWorkspaceState;

export async function localLibraryView(){
 const view=await localWorkspaceView();
 return view?libraryCollectionView(view.state,view.revision):null;
}
export async function localLibraryItem({kind,id,entry,catalogFood}){
 if(!LIBRARY_KINDS.includes(kind)||!id)return null;
 const catalog=catalogFood?await catalogFood:null;
 const view=await localWorkspaceView();if(!view)return null;
 const source=remapWriteReferences({id,entry:entry?structuredClone(entry):undefined},view.recordIds);
 let state=view.state,resource=state[kind+'s']?.find(row=>row.id===source.id);
 if(!resource&&catalog?.id===id&&kind==='food'&&!entry&&source.id===id){
   resource=catalog;state={...state,foods:[...state.foods,catalog]};
 }
 if(!resource)return null;
 const savedEntry=source.entry?.id?view.state.entries.find(row=>row.id===source.entry.id)??source.entry:source.entry;
 try{return {...libraryItem(state,kind,resource,savedEntry),...(state!==view.state?{copySelection:{kind:'catalog',id}}:{}),_local:true};}catch{return null;}
}

export async function localPreviewDiaryItem(input,reviewedFood) {
  if (!input || typeof input !== 'object') return null;
  const view = await localWorkspaceView();
  if (!view) return null;
  const payload = remapWriteReferences(structuredClone(input), view.recordIds);
  let state = view.state;
  if(reviewedFood&&input.foodId===reviewedFood.id&&!state.foods.some(row=>row.id===payload.foodId)){
    state={...state,foods:[...state.foods,{...reviewedFood,id:payload.foodId}]};
  }
  try {
    let next;
    if (payload.id) {
      const existing = (state.entries ?? []).find(row => row.id === payload.id);
      if (!existing) return null;
      next = mergeEntryUpdate(existing, payload);
    } else {
      const kind = payload.recipeId ? 'recipe' : payload.mealId ? 'meal' : payload.foodId ? 'food' : null;
      if (!kind) return null;
      const resourceId = payload[kind + 'Id'];
      if (!(state[kind + 's'] ?? []).some(row => row.id === resourceId)) return null;
      next = {...payload, id: 'local-preview'};
    }
    const completed = state.settings?.completedDays ?? [];
    if (completed.includes(next.date)) return null;
    const candidate = {...state, entries: [...(state.entries ?? []).filter(row => row.id !== next.id), next]};
    const nutrition = calculateSelectionNutrition(candidate, next.date, [next.id]);
    const unit = state.settings?.energyUnit ?? 'kcal';
    const calories = nutrition.totals?.calories ?? null;
    const energy = {value: calories === null ? null : convertEnergy(calories, 'kcal', unit), unit};
    return {version: 1, nutrition, energy};
  } catch {
    return null;
  }
}

export async function localDiaryView(targetDate, template, state) {
  if (!targetDate || !template) return null;
  state ??= await readLocalState();
  if (!state) return null;
  try {
    const {projectLocalDiary} = await import('./local-diary-projection.js');
    return {...projectLocalDiary(state,targetDate,template),_local:true};
  } catch { return null; }
}

export async function localAccountClock() {
  const now = new Date();
  let timeZone = 'UTC';
  try {
    const cached = await readDeviceCache(accountDisplayKey);
    timeZone = cached.value?.profile?.timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  }
  const today = new Intl.DateTimeFormat('en-CA', {timeZone, year: 'numeric', month: '2-digit', day: '2-digit'}).format(now);
  return {now, asOf: now.toISOString(), timeZone, today};
}

export async function localDashboardView(date) {
  const view = await localWorkspaceView();
  if (!view?.revision) return null;
  try {
    const [clock, {projectLocalDashboard}] = await Promise.all([localAccountClock(), import('./local-chart-projection.js')]);
    return {...projectLocalDashboard(view.state, {date}, clock, view.revision), _local: true};
  } catch { return null; }
}

export async function localChartsView(input) {
  const view = await localWorkspaceView();
  if (!view?.revision) return null;
  try {
    const [clock, {projectLocalChartSurface}] = await Promise.all([localAccountClock(), import('./local-chart-projection.js')]);
    return {...projectLocalChartSurface(view.state, input, clock, view.revision), _local: true};
  } catch { return null; }
}

export async function localNutritionReportView(options) {
  const view = await localWorkspaceView();
  if (!view?.revision) return null;
  try {
    const [clock, {projectLocalReport}] = await Promise.all([localAccountClock(), import('./local-chart-projection.js')]);
    return {...projectLocalReport(view.state, options, clock, view.revision), _local: true};
  } catch { return null; }
}

export async function localProfileSettingsView(date) {
  const view = await localWorkspaceView();
  if (!view?.revision) return null;
  try { return {...projectProfileSettings(view.state, date, view.revision), _local: true}; }
  catch { return null; }
}

export async function localDisplayView() {
  const view = await localWorkspaceView();
  if (!view?.revision) return null;
  try { return {revision: view.revision, ...createDisplayView(view.state), _local: true}; }
  catch { return null; }
}

export async function localFastingView(query = {limit: 25}) {
  const copy = await offlineCopy().catch(() => null);
  const view = workspaceViewFromCopy(copy);
  if (!view?.revision) return null;
  try {
    const clock = await localAccountClock();
    const context = {now: clock.now, timeZone: copy.fastingContext?.timeZone ?? clock.timeZone, schedulerReady: copy.fastingContext?.schedulerReady ?? false};
    return {...fastingView(view.state, context, query, view.revision), _local: true};
  } catch { return null; }
}

export async function localTargetPolicyView(date) {
  const view = await localWorkspaceView();
  if (!view?.revision) return null;
  try {
    const [clock, {projectLocalTargetPolicyView}] = await Promise.all([localAccountClock(), import('./local-chart-projection.js')]);
    return {...projectLocalTargetPolicyView(view.state, date, clock, view.revision), _local: true};
  } catch { return null; }
}

export async function localPreviewTargetPolicy(input) {
  const view = await localWorkspaceView();
  if (!view?.revision) return null;
  try {
    const [clock, {projectLocalTargetPolicyPreview}] = await Promise.all([localAccountClock(), import('./local-chart-projection.js')]);
    return projectLocalTargetPolicyPreview(view.state, input, clock, view.revision);
  } catch { return null; }
}

export async function localRepeatView(date) {
  const view = await localWorkspaceView();
  if (!view?.revision) return null;
  try {
    const {projectLocalRepeatView} = await import('./local-chart-projection.js');
    return {...projectLocalRepeatView(view.state, date, view.revision), _local: true};
  } catch { return null; }
}

const COACH_GOALS=['Health','Longevity','Weight Loss','Weight Gain','Strength','Build Muscle','Manage Condition','Athletic Performance','Improve Mood','Improve Sleep','Improve Energy','Research','Tracking','Accountability','Motivation','Education','GLP-1 Medication','Support'];
const COACH_DIETS=['None','Carnivore','Keto','Low Carb','Low Fat','Mediterranean','Paleo','Pescatarian','Vegan','Vegetarian','Dairy Free','Gluten Free','Fasting'];

export async function localCoachView() {
  const view = await localWorkspaceView();
  if (!view?.revision) return null;
  try {
    const coach = coachPreferencesView(view.state);
    return {revision: view.revision, setupComplete: view.state.settings.coachStarted === true || Boolean(view.state.settings.coachPreferences), preferencesRevision: coach.revision, preferences: coach.preferences, choices: {goals: COACH_GOALS, dietaryPreferences: COACH_DIETS}, energyUnit: view.state.settings.energyUnit ?? 'kcal', language: view.state.settings.appLanguage ?? 'en', _local: true};
  } catch { return null; }
}
