import {libraryItem,libraryCollectionView} from './local-diary-projection.js';
import {remapWriteReferences} from './write-identities.js';
// Local-first read & nutrition preview engine backed by the persisted IndexedDB offline snapshot.
// Computes libraryItem and previewDiaryItem in ~1ms without network round-trips whenever the
// referenced item is present in the local workspace snapshot; returns null to fall back to the server.

import {offlineCopy} from './offline-store.js';
import {offlineEffectiveState} from './offline-model.js';
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
