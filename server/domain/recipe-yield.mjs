const servingUnit = value => typeof value === 'string' && /^(?:servings?|portions?|people|persons?)$/i.test(value.trim());
const typed = value => [value['@type']].flat().some(type => ['QuantitativeValue','https://schema.org/QuantitativeValue','http://schema.org/QuantitativeValue'].includes(type));
const has = (value,key) => Object.hasOwn(value,key);
function count(value) {
  const n = typeof value === 'number' ? value : typeof value === 'string' && /^\d+(?:\.\d+)?$/.test(value.trim()) ? Number(value.trim()) : NaN;
  return Number.isFinite(n) && n >= 0.001 && n <= 100000 ? n : null;
}
function structured(value) {
  if (!typed(value)) return {kind:'uncertain',count:null};
  const code = typeof value.unitCode === 'string' ? value.unitCode.trim() : null;
  // UNECE C62 denotes a count of one, not a serving. Explicit unitText is still required.
  const countCode = ['C62','https://vocabulary.uncefact.org/UnitMeasureCode#C62','http://vocabulary.uncefact.org/UnitMeasureCode#C62'].includes(code);
  const explicit = servingUnit(value.unitText);
  let n = count(value.value);
  const bounds = has(value,'minValue') || has(value,'maxValue');
  if (bounds) {
    const min = count(value.minValue), max = count(value.maxValue);
    if (min === null || max === null || min !== max || (has(value,'value') && n !== min)) return {kind:'uncertain',count:null};
    n = min;
  }
  if (n === null || has(value,'description') || has(value,'valueReference')) return {kind:'uncertain',count:null};
  if (has(value,'unitCode') && !countCode) return {kind:explicit?'uncertain':'output',count:null};
  if (explicit) return {kind:'servings',count:n};
  // A named output (loaves, muffins, grams) or a bare count is not a serving definition.
  return {kind:'output',count:null};
}
function fact(value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) return structured(value);
  if (typeof value === 'number') return {kind:'unspecified',count:count(value)};
  if (typeof value !== 'string') return {kind:value == null?'output':'uncertain',count:null};
  const text = value.trim();
  const match = text.match(/^(?:serves?\s+)(\d+(?:\.\d+)?)\s*$/i) || text.match(/^(\d+(?:\.\d+)?)\s*(?:servings?|portions?|people|persons?)\s*$/i);
  if (match) return {kind:'servings',count:count(match[1])};
  if (/^\d+(?:\.\d+)?$/.test(text)) return {kind:'unspecified',count:count(text)};
  return {kind:/\b(?:servings?|portions?|people|persons?)\b/i.test(text)?'uncertain':'output',count:null};
}

/** The source-yield owner used by parsing and every review/save evaluation.
 * Source objects stay intact in recipeYield; derived counts never replace them. */
export function interpretRecipeYield(value) {
  const facts = (Array.isArray(value)?value:[value]).map(fact);
  const candidates = facts.filter(row=>row.kind==='servings'||row.kind==='unspecified');
  const distinct = [...new Set(candidates.map(row=>row.count).filter(n=>n!==null))];
  const sourceServings = distinct.length===1 ? distinct[0] : null;
  const invalid = facts.some(row=>row.kind==='uncertain') || candidates.some(row=>row.count===null);
  const explicit = facts.some(row=>row.kind==='servings' && row.count!==null);
  const requiresConfirmation = sourceServings===null || invalid || (!explicit && facts.some(row=>row.kind==='output'));
  const code = sourceServings===null ? (candidates.length?'ambiguous-count':'missing-count')
    : invalid ? 'qualified-count' : requiresConfirmation ? 'non-serving-output' : 'source-count';
  return {sourceServings,requiresConfirmation,code};
}
