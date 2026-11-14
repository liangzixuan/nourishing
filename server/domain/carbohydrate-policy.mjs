import Big from './energy-decimal.mjs';

export const CARBOHYDRATE_COMPONENTS = Object.freeze(['fiber', 'sugarAlcohol', 'allulose', 'fructose']);
// Explicit mobile Restore Defaults; unconfigured settings remain distinct.
export const DEFAULT_CARBOHYDRATE_POLICY=Object.freeze({mode:'net',netExcluded:Object.freeze(['fiber','sugarAlcohol'])});
export const NET_CARBOHYDRATE_TARGET_ID = 'netCarbohydrate';
const names = {fiber: 'fiber', sugarAlcohol: 'sugar alcohols', allulose: 'allulose', fructose: 'fructose'};
const own = (value, key) => Object.hasOwn(value ?? {}, key);
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const measured = value => typeof value === 'number' && Number.isFinite(value) && value >= 0;
export const carbohydratePolicyErrors=Object.freeze({"invalidComponents": "Choose each known carbohydrate component at most once.", "invalidDefinition": "Carbohydrate policy requires a total or net mode and excluded components.", "invalidTotal": "Total carbohydrate cannot exclude components.", "invalidPolicy": "Carbohydrate policy requires a total or net mode and a Net definition.", "missingDefinition": "Review the Net carbohydrate definition before selecting Net.", "invalidRecord": "Carbohydrate basis requires a food or inline entry.", "invalidBasis": "Carbohydrate basis requires reportedNetExcludes only.", "missingMeasurement": "A declared carbohydrate basis requires a finite nonnegative reported net carbohydrate measurement."});
const invalid = carbohydratePolicyCode => { throw Object.assign(new Error(carbohydratePolicyErrors[carbohydratePolicyCode]), {status: 400,carbohydratePolicyCode}); };

function components(value) {
  if (!Array.isArray(value) || [...value].some(id => !CARBOHYDRATE_COMPONENTS.includes(id)) || new Set(value).size !== value.length) invalid('invalidComponents');
  return CARBOHYDRATE_COMPONENTS.filter(id => value.includes(id));
}

export function parseCarbohydrateDefinition(value) {
  if (!object(value) || Object.keys(value).length !== 2 || !own(value, 'mode') || !own(value, 'excluded') || !['total', 'net'].includes(value.mode)) invalid('invalidDefinition');
  const excluded = components(value.excluded);
  if (value.mode === 'total' && excluded.length) invalid('invalidTotal');
  return {mode: value.mode, excluded};
}

/** Saved preferences own the Net definition even while Total is displayed.
 * null means no reviewed Net definition; [] explicitly excludes nothing. */
export function parseCarbohydratePolicy(value) {
  if (!object(value) || Object.keys(value).length !== 2 || !own(value, 'mode') || !own(value, 'netExcluded') || !['total', 'net'].includes(value.mode)) invalid('invalidPolicy');
  const netExcluded = value.netExcluded === null ? null : components(value.netExcluded);
  if (value.mode === 'net' && netExcluded === null) invalid('missingDefinition');
  return {mode: value.mode, netExcluded};
}
/** One-way upgrade for persisted settings and owned offline snapshots only.
 * Runtime commands use parseCarbohydratePolicy and reject the old shape. */
export function upgradeCarbohydratePolicy(value) {
  if(object(value)&&own(value,'excluded')){
    const definition=parseCarbohydrateDefinition(value);
    return {changed:true,policy:{mode:definition.mode,netExcluded:definition.mode==='net'?[...definition.excluded]:null}};
  }
  return {changed:false,policy:parseCarbohydratePolicy(value)};
}
export function carbohydratePreferences(settings = {}) {
  return own(settings, 'carbohydratePolicy') ? parseCarbohydratePolicy(settings.carbohydratePolicy) : {mode:'total',netExcluded:null};
}
export function netCarbohydrateDefinition(settings = {}) {
  const {netExcluded}=carbohydratePreferences(settings);
  return netExcluded===null?null:{mode:'net',excluded:netExcluded};
}
export function carbohydrateDefinition(settings = {}) {
  const {mode,netExcluded}=carbohydratePreferences(settings);
  return {mode,excluded:mode==='net'?netExcluded:[]};
}

export function carbohydrateLabel(definition) {
  return parseCarbohydrateDefinition(definition).mode === 'total' ? 'Total carbohydrate' : 'Net carbohydrate';
}

export function carbohydrateDescription(definition) {
  const {mode, excluded} = parseCarbohydrateDefinition(definition);
  return mode === 'total' ? 'Total carbohydrate includes all carbohydrate components.' : excluded.length ? `Net carbohydrate excludes ${excluded.map(id => names[id]).join(', ')}.` : 'Net carbohydrate excludes no components.';
}

export function parseCarbohydrateBasis(record) {
  if (!object(record)) invalid('invalidRecord');
  if (!own(record, 'carbohydrateBasis')) return {};
  const basis = record.carbohydrateBasis;
  if (!object(basis) || Object.keys(basis).length !== 1 || !own(basis, 'reportedNetExcludes')) invalid('invalidBasis');
  const reportedNetExcludes = components(basis.reportedNetExcludes);
  if (!measured(record.nutrients?.reportedNetCarbs)) invalid('missingMeasurement');
  return {carbohydrateBasis: {reportedNetExcludes}};
}

/** Resolve the requested definition from measurements on this one source leaf.
 * Decimal arithmetic uses the exact canonical decimal strings of the Numbers. */
export function carbohydrateLeaf(record, definition) {
  const {excluded} = parseCarbohydrateDefinition(definition);
  const {carbohydrateBasis} = parseCarbohydrateBasis(record);
  const values = record.nutrients ?? {};
  const paths = [], failures = new Set();
  if (measured(values.carbs)) paths.push([values.carbs, []]);
  if (measured(values.availableCarbs)) paths.push([values.availableCarbs, ['fiber']]);
  if (measured(values.reportedNetCarbs)) {
    if (carbohydrateBasis) paths.push([values.reportedNetCarbs, carbohydrateBasis.reportedNetExcludes]);
    else failures.add('unknown-reported-net-method');
  }
  const eligible = [];
  for (const [amount, sourceExcluded] of paths) {
    const required = CARBOHYDRATE_COMPONENTS.filter(id => sourceExcluded.includes(id) !== excluded.includes(id));
    const missing = required.filter(id => !measured(values[id]));
    if (missing.length) { for (const id of missing) failures.add(`missing:${id}`); continue; }
    let result = new Big(amount.toString());
    for (const id of required) result = sourceExcluded.includes(id) ? result.plus(values[id].toString()) : result.minus(values[id].toString());
    eligible.push(result);
  }
  if (!eligible.length) return {value: null, reasons: failures.size ? [...failures] : ['no-carbohydrate-basis']};
  const reasons = [];
  if (eligible.some(value => !value.eq(eligible[0]))) reasons.push('conflicting-carbohydrate-paths');
  if (eligible.some(value => value.lt(0))) reasons.push('negative-derived-value');
  if (eligible.some(value => !Number.isFinite(Number(value.toString())))) reasons.push('nonfinite-derived-value');
  return reasons.length ? {value: null, reasons} : {value: Number(eligible[0].toString()), reasons: []};
}
