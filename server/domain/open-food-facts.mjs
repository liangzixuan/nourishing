/**
 * Caller-triggered, read-only product lookup. Open Food Facts community data
 * requires package-label review. This module returns a draft and never saves it.
 *
 * Contract and normalized units:
 * https://github.com/openfoodfacts/openfoodfacts-server/blob/main/docs/api/ref/schemas/product_nutrition_v3.yaml
 * The aggregated set normalizes quantities to 100 g or 100 mL. Declared
 * units, source qualifiers and preparation remain explicit.
 */
const ENDPOINT = 'https://world.openfoodfacts.org/api/v3.6/product/';
const MAX_BODY_BYTES = 2 * 1024 * 1024;
const MAX_SOURCE_BYTES = 32 * 1024;
const TIMEOUT_MS = 15000;
const FIELDS = 'code,product_name,brands,nutrition,nutrition_data_per,product_quantity_unit,serving_size';
const OWN_ERROR=Symbol('open-food-facts-error');
const USER_AGENT = 'NourishLocal/0.1.0 (local nutrition workspace; https://github.com/morluto/rea)';
const DATA_QUALITY = 'Community-contributed Open Food Facts data. Check the package label and confirm whether these values are per 100 g or 100 mL before saving. Missing values remain unknown.';

// Explicit semantic mappings only. Ambiguous vitamin A/folate equivalences,
// water mass to volume, alcohol percentage to mass, and score fields are omitted.
const MAPPINGS = [
  ['energy-kcal', 'calories', 1], ['proteins', 'protein', 1],
  ['carbohydrates-total', 'carbs', 1], ['carbohydrates', 'availableCarbs', 1],
  ['psicose', 'allulose', 1], ['fructose', 'fructose', 1],
  ['fat', 'fat', 1], ['fiber', 'fiber', 1], ['sugars', 'sugar', 1],
  ['added-sugars', 'addedSugar', 1], ['polyols', 'sugarAlcohol', 1],
  ['starch', 'starch', 1], ['saturated-fat', 'saturatedFat', 1],
  ['monounsaturated-fat', 'monounsaturatedFat', 1],
  ['polyunsaturated-fat', 'polyunsaturatedFat', 1], ['trans-fat', 'transFat', 1],
  ['omega-3-fat', 'omega3', 1], ['omega-6-fat', 'omega6', 1],
  ['cholesterol', 'cholesterol', 1000], ['sodium', 'sodium', 1000],
  ['calcium', 'calcium', 1000], ['iron', 'iron', 1000],
  ['potassium', 'potassium', 1000], ['magnesium', 'magnesium', 1000],
  ['phosphorus', 'phosphorus', 1000], ['zinc', 'zinc', 1000],
  ['copper', 'copper', 1000], ['manganese', 'manganese', 1000],
  ['selenium', 'selenium', 1e6], ['iodine', 'iodine', 1e6],
  ['chromium', 'chromium', 1e6], ['molybdenum', 'molybdenum', 1e6],
  ['vitamin-c', 'vitaminC', 1000], ['vitamin-d', 'vitaminD', 1e6],
  ['vitamin-b1', 'thiamin', 1000], ['vitamin-b2', 'riboflavin', 1000],
  ['vitamin-b6', 'vitaminB6', 1000], ['vitamin-b12', 'vitaminB12', 1e6],
  ['caffeine', 'caffeine', 1000], ['theobromine', 'theobromine', 1000],
];
const CARBOHYDRATE_FIELDS = new Set([
  'carbohydrates-total', 'carbohydrates', 'fiber', 'soluble-fiber', 'insoluble-fiber',
  'sugars', 'added-sugars', 'polyols', 'starch', 'psicose', 'fructose',
  'glucose', 'sucrose', 'lactose', 'maltose', 'galactose',
  'erythritol', 'xylitol', 'sorbitol', 'mannitol', 'maltitol', 'isomalt', 'lactitol',
]);
const MASS_FACTORS = {g:1, mg:.001, ug:.000001, mcg:.000001, 'µg':.000001};

function providerError(message, status = 502) {
  const error = new Error(message);
  error.status = status;
  Object.defineProperty(error,OWN_ERROR,{value:true});
  return error;
}

function missingBarcodeProduct() {
  return Object.assign(providerError('No product was found for this barcode. Check the digits or enter the food label manually.', 400), {errorCode:'barcode.productNotFound'});
}

