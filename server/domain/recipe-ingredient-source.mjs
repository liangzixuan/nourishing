import {ingredientWarning as issue} from './ingredient-warning.mjs';
import {recipeListEntries} from './recipe-list.mjs';
import { numericQuantity } from 'numeric-quantity';
import { identifyUnit } from 'parse-ingredient';
import { parseIngredientLine } from './recipe-ingredients.mjs';

const invalid = message => { throw Object.assign(Error(message), { status: 400 }); };
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const has = (value, key) => Object.hasOwn(value, key);
const typed = (value, name) => [value?.['@type']].flat().some(type => [name, `https://schema.org/${name}`, `http://schema.org/${name}`].includes(type));
// UNECE UnitMeasureCode vocabulary. Conversion remains in recipe-ingredients;
// volume codes still require a compatible recorded food portion.
const codeUnits = new Map(Object.entries({ GRM: 'gram', KGM: 'kilogram', MGM: 'milligram', ONZ: 'ounce', LBR: 'pound', G21: 'cup', G24: 'tablespoon', G25: 'teaspoon' }));
function line(value) {
  if (typeof value !== 'string' || !value.trim() || value.length > 10000 || /[\r\n]/u.test(value)) invalid('Recipe ingredients must be nonempty text lines below 10,000 characters, or named PropertyValue objects.');
  return value;
}
function number(value) {
  if (typeof value === 'string' && /,/.test(value)) return null;
  const result = typeof value === 'number' ? value : typeof value === 'string' ? numericQuantity(value, { round: false }) : NaN;
  return Number.isFinite(result) && result > 0 ? result : null;
}
function structured(value, id) {
  const name = line(value.name);
  const parsed = parseIngredientLine(`1 ${name}`, id);
  const issues = [...parsed.issues];
  if (parsed.isGroupHeader) issues.push(issue('structured-name-heading'));
  const quantity = number(value.value), quantity2 = number(value.maxValue);
  if (quantity === null) issues.push(issue('structured-quantity'));
  if (has(value, 'minValue') || has(value, 'maxValue')) issues.push(issue('structured-range'));
  const textUnit = typeof value.unitText === 'string' ? identifyUnit(value.unitText.trim()) : null;
  const codeUnit = typeof value.unitCode === 'string' ? codeUnits.get(value.unitCode.trim()) ?? null : null;
  if (has(value, 'unitText') && !textUnit) issues.push(issue('structured-unit-text'));
  if (has(value, 'unitCode') && !codeUnit) issues.push(issue('structured-unit-code'));
  if (textUnit && codeUnit && textUnit !== codeUnit) issues.push(issue('structured-unit-conflict'));
  if (has(value, 'description')) issues.push(issue('structured-description'));
  const unit = codeUnit ?? textUnit;
  // This label is generated for editing, not represented as verbatim source text.
  const amountLabel = typeof value.value === 'string' || typeof value.value === 'number' ? String(value.value) : 'Quantity unknown';
  const unitLabel = typeof value.unitText === 'string' ? value.unitText : typeof value.unitCode === 'string' ? value.unitCode : '';
  const original = line([amountLabel, unitLabel, name].filter(Boolean).join(' '));
  return { original, sourceIngredient: value, parsed: { ...parsed, original, quantity, quantity2, unit, unitText: unit, isGroupHeader: false, issues } };
}

/** The sole source-tree interpreter used by import, review and stored provenance. */
export function interpretRecipeIngredients(raw) {
  let encoded;
  try { encoded = JSON.stringify(raw); } catch { invalid('Recipe ingredient source must be finite, serializable JSON.'); }
  if (!encoded || Buffer.byteLength(encoded) > 5000000) invalid('Recipe ingredient source exceeds 5 MB or is missing.');
  const root = typeof raw === 'string' ? raw.split(/\r?\n/).filter(value => value.trim()) : raw;
  const pending = [root], rows = [];
  let structuredSource = false;
  while (pending.length) {
    const value = pending.pop();
    if (Array.isArray(value)) { for (let i = value.length - 1; i >= 0; i--) pending.push(value[i]); continue; }
    if (object(value) && typed(value, 'ItemList')) {
      structuredSource = true;
      const entries = recipeListEntries(value);
      for (let i = entries.length - 1; i >= 0; i--) pending.push(entries[i]);
      continue;
    }
    if (object(value) && typed(value, 'ListItem')) {
      structuredSource = true;
      if (!has(value, 'item')) invalid('Recipe ListItem must contain its ingredient in item.');
      pending.push(value.item); continue;
    }
    if (rows.length >= 1000) invalid('A recipe must contain 1 to 1,000 ingredient lines.');
    const id = String(rows.length);
    if (typeof value === 'string') { const original = line(value); rows.push({ original, parsed: parseIngredientLine(original, id) }); }
    else if (object(value) && typed(value, 'PropertyValue')) { structuredSource = true; rows.push(structured(value, id)); }
    else invalid('Recipe ingredients must be text lines, PropertyValue ingredients, or ItemList containers.');
  }
  if (!rows.length) invalid('A recipe must contain 1 to 1,000 ingredient lines.');
  return { ingredients: rows.map(row => row.original), rows, ...(structuredSource ? { ingredientSource: JSON.parse(encoded) } : {}) };
}

export function validateIngredientSource(source, originals) {
  const result = interpretRecipeIngredients(source);
  if (result.ingredients.length !== originals.length || result.ingredients.some((line, index) => line !== originals[index])) invalid('Structured ingredient source does not match the source review rows.');
  return result;
}
