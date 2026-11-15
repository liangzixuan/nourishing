import {compactFoodSource,sourceAttributions,mergeSourceAttributions} from './catalog-source.mjs';
import {isActiveLibraryItem} from './library-status.mjs';
import {customFoodCategory} from './food-taxonomy.mjs';
import {diaryDayComplete} from './diary-day-status.mjs';
import {resolvedCarbohydrateValues} from './carbohydrate-values.mjs';
import {catalog, calculateSummary} from './nutrition.mjs';
import {catalogQuery, matchesCatalogQuery} from './usda-catalog.mjs';

const nutrients = new Map(catalog.map(item => [item.id, item]));
const known = value => typeof value === 'number' && Number.isFinite(value) && value >= 0;
const positive = value => known(value) && value > 0;
const excludedGaps = new Set(['calories', 'sodium', 'sugar', 'addedSugar', 'fat', 'carbs']);
function invalid(message) { throw Object.assign(new Error(message), {status: 400}); }
function paging(offset, limit) {
  if (!Number.isSafeInteger(offset) || offset < 0 || !Number.isInteger(limit) || limit < 1 || limit > 100) invalid('Insight offset must be nonnegative and limit must be from 1 to 100.');
}
function sourceSummary(food) {
  const summary = compactFoodSource(food.source);
  if (!summary.name) summary.name = 'Local food library';
  return {...summary, foodServing: food.serving ?? null, foodGrams: positive(food.grams) ? food.grams : null,
    ...(positive(food.milliliters)?{foodMilliliters:food.milliliters}:{})};
}
function validPortions(food) {
  return (Array.isArray(food.portions) ? food.portions : []).filter(item => typeof item?.id === 'string' && item.id && typeof item.label === 'string' && item.label && positive(item.grams));
}
function libraryProjection(food, selected, portionMode) {
  const values = {},resolved=resolvedCarbohydrateValues(food.nutrients);
  for (const id of new Set([...selected, 'calories'])) if (known(resolved[id])) values[id] = resolved[id];
  const portions = portionMode === 'none' ? [] : validPortions(food);
  return {category:customFoodCategory(food),id: food.id, name: food.name, serving: food.serving, grams: food.grams ?? null,
    ...(positive(food.milliliters)?{milliliters:food.milliliters}:{}),
    nutrients: values, portions: portionMode === 'first' ? portions.slice(0, 1) : portions,
    source: sourceSummary(food), kind: 'library'};
}
function recordsFor(foodCatalog, foods, selected, {query = '', portionMode = 'none'} = {}) {
  if (!Array.isArray(foods)) invalid('Library foods must be an array.');
  const parsedQuery = catalogQuery(query);
  const nonSampleFoods = foods.filter(food => food?.sample !== true&&isActiveLibraryItem(food));
  if (!nonSampleFoods.every(food => food && typeof food.id === 'string' && food.id && typeof food.name === 'string' && food.name)) invalid('Library food identity is malformed.');
  const identical = foodCatalog?.identicalSnapshotIds(nonSampleFoods) ?? new Set();
  const records = (foodCatalog?.projectInsights(selected, {query, portions: portionMode}) ?? []).map(food => ({...food, kind: 'catalog'}));
  for (const food of nonSampleFoods) if (!identical.has(food.id) && matchesCatalogQuery([food.name,...(food.translations??[]).map(row=>row.name)].join(' '), parsedQuery)) records.push(libraryProjection(food, selected, portionMode));
  return {records, source: {
    catalog: foodCatalog?.status() ?? {available: false, foodCount: 0, datasets: [], installedAt: null},
    libraryFoods: records.filter(food => food.kind === 'library').length,
    identicalSnapshotsDeduplicated: identical.size, sampleFoodsExcluded: foods.filter(food=>food?.sample===true).length,retiredLibraryFoodsExcluded:foods.filter(food=>food?.sample!==true&&!isActiveLibraryItem(food)).length,
    coverageUnits: 'examined, measured and eligible count food records; total counts ranked rows, including separate published portions.',
  }};
}