function validateBarcode(barcode) {
  if (typeof barcode !== 'string' || !/^\d{8,14}$/.test(barcode)) {
    throw providerError('Enter a barcode containing 8 to 14 digits, including any leading zeros.', 400);
  }
  return barcode;
}

function record(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function measurement(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function cleanNumber(value) {
  return Number(value.toPrecision(12));
}

function convertedMeasurement(item, source, multiplier, basis) {
  if (!['100g', '100ml'].includes(basis)) return {reason:'unknown-quantity-basis'};
  if (!record(item)) return {reason:'invalid-measurement-object'};
  if (!measurement(item.value)) return {reason:'invalid-or-missing-value'};
  if (Object.hasOwn(item, 'modifier') && item.modifier !== undefined && item.modifier !== '=') return {reason:'qualified-or-invalid-modifier'};
  if (item.source === 'estimate') return {reason:'estimated-measurement'};
  const unit = typeof item.unit === 'string' ? item.unit.toLowerCase().replace('μ', 'µ') : '';
  const factor = source === 'energy-kcal' ? (unit === 'kcal' ? 1 : null) : (Object.hasOwn(MASS_FACTORS, unit) ? MASS_FACTORS[unit] : null);
  if (factor === null) return {reason:'unsupported-unit'};
  const converted = item.value * factor * multiplier;
  if (!Number.isFinite(converted)) return {reason:'conversion-overflow'};
  const value = cleanNumber(converted);
  if (!Number.isFinite(value)) return {reason:'conversion-overflow'};
  return {value};
}

function retainedInputSets(measurements, inputSets) {
  const sets = {}, issues = {};
  for (const [key, item] of Object.entries(measurements)) {
    if (!record(item) || !Object.hasOwn(item, 'source_index')) continue;
    const index = item.source_index;
    if (!Number.isSafeInteger(index) || index < 0) issues[key] = 'invalid-source-index';
    else if (!Array.isArray(inputSets) || !Object.hasOwn(inputSets, index)) issues[key] = 'referenced-input-set-missing';
    else {
      sets[index] = structuredClone(inputSets[index]);
      if (!record(inputSets[index])) issues[key] = 'invalid-referenced-input-set';
    }
  }
  return {inputSets:sets, inputSetIssues:issues};
}

/** Pure conversion of one API product object. Retrieval time belongs to I/O. */
export function parseOpenFoodFactsProduct(product, barcode) {
  validateBarcode(barcode);
  if (!record(product)) throw providerError('Open Food Facts returned an invalid product. Try again or enter the food label manually.');
  if (product.code !== undefined && product.code !== barcode) throw providerError('Open Food Facts returned a different barcode. Check the code and enter the label manually if needed.');
  if(product.nutrition!==undefined&&!record(product.nutrition))throw providerError('Open Food Facts returned invalid nutrition data. Enter the label manually.');
  const aggregate=product.nutrition?.aggregated_set;
  if(aggregate!==undefined&&!record(aggregate))throw providerError('Open Food Facts returned invalid aggregated nutrition.');
  if(aggregate?.nutrients!==undefined&&!record(aggregate.nutrients))throw providerError('Open Food Facts returned invalid nutrient data. Enter the label manually.');
  const nutriments=aggregate?.nutrients??{},basis=aggregate?.per;
  const nutrients = {};
  const convertedFields = new Set();
  const measurements = {}, measurementIssues = {};
  for (const [source, target, multiplier] of MAPPINGS) {
    if (!Object.hasOwn(nutriments, source)) continue;
    const item=nutriments[source];
    const result = convertedMeasurement(item, source, multiplier, basis);
    if (CARBOHYDRATE_FIELDS.has(source) || result.reason === undefined) measurements[source] = structuredClone(item);
    if (result.reason !== undefined) {
      if (CARBOHYDRATE_FIELDS.has(source)) measurementIssues[source] = result.reason;
      continue;
    }
    nutrients[target]=result.value;convertedFields.add(source);
  }
  for (const key of CARBOHYDRATE_FIELDS) {
    if (Object.hasOwn(nutriments, key) && !Object.hasOwn(measurements, key)) {
      measurements[key] = structuredClone(nutriments[key]);
      measurementIssues[key] = 'nutrient-not-mapped-to-local-catalog';
    }
  }
  const originalBasis = {};
  for (const key of ['nutrition_data_per', 'product_quantity_unit', 'serving_size']) {
    if (Object.hasOwn(product, key)) originalBasis[key] = product[key];
  }
  if(aggregate){originalBasis.aggregatePer=aggregate.per??null;originalBasis.preparation=aggregate.preparation??null;}
  const source = {
    name: 'Open Food Facts', url: `https://world.openfoodfacts.org/product/${barcode}`,
    license: 'ODbL', retrievedAt: null, originalBasis,
    apiVersion:'3.6',unmappedNutrients:Object.keys(nutriments).filter(key=>!convertedFields.has(key)).sort(),
    measurements, measurementIssues, ...retainedInputSets(measurements, product.nutrition?.input_sets),
  };
  if (typeof product.brands === 'string') source.brands = product.brands;
  if (Buffer.byteLength(JSON.stringify(source)) > MAX_SOURCE_BYTES) throw providerError('Open Food Facts source details exceed the 32 KiB food provenance limit. Enter the label manually. No source facts were truncated.');
  return {
    name:(typeof product.product_name==='string'&&product.product_name.trim()?product.product_name.trim():`Product ${barcode}`)+(aggregate?.preparation==='prepared'?' (prepared)':''),
    serving:basis==='100g'?'100 g':basis==='100ml'?'100 mL':'Unknown label basis (review required)',grams:basis==='100g'?100:null,milliliters:basis==='100ml'?100:null,
    barcode, nutrients, source, sample: false, dataQuality: DATA_QUALITY,
  };
}

/** Explicit full-text search; hits contain identity only. Selected labels are fetched afresh. */
export async function searchOpenFoodFacts(query,{page=1,pageSize=20,fetchImpl=fetch}={}){
  if(typeof query!=='string'||query.trim().length<2||query.length>200)throw providerError('Enter a product or brand name from 2 to 200 characters.',400);
  if(!Number.isSafeInteger(page)||page<1||!Number.isInteger(pageSize)||pageSize<1||pageSize>25)throw providerError('Use a positive search page and page size from 1 to 25.',400);
  const words=query.match(/[\p{L}\p{N}]+/gu)||[];if(!words.length)throw providerError('Enter words from a product or brand name.',400);
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),TIMEOUT_MS);timer.unref?.();
  try{
    const response=await fetchImpl('https://search.openfoodfacts.org/search',{method:'POST',redirect:'error',signal:controller.signal,headers:{'User-Agent':USER_AGENT,Accept:'application/json','Content-Type':'application/json'},body:JSON.stringify({q:words.join(' '),page,page_size:pageSize,fields:['code','product_name','brands'],langs:['en']})});
    if(!response.ok){await response.body?.cancel().catch(()=>{});throw providerError(response.status===429?'Open Food Facts search is rate limited. Wait before searching again.':`Open Food Facts search returned HTTP ${response.status}. Try again later.`);}
    const data=await readBoundedJson(response,controller);if(!Array.isArray(data.hits)||data.hits.length>pageSize||data.timed_out===true)throw providerError('Open Food Facts returned an incomplete or invalid search page. Try again later.');
    const items=[];let omitted=0;const identities=new Set();
    for(const hit of data.hits){
      if(!record(hit)||typeof hit.code!=='string'||!/^\d{8,14}$/.test(hit.code)||typeof hit.product_name!=='string'||!hit.product_name.trim()||hit.product_name.length>500||identities.has(hit.code)){omitted++;continue;}
      identities.add(hit.code);const brands=Array.isArray(hit.brands)?hit.brands.filter(x=>typeof x==='string').join(', '):typeof hit.brands==='string'?hit.brands:'';
      if(brands.length>500){omitted++;continue;}
      items.push({barcode:hit.code,name:hit.product_name,brands,url:`https://world.openfoodfacts.org/product/${hit.code}`,source:'Open Food Facts'});
    }
    const total=Number.isSafeInteger(data.count)&&data.count>=0?data.count:null;
    const pageCount=Number.isSafeInteger(data.page_count)&&data.page_count>=0?data.page_count:null;
    return {items,page,pageSize,total,isCountExact:data.is_count_exact===true,nextPage:pageCount!==null?(page<pageCount?page+1:null):data.hits.length===pageSize?page+1:null,omitted,source:'Open Food Facts Search-a-licious',license:'ODbL',noteCode:'review-current-label',note:'Search names are suggestions. Open the current product and check the package label before saving.'};
  }catch(error){if(error?.[OWN_ERROR])throw error;throw providerError(controller.signal.aborted?'Open Food Facts search did not finish within 15 seconds.':'Open Food Facts search could not be reached. Try again later.');}
  finally{clearTimeout(timer);}
}

