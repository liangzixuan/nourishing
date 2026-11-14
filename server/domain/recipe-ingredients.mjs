import {ingredientWarning as issue,isIngredientWarning} from './ingredient-warning.mjs';
import {foodQuantityReason} from './food-quantity.mjs';
import {quantityUnit,isQuantityUnit} from './quantity-units.mjs';
import {resolveFoodQuantity,parseVolume} from './food-quantity.mjs';
import {catalogSourceId} from './food-catalog-identity.mjs';
import {assessIngredientMatch} from './recipe-matching.mjs';
import {preparationFacts,withoutPreparationWords} from './ingredient-preparation.mjs';
import {separateIngredientPrices,separateIngredientMeasurements} from './ingredient-annotations.mjs';
import {
  parseIngredient, identifyUnit, unitsOfMeasure, buildLeadingQuantityPrefixRegex,
  buildRangeSeparatorRegex, defaultRangeSeparators,
} from 'parse-ingredient';
import {numericQuantity} from 'numeric-quantity';

const sizes = ['extra small', 'extra-small', 'small', 'medium', 'extra large', 'extra-large', 'large', 'jumbo'];
const prefixes = ['approximately', 'approx.', 'approx', 'about', 'roughly', '~'];
const prefixPattern = buildLeadingQuantityPrefixRegex(prefixes);
const rangePattern = buildRangeSeparatorRegex(defaultRangeSeparators);
const additionalUOMs = {serving: {short: 'serving', plural: 'servings', alternates: [], type: 'count'}};
const parserOptions = {ignoreUOMs: sizes, leadingQuantityPrefixes: prefixes, additionalUOMs};
// These operations reshape a named item without changing how many source
// items were used. They are not interchangeable when measuring by volume.
const countReshapingForms = new Set(['beaten','chopped','minced','diced','sliced','ground','grated','shredded','mashed','crushed','cubed','quartered','halved']);
const isItemCountUnit = unit => unit === null || unitsOfMeasure[unit]?.type === 'count';

const packageUnits = new Set(['bag','box','can','carton','container','pack','package']);
const positive = value => typeof value === 'number' && Number.isFinite(value) && value > 0;
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
function invalid(message) { throw Object.assign(new Error(message), {status: 400}); }
function stripPrefixes(text) {
  let remainder = text.trim();
  let matched = false;
  while (true) {
    const match = prefixPattern.exec(remainder);
    if (!match?.[0]) break;
    matched = true;
    remainder = remainder.slice(match[0].length).trimStart();
  }
  return {remainder, matched};
}

function quantityPrefix(text) {
  // parse-ingredient 2.2.0 has no precision option and rounds via its helper.
  // Reuse that installed helper's explicit no-rounding mode for source numbers.
  return numericQuantity(text, {round: false, allowTrailingInvalid: true, verbose: true});
}

function queryFor(description) {
  let query = description
    .replace(/\([^)]*\b(?:oz|ounces?|grams?|g|kg|ml|milliliters?|liters?|pounds?|lb)\b[^)]*\)/giu, ' ')
    .replace(/\b(?:to taste|as needed|optional|for garnish|divided)\b/giu, ' ')
    .replace(/\bplus\s+more\b.*$/iu, ' ')
    .replace(/(?:,\s*|\s+)to serve\s*(?:\(\s*\))?\s*$/iu, ' ')
    .replace(/\b(?:heaped|heaping|scant|rounded|generous|loosely|firmly|lightly|tightly|finely|coarsely)\b/giu, ' ')
    .replace(/\b(?:extra[ -]small|extra[ -]large|small|medium|large|jumbo)\b/giu, ' ')
    .replace(/\b(?:bags?|boxes?|cans?|cartons?|containers?|packs?|packages?)\b/giu, ' ');
  query=withoutPreparationWords(query);
  return query.replace(/[(),:;]/gu, ' ').replace(/\s+/gu, ' ').trim();
}

