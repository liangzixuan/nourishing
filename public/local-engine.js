// Local-first read & nutrition preview engine backed by the persisted IndexedDB offline snapshot.
// Computes libraryItem and previewDiaryItem in ~1ms without network round-trips whenever the
// referenced item is present in the local workspace snapshot; returns null to fall back to the server.

import {offlineCopy} from './offline-store.js';
import {offlineEffectiveState} from './offline-model.js';
import {catalog} from './report-source/server/nutrient-catalog.mjs';
import {calculateSelectionNutrition, entryFacts} from './report-source/server/nutrition.mjs';
import {availableQuantityUnits} from './report-source/server/quantity-units.mjs';
import {recipeWeight} from './report-source/server/recipe-weight.mjs';
import {recipeForEntry} from './report-source/server/recipe-entry.mjs';
import {mealForEntry} from './report-source/server/meal-entry.mjs';
import {convertEnergy} from './report-source/server/energy-units.mjs';

const LIBRARY_KINDS = ['food', 'recipe', 'meal'];
let cachedState = null;
let cachedAt = 0;
let inFlight = null;

export function invalidateLocalState() {
  cachedState = null;
  cachedAt = 0;
}

if (typeof window !== 'undefined') {
  window.addEventListener('nourishing-data-changed', invalidateLocalState);
}

async function readLocalState() {
  if (cachedState && Date.now() - cachedAt < 15000) return cachedState;
  if (inFlight) return inFlight;
  inFlight = (async () => {
    try {
      const copy = await offlineCopy();
      if (!copy?.snapshot?.state) return null;
      cachedState = offlineEffectiveState(copy);
      cachedAt = Date.now();
      return cachedState;
    } catch {
      return null;
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
}

function quantityOptions(state, kind, item) {
  const grams = kind === 'recipe' ? recipeWeight(item, state).grams : kind === 'food' ? item.grams : null;
  const volume = kind === 'recipe' ? item.batchVolumeMl : kind === 'food' ? item.milliliters : null;
  return [
    ['servings', kind === 'meal' ? 'meal' : item.serving ?? 'serving'],
    ...availableQuantityUnits({grams, milliliters: volume}).map(unit => [unit.id, unit.label]),
    ...(kind === 'recipe' ? [['batch', 'Full recipe']] : []),
    ...(item.portions ?? []).map(p => ['portion:' + p.id, p.label]),
  ];
}

export async function localLibraryItem({kind, id, entry}) {
  if (!LIBRARY_KINDS.includes(kind) || !id) return null;
  const state = await readLocalState();
  if (!state) return null;
  const resource = (state[kind + 's'] ?? []).find(row => row.id === id);
  if (!resource) return null;
  const savedEntry = entry?.id ? (state.entries ?? []).find(row => row.id === entry.id) ?? entry : entry;
  if (savedEntry && savedEntry[kind + 'Id'] !== resource.id) return null;
  try {
    const item =
      savedEntry && kind === 'recipe'
        ? recipeForEntry(resource, savedEntry)
        : savedEntry && kind === 'meal'
          ? mealForEntry(resource, savedEntry)
          : resource;
    const options = quantityOptions(state, kind, item);
    const ingredients = (item.ingredients ?? item.items ?? []).map(row => {
      const childKind = row.recipeId ? 'recipe' : 'food';
      const child = (state[childKind + 's'] ?? []).find(r => r.id === row[childKind + 'Id']);
      return {
        ...row,
        name: child?.name ?? 'Missing ingredient',
        source: child?.source ?? null,
        options: child ? quantityOptions(state, childKind, child) : null,
      };
    });
    return {
      kind,
      resource,
      options,
      ingredients,
      nutrients: catalog.map(({id: nutrientId, name, unit, category}) => ({id: nutrientId, name, unit, category})),
      energyUnit: state.settings?.energyUnit ?? 'kcal',
      facts: entryFacts(state, savedEntry ?? {[kind + 'Id']: resource.id, amount: 1}),
      _local: true,
    };
  } catch {
    return null;
  }
}

export async function localPreviewDiaryItem(payload) {
  if (!payload || typeof payload !== 'object') return null;
  const state = await readLocalState();
  if (!state) return null;
  try {
    let next;
    if (payload.id) {
      const existing = (state.entries ?? []).find(row => row.id === payload.id);
      if (!existing) return null;
      next = {...existing, ...payload};
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