function quantityFor(food, basis, portion = null) {
  const gramsKnown = positive(food.grams);
  const energy = food.nutrients.calories;
  let factor, grams, serving;
  if (basis === '100g') {
    if (!gramsKnown) return null;
    factor = 100 / food.grams; grams = 100; serving = '100 g';
  } else if (basis === '100kcal') {
    if (!positive(energy)) return null;
    factor = 100 / energy; grams = gramsKnown ? food.grams * factor : null; serving = '100 kcal';
  } else {
    if (!gramsKnown || !portion || !positive(portion.grams)) return null;
    factor = portion.grams / food.grams; grams = portion.grams; serving = portion.label;
  }
  if (!positive(factor)) return null;
  if (grams !== null && !positive(grams)) grams = null;
  const milliliters=positive(food.milliliters)&&positive(food.milliliters*factor)?food.milliliters*factor:null;
  // The comparison owns its quantity. Consumers must not reconstruct it from
  // labels or discard the serving factor when the source has no gram basis.
  const sourceQuantity=portion?{quantity:1,unit:'portion',portionId:portion.id}
    :grams!==null?{quantity:grams,unit:'g'}
    :milliliters!==null?{quantity:milliliters,unit:'mL'}:{amount:factor};
  const calories = basis === '100kcal' ? 100 : known(energy) && known(energy * factor) ? energy * factor : null;
  return {factor, ref: {kind: food.kind, id: food.id}, name: food.name, serving, grams,sourceQuantity,
    ...(milliliters!==null?{milliliters}:{}),
    attributions:sourceAttributions(food.source), source: sourceSummary(food), category:food.category??null,basis, calories,
    ...(portion ? {portionId: portion.id, portionLabel: portion.label, portionGrams: portion.grams} : {})};
}
function rankedItem(food, nutrient, basis, portion = null) {
  if (!known(food.nutrients[nutrient])) return null;
  const quantity = quantityFor(food, basis, portion);
  if (!quantity) return null;
  const value = food.nutrients[nutrient] * quantity.factor;
  if (!known(value)) return null;
  const {factor, ...item} = quantity;
  // Densities describe the source record independently of the selected ranking quantity.
  const ratio = denominator => positive(denominator) && known(food.nutrients[nutrient] / denominator)
    ? food.nutrients[nutrient] / denominator : null;
  const perGram = ratio(food.grams);
  return {...item, value, density: {
    per100g: perGram !== null && known(perGram * 100) ? perGram * 100 : null,
    perKcal: ratio(food.nutrients.calories),
  }};
}
function textOrder(a, b) { return Buffer.compare(Buffer.from(a), Buffer.from(b)); }
function tieOrder(a, b) {
  return textOrder(a.name.toLowerCase(), b.name.toLowerCase()) || textOrder(a.ref.id, b.ref.id)
    || textOrder(a.portionId ?? '', b.portionId ?? '') || (a.ref.kind === b.ref.kind ? 0 : a.ref.kind === 'catalog' ? -1 : 1);
}

export function rankNutrient({foodCatalog = null, foods = [], nutrient, basis = '100g', query = '', offset = 0, limit = 25, categoryMode='all',categoryIds=[],includeUncategorized=false}) {
  if (!nutrients.has(nutrient)) invalid('Choose an existing nutrient ID.');
  if (!['100g','100kcal','portion'].includes(basis)) invalid('Choose 100g, 100kcal or portion as the comparison basis.');
  paging(offset, limit);
  const {records, source} = recordsFor(foodCatalog, foods, [nutrient], {query, portionMode: basis === 'portion' ? 'all' : 'none'});
  const customCategories=new Map();for(const food of foods.filter(food=>food.sample!==true&&isActiveLibraryItem(food))){const category=customFoodCategory(food);if(category){const row=customCategories.get(category.id)??{...category,name:category.name,foodCount:0};row.foodCount++;customCategories.set(category.id,row);}}
  const categories=[...(foodCatalog?.categories?.()??[]),...customCategories.values()],knownCategories=new Set(categories.map(row=>row.id));
  if(!['all','include','exclude'].includes(categoryMode)||!Array.isArray(categoryIds)||categoryIds.some(id=>typeof id!=='string'||!knownCategories.has(id))||new Set(categoryIds).size!==categoryIds.length||typeof includeUncategorized!=='boolean')invalid('Choose known food categories and an explicit filter mode.');
  const selected=new Set(categoryIds),unclassified=records.filter(food=>!food.category).length;
  const filtered=categoryMode==='all'?records:records.filter(food=>!food.category?includeUncategorized:categoryMode==='include'?selected.has(food.category.id):!selected.has(food.category.id));
  const categoryFilter={mode:categoryMode,ids:[...categoryIds],includeUncategorized,matchedQuery:records.length,uncategorized:unclassified,excluded:records.length-filtered.length};
  const coverage = {examined: filtered.length, measured: 0, eligible: 0};
  const items = [];
  for (const food of filtered) {
    if (known(food.nutrients[nutrient])) coverage.measured += 1;
    const candidates = basis === 'portion'
      ? validPortions(food).map(portion => rankedItem(food, nutrient, basis, portion)).filter(Boolean)
      : [rankedItem(food, nutrient, basis)].filter(Boolean);
    if (candidates.length) { coverage.eligible += 1; items.push(...candidates); }
  }
  items.sort((a, b) => b.value - a.value || tieOrder(a, b));
  const total = items.length;
  return {items: items.slice(offset, offset + limit), total, offset,
    nextOffset: offset + limit < total ? offset + limit : null,
    basis, nutrient, unit: nutrients.get(nutrient).unit, coverage, source,categories,categoryFilter};
}