function parseSingleIngredientLine(original, id) {
  if (typeof original !== 'string' || !original.trim() || /[\r\n]/u.test(original)) invalid('Each ingredient must be one nonempty line of text.');
  if (typeof id !== 'string' || !id) invalid('Ingredient ID must be nonempty text.');
  const measured=separateIngredientMeasurements(original);
  const {text:analysisText,annotations}=separateIngredientPrices(measured.text);
  const {remainder, matched: approximate} = stripPrefixes(analysisText);
  const numeric = quantityPrefix(remainder);
  const issues = [];
  if(measured.unresolvedMeasurements.length)issues.push(issue('unresolved-measurement'));
  let primary = null, secondary = null, sourceForParser = analysisText;
  if (Number.isFinite(numeric.value)) {
    primary = numeric.value;
    let tail = numeric.trailingInvalid ?? '';
    const separator = rangePattern.exec(tail);
    if (separator) {
      const other = quantityPrefix(tail.slice(separator[0].length).trimStart());
      if (Number.isFinite(other.value)) { secondary = other.value; tail = other.trailingInvalid ?? ''; }
      else issues.push(issue('unparsed-range'));
    }
    sourceForParser = `1 ${tail}`;
  }
  let parsed = parseIngredient(sourceForParser, parserOptions)[0];
  if (!parsed) invalid('The ingredient line could not be parsed.');
  // The library recognizes a leading clove unit. This source form puts the same
  // count after the named food; standalone cloves still denote the spice.
  const garlicCount=parsed.unitOfMeasureID===null?parsed.description.match(/^(garlic)\s+(cloves?)(?=$|[\s,(])/iu):null;
  if(garlicCount)parsed={...parsed,description:parsed.description.replace(/^(garlic)\s+cloves?\b/iu,'$1'),unitOfMeasureID:identifyUnit(garlicCount[2],parserOptions),unitOfMeasure:garlicCount[2]};
  const isGroupHeader = parsed.isGroupHeader;
  const preparation = preparationFacts(analysisText);
  const description = parsed.description;
  const ambiguousComma = /^\s*[+-]?\d+,\d{1,2}(?=\D|$)/u.test(remainder);
  const quantity = ambiguousComma ? null : primary === null ? parsed.quantity : primary;
  const quantity2 = secondary === null ? parsed.quantity2 : secondary;
  const unit = parsed.unitOfMeasureID;
  let publishedMeasurement=null;
  if(measured.measurements.length){
    const measure=measured.measurements[0];
    const before=stripPrefixes(separateIngredientPrices(original.slice(0,measure.start)).text).remainder;
    const prefix=quantityPrefix(before),prefixUnit=identifyUnit((prefix.trailingInvalid??'').trim(),parserOptions);
    const comparison=measure.scope==='total'?{quantity,unit}:{quantity:prefix.value,unit:prefixUnit};
    // A measurement after a complete mass/volume prefix describes that total.
    // An explicit total can follow a named count. An unqualified count or
    // package annotation still does not establish whether a weight is per item.
    if(measured.measurements.length===1&&(measure.scope==='total'||positive(prefix.value)&&['mass','volume'].includes(unitsOfMeasure[prefixUnit]?.type))){
      const mass=entry=>entry.unit==='ounce'?entry.quantity*quantityUnit('oz').factor:entry.quantity*unitsOfMeasure[entry.unit].conversionFactor;
      const sameUnit=comparison.unit===measure.unit;
      const bothMass=unitsOfMeasure[comparison.unit]?.type==='mass'&&unitsOfMeasure[measure.unit].type==='mass';
      const bothMetricVolume=['liter','milliliter'].includes(comparison.unit)&&['liter','milliliter'].includes(measure.unit);
      if(sameUnit&&comparison.quantity!==measure.quantity||(bothMass||bothMetricVolume)&&mass(comparison)!==mass(measure)){
        issues.push(issue('conflicting-measurements'));
      }else publishedMeasurement=measure;
    }else issues.push(issue('measurement-scope'));
  }
  if (!isGroupHeader) {
    if (!positive(quantity)) issues.push(issue('missing-quantity'));
    if (ambiguousComma) issues.push(issue('ambiguous-number-format'));
    if (quantity2 !== null) issues.push(issue('quantity-range'));
    if (approximate) issues.push(issue('approximate-quantity'));
    if (/\b(?:to taste|as needed)\b/iu.test(analysisText)) issues.push(issue('to-taste'));
    if (/\boptional\b/iu.test(analysisText)) issues.push(issue('optional-ingredient'));
    if (/\bplus\s+more\b/iu.test(description)) issues.push(issue('unmeasured-extra'));
    if (/\b(?:and|plus)\b[^\r\n]*\d/iu.test(description)) issues.push(issue('compound-quantity'));
    const packingQualifier=/\b(?:heaped|heaping|scant|rounded|generous)\b|\b(?:loosely|firmly|lightly|tightly)\s+packed\b/iu.test(analysisText);
    const cuttingDegree=/\b(?:finely|coarsely)\s+(chopped|ground|shredded)\b/iu.exec(analysisText);
    const countReshaping=!!cuttingDegree&&isItemCountUnit(unit)&&countReshapingForms.has(cuttingDegree[1].toLowerCase());
    if ((packingQualifier||cuttingDegree&&!countReshaping)&&unitsOfMeasure[publishedMeasurement?.unit]?.type!=='mass') issues.push(issue('quantity-qualifier'));
    if (packageUnits.has(unit) || /\([^)]*\d[^)]*\)\s*(?:cans?|packages?|packs?|bags?|boxes?|cartons?|containers?)\b/iu.test(analysisText) || /\b(?:cans?|packages?|packs?|bags?|boxes?|cartons?|containers?)\s+of\b/iu.test(description)) {
      issues.push(issue('package-quantity'));
    }
    if (/\b(?:juice|zest|peel|peels)\s+(?:of|from)\b/iu.test(analysisText)) issues.push(issue('ingredient-part'));
    if (primary === null && quantity !== null && /[¼½¾⅐-⅞]|\d\s*\/\s*\d/u.test(analysisText)) issues.push(issue('trailing-fraction'));
  }
  const query = isGroupHeader ? '' : queryFor(description);
  if (!isGroupHeader && !query) issues.push(issue('missing-description'));
  return {id, original, description, query, quantity: positive(quantity) ? quantity : null,
    quantity2: positive(quantity2) ? quantity2 : null, unit, unitText: parsed.unitOfMeasure,
    preparation, isGroupHeader, issues,...(annotations.length?{annotations}:{}),...(measured.measurements.length?{measurements:measured.measurements,publishedMeasurement}:{}),...(measured.unresolvedMeasurements.length?{unresolvedMeasurements:measured.unresolvedMeasurements}:{})};
}