/** Per-app request bounds follow provider limits; explicit search only, with a short LRU cache. */
export function createBrandedFoodService({fetchImpl=fetch,now=()=>Date.now()}={}){
  const cache=new Map(),pending=new Map(),searchTimes=[],productTimes=[];
  const request=async(kind,key,load)=>{
    const current=now(),saved=cache.get(key);
    if(saved&&current-saved.at<300000&&current>=saved.at){cache.delete(key);cache.set(key,saved);return structuredClone(saved.value);}
    if(pending.has(key))return structuredClone(await pending.get(key));
    const times=kind==='search'?searchTimes:productTimes,limit=kind==='search'?10:15;
    while(times.length&&current-times[0]>=60000)times.shift();
    if(times.length>=limit)throw providerError(`Wait before another Open Food Facts ${kind} request. This app follows the provider's per-minute limit.`,429);
    times.push(current);
    const work=(async()=>{const value=await load();cache.set(key,{at:now(),value:structuredClone(value)});while(cache.size>30)cache.delete(cache.keys().next().value);return value;})();pending.set(key,work);
    try{return structuredClone(await work);}finally{pending.delete(key);}
  };
  return {search:(query,options={})=>request('search',JSON.stringify(['search',query,options.page??1,options.pageSize??20]),()=>searchOpenFoodFacts(query,{...options,fetchImpl})),get:barcode=>request('product',`product:${barcode}`,()=>getBarcodeProduct(barcode,{fetchImpl}))};
}