function ingredientRole(name) {
  return /^(?:spices|seasonings|leavening agents|salt|oils?)(?:\b|,)|\b(?:protein (?:powder|isolate|concentrate)|dietary supplement)\b/iu.test(name)
    ? 'concentrated-ingredient' : 'general-food';
}

export function suggestFoods({foodCatalog = null, state, date, limit = 6}) {
  paging(0, limit);
  if (!state || typeof state !== 'object' || Array.isArray(state)) invalid('A local workspace state is required.');
  let summary;
  try { summary = calculateSummary(state, date); } catch (error) { error.status ??= 400; throw error; }
  const completed = diaryDayComplete(state,date);
  const gaps = catalog.filter(item => !excludedGaps.has(item.id) && positive(summary.targets[item.id])
    && known(summary.totals[item.id]) && summary.nutrientCoverage[item.id].complete
    && (summary.nutrientCoverage[item.id].known > 0 || completed)
    && summary.totals[item.id] < summary.targets[item.id])
    .map(item => ({nutrient: item.id, name: item.name, unit: item.unit,
      target: summary.targets[item.id], remaining: summary.targets[item.id] - summary.totals[item.id]}));
  const method = 'sum-capped-remaining-target-fractions-per-published-portion-or-100g-v1';
  const coverage = {examined: 0, measured: 0, eligible: 0, gaps: gaps.length,
    unmeasuredTargets: catalog.filter(item => !excludedGaps.has(item.id) && positive(summary.targets[item.id])
      && (!summary.nutrientCoverage[item.id].complete || (!completed && summary.nutrientCoverage[item.id].known === 0))).length};
  if (!gaps.length) return {items: [], coverage, method,
    reason: 'No fully measured remaining target can be compared for this day.',
    limitations: ['Unlogged or partially measured intake does not establish a target gap.']};
  const {records, source} = recordsFor(foodCatalog, state.foods ?? [], gaps.map(item => item.nutrient), {portionMode: 'first'});
  const candidates = [];
  coverage.examined = records.length;
  for (const food of records) {
    if (gaps.some(gap => known(food.nutrients[gap.nutrient]))) coverage.measured += 1;
    const portion = validPortions(food)[0] ?? null;
    const quantity = quantityFor(food, portion ? 'portion' : '100g', portion);
    if (!quantity) continue;
    const contributions = gaps.flatMap(gap => {
      const value = food.nutrients[gap.nutrient];
      const scaled = value * quantity.factor;
      return positive(value) && positive(scaled) ? [{...gap, value: scaled, fraction: Math.min(scaled / gap.remaining, 1)}] : [];
    });
    if (!contributions.length) continue;
    coverage.eligible += 1;
    contributions.sort((a, b) => b.fraction - a.fraction || textOrder(a.nutrient, b.nutrient));
    const score = contributions.reduce((sum, item) => sum + item.fraction, 0);
    const {factor, ...item} = quantity;
    candidates.push({...item, attributions:mergeSourceAttributions(summary.attributions,item.attributions),value: score, score, contributions,
      ingredientRole: ingredientRole(food.name),
      reason: {code:'remaining-targets-v1',nutrients:contributions.slice(0,3).map(gap=>({id:gap.nutrient,name:gap.name})),text:`In the displayed comparison quantity, adds measured ${contributions.slice(0, 3).map(gap => gap.name.toLowerCase()).join(', ')} toward your selected remaining targets. Review the amount before logging.`}});
  }
  candidates.sort((a, b) => (a.ingredientRole === b.ingredientRole ? 0 : a.ingredientRole === 'general-food' ? -1 : 1) || b.score - a.score || tieOrder(a, b));
  return {items: candidates.slice(0, limit), coverage, source, method,
    limitations: ['Target differences describe the recorded day and selected targets, not a diagnosis.',
      'Each contribution is capped at the remaining target for scoring. Unknown nutrient values do not contribute.',
      'Published portions are shown when available; otherwise 100 g is a comparison quantity, not a recommended amount.',
      'Concentrated ingredients are identified from explicit food-name categories and listed after general foods.']};
}