// Track actual pairs so an unmatched or mixed bracket cannot create a food choice.
function choiceDelimiters(text) {
  const stack = [], groups = [], separators = [];
  for (const match of text.matchAll(/[()[\]]|\s+or\s+/ig)) {
    const token = match[0];
    if (token === '(' || token === '[') stack.push({token, start: match.index});
    else if (token === ')' || token === ']') {
      const opening = stack.pop();
      if (!opening || (opening.token === '(' ? ')' : ']') !== token) return null;
      if (!stack.length) groups.push({start: opening.start, end: match.index});
    } else if (!stack.length) separators.push({start: match.index, end: match.index + token.length});
  }
  return stack.length ? null : {groups, separators};
}

function topLevelChoices(text, delimiters) {
  const clauses = [];
  let start = 0;
  for (const separator of delimiters.separators) {
    clauses.push(text.slice(start, separator.start).trim());
    start = separator.end;
  }
  clauses.push(text.slice(start).trim());
  return clauses;
}

// These color words can qualify a food but do not name one on their own.
// Orange is deliberately absent: it can be a fruit or a color.
const foodColors = new Set(['red','green','yellow','white','brown','black','purple','blue']);
function modifierKind(description) {
  const query = queryFor(description), words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const preparation = preparationFacts(description);
  if (!words.every(word => foodColors.has(word))) return null;
  const kinds = [Boolean(words.length),Boolean(preparation.states.length),Boolean(preparation.forms.length),Boolean(preparation.size)];
  return kinds.some(Boolean) ? kinds.join(':') : null;
}

function sharedModifierChoices(clauses) {
  if (clauses.length < 2 || clauses.some(clause => !clause.trim())) return clauses;
  const parsed = clauses.map((clause, index) => parseSingleIngredientLine(clause, 'choice:' + index));
  const kind = modifierKind(parsed[0].description);
  if (!kind || !parsed.slice(0, -1).every(option => modifierKind(option.description) === kind)) return clauses;
  const last = parsed.at(-1).description;
  // Retain the final clause's full noun phrase and trailing preparation. Only
  // an understood modifier prefix can be separated from that shared suffix.
  let boundary = null;
  for (const match of last.matchAll(/\s+/g)) {
    const prefixKind = modifierKind(last.slice(0, match.index));
    if (!prefixKind) break;
    if (prefixKind === kind) { boundary = match.index + match[0].length; break; }
  }
  if (boundary === null || !queryFor(last.slice(boundary))) return clauses;
  const suffix = last.slice(boundary);
  if (/\b(?:with|and|plus|or|from|of|in|on)\b|\d/iu.test(queryFor(suffix)) ||
    (suffix.includes(',') && queryFor(suffix.slice(suffix.indexOf(',') + 1)))) return clauses;
  return clauses.map((clause, index) => index === clauses.length - 1 ? clause : clause + ' ' + suffix);
}

