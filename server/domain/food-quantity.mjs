import {quantityUnit} from './quantity-units.mjs';
const invalid = (message,code,details={}) => { throw Object.assign(new Error(message), {status:400,foodQuantityCode:code,foodQuantityDetails:details}); };
export const foodQuantityReason=error=>({code:'quantity.'+error.foodQuantityCode,values:error.foodQuantityDetails??{},sourceMessage:error.message});
const positive = value => typeof value === 'number' && Number.isFinite(value) && value > 0;
function signedQuantity(value,label,limit,code){
  if(typeof value!=='number'||!Number.isFinite(value)||Math.abs(value)>limit)invalid(`${label} must be a finite number from -${limit.toLocaleString('en-US')} to ${limit.toLocaleString('en-US')}.`,code,{limit});
  return value===0?0:value;
}
/** A signed multiplier is a correction; the food's measured basis is positive. */
export const parseServingAmount=value=>signedQuantity(value,'Serving amount',100000,'serving-input-range');
export const parseMeasuredQuantity=value=>signedQuantity(value,'Measured quantity',1000000,'measurement-input-range');

/** A recorded volume is independent of mass. Never derive it from a label. */
export function parseVolume(value, label = 'Serving volume', max = 100000) {
  if (value === undefined || value === null) return null;
  if (!positive(value) || value < 0.000001 || value > max) invalid(`${label} must be from 0.000001 to ${max} mL.`,'volume-range',{label,max});
  return value;
}

/** Project validated measured-food source facts without requiring the food to
 * still exist. In particular, replay receipts must not reinterpret a commit. */
export function canonicalFoodQuantityEntry(record) {
  if (!record?.foodId || record.quantity === undefined || record.kind === 'exercise') return record;
  const result = {...record};
  for (const key of ['amount', 'grams', 'milliliters', 'portionLabel']) delete result[key];
  if (result.unit !== 'portion') delete result.portionId;
  return result;
}

/** Resolve the recorded quantity against the current food definition. Cached
 * amount, grams and portion labels in input never select the measurement. */
export function resolveFoodQuantity(food, input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) invalid('Food quantity must be an object.','quantity-object');
  if (input.quantity === undefined) return null;
  const quantity = parseMeasuredQuantity(input.quantity);
  let measure, basis;
  const result = { quantity, unit: input.unit };
  const standard = quantityUnit(input.unit);
  if (standard) { measure = quantity * standard.factor; basis = standard.basis; }
  else if (input.unit === 'portion') {
    const portion = food.portions?.find(item => item.id === input.portionId);
    if (!portion || positive(portion.grams) === positive(portion.milliliters)) invalid('Choose a recorded portion with one measured basis for this food.','portion-basis');
    basis = positive(portion.milliliters) ? 'milliliters' : 'grams';
    measure = quantity * portion[basis];
    result.portionId = portion.id;
    result.portionLabel = portion.label;
  } else invalid('Choose grams, ounces by weight, millilitres, litres or a recorded portion.','unit');
  if (!positive(food?.[basis])) invalid(basis === 'grams' ? 'This food has no known serving weight. Use its serving amount.' : 'This food has no known serving volume. Use its serving amount.',basis==='grams'?'unknown-weight':'unknown-volume');
  const amount = measure / food[basis];
  if (!Number.isFinite(amount) || Math.abs(amount) > 100000) invalid('The selected quantity exceeds the supported serving range.','serving-range');
  const grams = basis === 'grams' ? measure : positive(food.grams) ? amount * food.grams : null;
  const milliliters = basis === 'milliliters' ? measure : positive(food.milliliters) ? amount * food.milliliters : null;
  if (grams !== null && !Number.isFinite(grams) || milliliters !== null && !Number.isFinite(milliliters)) invalid('The selected measurement exceeds the supported range.','measurement-range');
  return { ...result, grams, amount, ...(milliliters !== null ? {milliliters} : {}) };
}