async function readBoundedJson(response, controller) {
  const declaredLength = response.headers?.get('content-length');
  if (declaredLength && /^\d+$/.test(declaredLength) && Number(declaredLength) > MAX_BODY_BYTES) {
    controller.abort();
    await response.body?.cancel().catch(() => {});
    throw providerError('Open Food Facts returned more than 2 MiB. Enter the food label manually.');
  }
  if (!response.body?.getReader) throw providerError('Open Food Facts returned an empty response. Try again or enter the label manually.');
  const reader = response.body.getReader();
  const chunks = [];
  let length = 0;
  try {
    while (true) {
      const {done, value} = await reader.read();
      if (done) break;
      if (!(value instanceof Uint8Array)) throw providerError('Open Food Facts returned an unreadable response.');
      if (value.byteLength > MAX_BODY_BYTES - length) {
        controller.abort();
        await reader.cancel().catch(() => {});
        throw providerError('Open Food Facts returned more than 2 MiB. Enter the food label manually.');
      }
      chunks.push(Buffer.from(value));
      length += value.byteLength;
    }
  } finally {
    reader.releaseLock();
  }
  let document;
  try {
    document = JSON.parse(new TextDecoder('utf-8', {fatal: true}).decode(Buffer.concat(chunks, length)));
  } catch {
    throw providerError('Open Food Facts returned invalid JSON. Try again or enter the label manually.');
  }
  if (!record(document)) throw providerError('Open Food Facts returned an invalid response.');
  return document;
}

export async function getBarcodeProduct(barcode, {fetchImpl = fetch} = {}) {
  validateBarcode(barcode);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  timer.unref?.();
  try {
    const url = new URL(`${ENDPOINT}${barcode}.json`);
    url.searchParams.set('fields', FIELDS);
    const response = await fetchImpl(url, {
      method: 'GET', redirect: 'error', signal: controller.signal,
      headers: {'User-Agent': USER_AGENT, Accept: 'application/json'},
    });
    if (!response.ok) {
      await response.body?.cancel().catch(() => {});
      if (response.status === 404) throw missingBarcodeProduct();
      throw providerError(response.status === 429 ? 'Open Food Facts is rate limiting requests. Wait before trying again, or enter the label manually.' : `Open Food Facts returned HTTP ${response.status}. Try again later or enter the label manually.`);
    }
    const document = await readBoundedJson(response, controller);
    if(document.status===0||(!document.product&&document.result?.id==='product_not_found'))throw missingBarcodeProduct();
    const draft = parseOpenFoodFactsProduct(document.product, barcode);
    draft.source.retrievedAt = new Date().toISOString();
    return draft;
  } catch (error) {
    if(error?.[OWN_ERROR])throw error;
    if(controller.signal.aborted||error?.name==='AbortError'||error?.name==='TimeoutError')throw providerError('Open Food Facts did not respond within 15 seconds. Try again later or enter the food label manually.');
    throw providerError('Open Food Facts could not be reached. Check the network connection or enter the food label manually.');
  } finally {
    clearTimeout(timer);
  }
}