function parentheticalChoices(text, delimiters) {
  const options = delimiters.groups.filter(group => /^or\s+/i.test(text.slice(group.start + 1, group.end).trim()));
  // Separate parenthetical choices would require deciding how their scopes combine.
  if (options.length !== 1) return [text];
  const {start, end} = options[0], base = text.slice(0, start).trim();
  const suffix = text.slice(end + 1);
  if (!base) return [text];
  const body = text.slice(start + 1, end).trim().replace(/^or\s+/i, '');
  const inner = choiceDelimiters(body);
  if (!inner) return [text];
  const clauses = [base, ...topLevelChoices(body, inner)];
  if (queryFor(suffix)) {
    // An inline noun belongs to every explicitly bracketed modifier: red
    // (or green) pepper. A complete food followed by another food or an
    // unresolved connector still has ambiguous scope and stays manual.
    const head = suffix.split(',')[0].trim();
    if (!/^[\p{L}][\p{L}\p{M}\s'-]*$/u.test(head) ||
      /\b(?:with|and|plus|or|for|to|from|of|in|on)\b/iu.test(head) ||
      (suffix.includes(',') && queryFor(suffix.slice(suffix.indexOf(',') + 1))) ||
      !clauses.every((clause,index) => modifierKind(parseSingleIngredientLine(clause,'choice:' + index).description))) return [text];
  }
  return clauses.map(clause => clause + (/^[\p{L}]/u.test(suffix) ? ' ' : '') + suffix);
}

function ingredientChoices(text, delimiters) {
  // Walk explicit branches in source order. One parenthetical group may branch
  // at each level; separate groups never produce an inferred Cartesian product.
  // Only four leaf texts are retained for the existing retrieval budget, while
  // the count still covers every branch. An explicit stack avoids call-depth
  // limits for nested source text.
  const pending = [{text, delimiters}], clauses = [];
  let count = 0;
  while (pending.length) {
    const current = pending.pop(), pairs = current.delimiters ?? choiceDelimiters(current.text);
    if (!pairs) return {clauses:[],count:0,unresolved:true};
    const top = topLevelChoices(current.text,pairs);
    const branches = top.length > 1 ? sharedModifierChoices(top) : parentheticalChoices(current.text,pairs);
    if (branches.length > 1) {
      for (let index=branches.length-1;index>=0;index--) pending.push({text:branches[index]});
    } else {
      if (pairs.groups.some(group=>/^or\s+/i.test(current.text.slice(group.start+1,group.end).trim()))) return {clauses:[],count:0,unresolved:true};
      count++;
      if (clauses.length < 4) clauses.push(current.text);
    }
  }
  return {clauses,count,unresolved:false};
}

function manualAlternative(parsed) {
  return {...parsed, issues: [...parsed.issues, issue('alternative-choice',{variant:'unresolved'})]};
}

/** Alternative clauses are retrieval hints, never a chosen food or quantity. */
export function parseIngredientLine(original, id) {
  const parsed = parseSingleIngredientLine(original, id);
  if (parsed.isGroupHeader) return parsed;
  const text = separateIngredientPrices(original).text;
  const delimiters = choiceDelimiters(text);
  if (!delimiters) return parsed;
  const {clauses,count,unresolved} = ingredientChoices(text,delimiters);
  if (unresolved) return manualAlternative(parsed);
  if (count < 2) return parsed;
  // Keep the matching owner's existing four-query budget. Remaining clauses
  // stay in original text and require manual search, with explicit disclosure.
  const alternatives = clauses.map((text, index) => {
    if (!text.trim()) return null;
    const option = parseSingleIngredientLine(text, id + ':option:' + index);
    // The library can leave a terminal unit as the description (200 g).
    // It does not identify a second food.
    if (option.quantity !== null && identifyUnit(option.query, parserOptions)) return null;
    // An unresolved bare modifier is not a complete named food option.
    if (modifierKind(option.description)) return null;
    return {text, query: option.query, preparation: option.preparation};
  });
  if (alternatives.some(option => /^(?:salad|cooking|serving|garnish)$/i.test(option?.query))) return parsed;
  if (alternatives.some(option => !option?.query)) return manualAlternative(parsed);
  return {...parsed, alternatives, alternativeCount: count, issues: [...parsed.issues,
    issue('alternative-choice',{variant:count>4?'limited':'complete'})]};
}

function validateParsed(parsed) {
  if (!object(parsed) || !object(parsed.preparation) || !Array.isArray(parsed.preparation.forms) || !Array.isArray(parsed.preparation.states) || !Array.isArray(parsed.issues)) invalid('Parsed ingredient facts are malformed.');
  for (const value of [parsed.quantity, parsed.quantity2]) if (value !== null && !positive(value)) invalid('Parsed ingredient quantities must be positive numbers or null.');
  if (parsed.unit !== null && typeof parsed.unit !== 'string') invalid('Parsed ingredient unit is malformed.');
  if (!parsed.preparation.forms.every(value => typeof value === 'string') || !parsed.preparation.states.every(value => typeof value === 'string')) invalid('Parsed preparation facts are malformed.');
  if (parsed.preparation.cutSizes!==undefined&&(!Array.isArray(parsed.preparation.cutSizes)||!parsed.preparation.cutSizes.every(value=>typeof value==='string'))) invalid('Parsed cut sizes are malformed.');
  if (!parsed.issues.every(isIngredientWarning)) invalid('Parsed ingredient issues are malformed.');
  if(parsed.publishedMeasurement!==undefined&&parsed.publishedMeasurement!==null){
    const m=parsed.publishedMeasurement;
    if(!object(m)||!positive(m.quantity)||!['mass','volume'].includes(unitsOfMeasure[m.unit]?.type)||!Array.isArray(parsed.measurements)||!parsed.measurements.some(row=>row.start===m.start&&row.end===m.end&&row.text===m.text&&row.quantity===m.quantity&&row.unit===m.unit))invalid('Parsed published measurement is malformed.');
  }
}

function sourcePortionFacts(parsed) {
  // An anonymous "whole" measure refers to the selected source food. Preserve
  // that meaning before the preparation parser's empty query loses its noun.
  // Other unnamed forms, units and unresolved source qualifiers are not whole
  // items. An explicit size remains part of the portion's preparation facts.
  const wholeItem=parsed.unit===null&&parsed.query===''&&parsed.preparation.forms.length===1&&parsed.preparation.forms[0]==='whole'
    &&parsed.preparation.states.length===0&&!parsed.preparation.cutSizes?.length&&parsed.issues.every(issue=>issue.code==='missing-description')&&parsed.quantity2===null;
  // A recipe line still needs a food name. This source measure already belongs
  // to a food, so only its expected missing-description issue can be discharged.
  const issues=parsed.issues.filter(issue=>!wholeItem||issue.code!=='missing-description');
  return {description:parsed.query,preparation:parsed.preparation,wholeItem,issues};
}

function sourcePortions(food, original, options) {
  if(food.source?.provider==='frida'){
    if(original&&(original.foodId!==food.source.fridaFoodId||original.food?.rowNumber!==food.source.recordLocator?.rowNumber))invalid('The retained Frida record does not belong to the selected food.');
    return [];
  }
  if(food.source?.provider==='bls'){
    if(original&&(original.foodCode!==food.source.blsCode||original.rowNumber!==food.source.recordLocator?.rowNumber))invalid('The retained BLS record does not belong to the selected food.');
    return [];
  }
  if(food.source?.provider==='nevo'){
    if(original&&(original.food?.row?.['NEVO-code']!==String(food.source.nevoCode)||original.food?.rowNumber!==food.source.recordLocator?.rowNumber))invalid('The retained NEVO record does not belong to the selected food.');
    return [];
  }
  if(food.source?.provider==='afcd'){
    if(original&&(original.publicFoodKey!==food.source.afcdFoodKey||!original.profiles?.some(row=>row.basis===food.source.afcdBasis&&row.worksheet===food.source.recordLocator?.worksheet&&row.rowNumber===food.source.recordLocator?.rowNumber)))invalid('The retained AFCD record does not belong to the selected food profile.');
    return [];
  }
  if(food.source?.provider==='cofid'){
    if(original&&(original.foodCode!==food.source.foodCode||original.rowNumber!==food.source.cofidRow))invalid('The retained CoFID record does not belong to the selected food.');
    // CoFID publishes a food basis, but no household portion measurements.
    return [];
  }
  if(food.source?.provider==='cnf'){
    if(original&&original.food?.row?.FoodID!==String(food.source.cnfFoodId))invalid('The retained CNF record does not belong to the selected food.');
    // The normalizer owns the measured portion and its published description.
    // Unresolved source measures were withheld there; never reconstruct them here.
    return options.flatMap(portion=>{
      const parsed=parseIngredientLine(portion.label,portion.id);
      const facts=sourcePortionFacts(parsed);
      if(!positive(parsed.quantity)||parsed.quantity2!==null||facts.issues.length)return [];
      const unit=parsed.unit??identifyUnit(parsed.query,parserOptions);
      return [{id:portion.id,grams:portion.grams,quantity:parsed.quantity,unit,
        type:unitsOfMeasure[unit]?.type??'food-count',measureName:'',...facts}];
    });
  }
  if (food.source?.survey) {
    const source = food.source.survey;
    if (!Array.isArray(source.portions)) invalid('The retained survey portion facts are malformed.');
    return source.portions.flatMap(row => {
      if (row.kind !== 'described' || !positive(row.gramWeight)) return [];
      const id = `${catalogSourceId(food)}:portion:${row.id}`, known = options.find(item => item.id === id);
      if (!known || known.grams !== row.gramWeight || typeof row.description !== 'string') return [];
      const parsed = parseIngredientLine(row.description, id);
      const facts=sourcePortionFacts(parsed);
      if (!positive(parsed.quantity) || parsed.quantity2 !== null || facts.issues.length) return [];
      // parse-ingredient leaves a terminal measure ("1 cup") in the description.
      const unit = parsed.unit ?? identifyUnit(parsed.query, parserOptions);
      return [{id, grams:row.gramWeight, quantity:parsed.quantity, unit,
        type:unitsOfMeasure[unit]?.type ?? 'food-count', measureName:'', ...facts}];
    });
  }
  if (!original) return [];
  if (!object(original) || !Array.isArray(original.foodPortions)) invalid('The retained source portion record is malformed.');
  if (food.source?.fdcId !== undefined && original.fdcId !== food.source.fdcId) invalid('The retained source record does not belong to the selected food.');
  return original.foodPortions.flatMap(row => {
    if (!object(row) || !positive(row.amount) || !positive(row.gramWeight)) return [];
    const sourcePrefix = food.source?.datasetId && food.source?.fdcId ? catalogSourceId(food) : food.id;
    const id = `${sourcePrefix}:portion:${row.id}`;
    const known = options.find(item => item.id === id);
    if (!known || known.grams !== row.gramWeight) return [];
    const measureName = typeof row.measureUnit?.name === 'string' && !['undetermined', 'unknown', 'not specified'].includes(row.measureUnit.name.toLowerCase()) ? row.measureUnit.name : '';
    const modifier = typeof row.modifier === 'string' ? row.modifier : '';
    const portionDescription = typeof row.portionDescription === 'string' ? row.portionDescription : '';
    const text = [measureName, portionDescription, modifier].filter(Boolean).join(' ');
    const parsed = parseIngredientLine(`${row.amount} ${text}`, id);
    if (parsed.issues.some(item => item.code === 'quantity-qualifier')) return [];
    const sourceUnit = identifyUnit(measureName, parserOptions)
      ?? identifyUnit(portionDescription, parserOptions)
      ?? identifyUnit(modifier, parserOptions) ?? parsed.unit ?? identifyUnit(parsed.query,parserOptions);
    const sourceType = unitsOfMeasure[sourceUnit]?.type;
    return [{id, grams: row.gramWeight, quantity: row.amount, unit: sourceUnit,
      type: sourceType ?? 'food-count', measureName, ...sourcePortionFacts(parsed)}];
  });
}

function sameForms(left, right) {
  return left.length === right.length && left.every(value => right.includes(value));
}

function ratioBetween(from, to) {
  if (from === to) return 1;
  const a = unitsOfMeasure[from], b = unitsOfMeasure[to];
  if (!a || !b || a.type !== 'volume' || b.type !== 'volume') return null;
  // System-independent mL/L conversion is supported. Regional cups/spoons are
  // not related unless the exact same source unit is selected.
  return typeof a.conversionFactor === 'number' && typeof b.conversionFactor === 'number'
    ? a.conversionFactor / b.conversionFactor : null;
}

function stems(text) { return (text.toLowerCase().match(/[\p{L}]+/gu) ?? []).map(word => word.endsWith('s') ? word.slice(0, -1) : word); }

function compatiblePortion(parsed, portion, food) {
  const volume=unitsOfMeasure[parsed.unit]?.type === 'volume';
  const quantityPreparation=preparation=>{
    const forms=volume?preparation.forms:preparation.forms.filter(form=>!countReshapingForms.has(form)&&!(portion.wholeItem&&form==='whole'));
    // Piece/chunk/strip counts still depend on their dimensions. Cut size is
    // irrelevant only when the named whole-item count survives the reshaping.
    const cutSizes=volume||forms.some(form=>['piece','chunk','strips'].includes(form))?preparation.cutSizes??[]:[];
    return {forms,cutSizes};
  };
  const requested=quantityPreparation(parsed.preparation),supplied=quantityPreparation(portion.preparation);
  if (!sameForms(requested.forms,supplied.forms)||!sameForms(requested.cutSizes,supplied.cutSizes)) return null;
  const preparationAdjusted=!sameForms(parsed.preparation.forms,portion.preparation.forms)||!sameForms(parsed.preparation.cutSizes??[],portion.preparation.cutSizes??[]);
  const match=ratio=>ratio===null?null:{ratio,preparationAdjusted};
  if (volume) {
    if (portion.type !== 'volume') return null;
    return match(ratioBetween(parsed.unit, portion.unit));
  }
  if (!isItemCountUnit(parsed.unit)) return null;
  if (portion.type === 'volume' || portion.type === 'mass') return null;
  if (parsed.preparation.size !== portion.preparation.size) return null;
  if (parsed.unit !== null) return parsed.unit === portion.unit ? match(1) : null;
  if (portion.unit !== null) return null;
  if (portion.wholeItem) return assessIngredientMatch(parsed,food).status==='incompatible'?null:match(1);
  const measureWords = stems(portion.measureName || portion.description);
  const queryWords = stems(parsed.query);
  // A raw source item measure or an explicitly sized count can establish a
  // whole-food portion. RACC and unspecified "serving" never mean one item.
  if (measureWords.some(word => ['racc', 'serving', 'package', 'container'].includes(word))) return null;
  if (parsed.preparation.size || measureWords.includes('fruit') || measureWords.includes('item') || measureWords.some(word => queryWords.includes(word))) return match(1);
  return null;
}

export function convertIngredient(parsed, food, {original = null, override = null} = {}) {
  validateParsed(parsed);
  if (!object(food) || typeof food.id !== 'string' || !food.id) invalid('A selected food record is required.');
  if (food.grams !== null && food.grams !== undefined && !positive(food.grams)) invalid('The selected food has an invalid gram basis.');
  const basis = positive(food.grams) ? food.grams : null;
  const volume=parseVolume(food.milliliters);
  if (food.portions !== undefined && !Array.isArray(food.portions)) invalid('The selected food portions are malformed.');
  const options = (food.portions ?? []).filter(item => object(item) && typeof item.id === 'string' && typeof item.label === 'string' && (positive(item.grams)||positive(item.milliliters))).map(({id, label, grams, milliliters}) => ({id, label, ...(grams!==undefined?{grams}:{}),...(milliliters!==undefined?{milliliters}:{})}));
  const issues = parsed.issues.map(value => ({...value}));
  const review = (code, reason) => ({status: 'needs-review', grams: null, amount: null, method: null, portionId: null, reason, options, issues: [...issues, {code,explanation:reason}]});
  const resolved = (grams, amount, method, portionId, reason, sourceQuantity) => {
    if ((grams !== null && !positive(grams)) || !positive(amount)) return review('unsupported-quantity', {code:'unsupported-quantity'});
    return {status: 'resolved', grams, amount, method, portionId, reason, options, issues, sourceQuantity};
  };
  const byGrams = (grams, method, portionId, reason, sourceQuantity={quantity:grams,unit:'g'}) => basis === null
    ? review('unknown-serving-basis', {code:'unknown-serving-basis'})
    : resolved(grams, grams / basis, method, portionId, reason, sourceQuantity);
  const byMeasure=(sourceQuantity,method,reason)=>{try{const quantity=resolveFoodQuantity(food,sourceQuantity);return {...resolved(quantity.grams,quantity.amount,method,sourceQuantity.portionId??null,reason,sourceQuantity),...(quantity.milliliters!==undefined?{milliliters:quantity.milliliters}:{})};}catch(error){if(error.status!==400)throw error;return review('unknown-serving-basis',foodQuantityReason(error));}};
  if (override !== null) {
    if (!object(override) || !(isQuantityUnit(override.unit)||['portion','serving'].includes(override.unit))) invalid('A quantity override requires a positive number and g, portion, or serving.');
    if (override.quantity === null) return review('incomplete-quantity-override', {code:'incomplete-quantity-override'});
    if (!positive(override.quantity)) invalid('A quantity override requires a positive number and g, portion, or serving.');
    if (isQuantityUnit(override.unit)&&override.unit!=='g') return byMeasure({quantity:override.quantity,unit:override.unit},quantityUnit(override.unit).basis==='grams'?'manual-grams':'manual-volume',{code:'manual-measure'});
    if (override.unit === 'g') return byGrams(override.quantity, 'manual-grams', null, {code:'manual-grams'});
    if (override.unit === 'serving') return resolved(basis === null ? null : override.quantity * basis, override.quantity, 'manual-serving', null, {code:'manual-serving'}, {amount:override.quantity});
    if (typeof override.portionId !== 'string') invalid('A source portion ID is required for a portion override.');
    if (override.portionId === '') return review('incomplete-portion-override', {code:'incomplete-portion-override'});
    const portion = options.find(item => item.id === override.portionId);
    if (!portion) invalid('The selected portion does not belong to this food.');
    return byMeasure({quantity:override.quantity,unit:'portion',portionId:portion.id},'manual-portion',{code:'manual-portion'});
  }
  if (parsed.isGroupHeader) return review('group-header', {code:'group-header'});
  if (issues.length || parsed.quantity === null) return review('quantity-review-required', {code:'quantity-review-required'});
  const meta = unitsOfMeasure[parsed.unit];
  if (meta?.type === 'mass' && typeof meta.conversionFactor === 'number') {
    // Prefer an explicit primary mass over another published volume. No
    // density is required; conflicting published masses were flagged above.
    if(parsed.unit==='ounce')return byMeasure({quantity:parsed.quantity,unit:'oz'},'mass-unit',{code:'ounce-mass'});
    return byGrams(parsed.quantity * meta.conversionFactor, 'mass-unit', null, {code:'mass-unit'});
  }
  if(parsed.publishedMeasurement){
    const {quantity,unit}=parsed.publishedMeasurement,measurementMeta=unitsOfMeasure[unit];
    if(measurementMeta?.type==='mass'){
      if(unit==='ounce')return byMeasure({quantity,unit:'oz'},'published-measurement',{code:'published-mass'});
      return byGrams(quantity*measurementMeta.conversionFactor,'published-measurement',null,{code:'published-mass'});
    }
    if(['liter','milliliter'].includes(unit))return byMeasure({quantity,unit:unit==='liter'?'L':'mL'},'published-measurement',{code:'published-volume'});
    return review('unsupported-published-measurement',{code:'unsupported-published-measurement'});
  }
  if(volume!==null&&['liter','milliliter'].includes(parsed.unit))return byMeasure({quantity:parsed.quantity,unit:parsed.unit==='liter'?'L':'mL'},'volume-unit',{code:'volume-unit'});
  const portions = sourcePortions(food, original, options);
  const matches = portions.flatMap(portion => {
    const match = compatiblePortion(parsed, portion, food);
    if(match===null)return [];
    const count=parsed.quantity*match.ratio/portion.quantity;
    return [{...portion, count, preparationAdjusted:match.preparationAdjusted, convertedGrams:count*portion.grams}];
  });
  if (!matches.length) return review('no-compatible-source-portion', {code:'no-compatible-source-portion'});
  if (new Set(matches.map(item => item.convertedGrams)).size > 1) return review('ambiguous-source-portions', {code:'ambiguous-source-portions'});
  const selected = matches.sort((a, b) => a.id.localeCompare(b.id))[0];
  const reason=selected.wholeItem?{code:'whole-item'}:selected.preparationAdjusted?{code:'count-preserved'}:{code:'source-portion'};
  return byGrams(selected.convertedGrams, food.source?.provider==='cnf'?'cnf-portion':'usda-portion', selected.id, reason, {quantity:selected.count,unit:'portion',portionId:selected.id});
}
