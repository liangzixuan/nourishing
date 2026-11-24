/**
 * Live USDA FoodData Central Branded Foods lookup and search.
 * Returns normalized food drafts for user review before saving.
 */
const BASE_URL = 'https://api.nal.usda.gov/fdc/v1';
const MAX_BODY_BYTES = 2 * 1024 * 1024;
const TIMEOUT_MS = 15000;
const OWN_ERROR = Symbol('usda-branded-error');
const DATA_QUALITY = 'USDA FoodData Central Branded Foods label data (CC0 1.0). Confirm the package label and serving size before saving. Missing values remain unknown.';

// [USDA nutrient number, Nourishing nutrient id, target unit]
const NUTRIENT_MAP = new Map([
  ['208', ['calories', 'kcal']],
  ['203', ['protein', 'g']],
  ['205', ['carbs', 'g']],
  ['204', ['fat', 'g']],
  ['291', ['fiber', 'g']],
  ['269', ['sugar', 'g']],
  ['539', ['addedSugar', 'g']],
  ['606', ['saturatedFat', 'g']],
  ['645', ['monounsaturatedFat', 'g']],
  ['646', ['polyunsaturatedFat', 'g']],
  ['605', ['transFat', 'g']],
  ['601', ['cholesterol', 'mg']],
  ['307', ['sodium', 'mg']],
  ['301', ['calcium', 'mg']],
  ['303', ['iron', 'mg']],
  ['306', ['potassium', 'mg']],
  ['304', ['magnesium', 'mg']],
  ['305', ['phosphorus', 'mg']],
  ['309', ['zinc', 'mg']],
  ['312', ['copper', 'mg']],
  ['315', ['manganese', 'mg']],
  ['317', ['selenium', 'ug']],
  ['401', ['vitaminC', 'mg']],
  ['328', ['vitaminD', 'ug']],
  ['404', ['thiamin', 'mg']],
  ['405', ['riboflavin', 'mg']],
  ['406', ['niacin', 'mg']],
  ['415', ['vitaminB6', 'mg']],
  ['418', ['vitaminB12', 'ug']],
  ['320', ['vitaminA', 'ug']],
  ['323', ['vitaminE', 'mg']],
  ['430', ['vitaminK', 'ug']],
  ['435', ['folate', 'ug']],
  ['262', ['caffeine', 'mg']],
]);

const MASS_TO_GRAMS = {g: 1, mg: 0.001, ug: 0.000001, mcg: 0.000001, 'µg': 0.000001};
const GRAMS_TO_TARGET = {g: 1, mg: 1000, ug: 1e6};

function providerError(message, status = 502) {
  const error = new Error(message);
  error.status = status;
  error.code = status;
  error.publicMessage = message;
  Object.defineProperty(error, OWN_ERROR, {value: true});
  return error;
}

function cleanNumber(value) {
  return Number(value.toPrecision(12));
}

function normalizeUnit(unit) {
  return typeof unit === 'string' ? unit.trim().toLowerCase().replace('μ', 'µ') : '';
}

function convertAmount(value, rawUnit, targetUnit) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return null;
  const unit = normalizeUnit(rawUnit);
  if (targetUnit === 'kcal') return unit === 'kcal' ? cleanNumber(value) : null;
  const toGrams = MASS_TO_GRAMS[unit];
  const fromGrams = GRAMS_TO_TARGET[targetUnit];
  if (!toGrams || !fromGrams) return null;
  const converted = value * toGrams * fromGrams;
  return Number.isFinite(converted) ? cleanNumber(converted) : null;
}

function normalizeBarcode(raw) {
  if (typeof raw !== 'string') return null;
  const digits = raw.replace(/\D+/g, '');
  return /^\d{8,14}$/.test(digits) ? digits : null;
}

function normalizeServingUnit(raw) {
  const u = normalizeUnit(raw);
  if (u === 'g' || u === 'grm' || u === 'grams') return 'g';
  if (u === 'ml' || u === 'mlt' || u === 'milliliters') return 'ml';
  return null;
}

function formatBrand(product) {
  const parts = [product.brandName, product.brandOwner]
    .map(v => (typeof v === 'string' ? v.trim() : ''))
    .filter(Boolean);
  if (parts.length === 2 && parts[0].toLowerCase() === parts[1].toLowerCase()) return parts[0];
  return parts[0] || '';
}

function formatName(product) {
  const desc = typeof product.description === 'string' ? product.description.trim() : '';
  const brand = formatBrand(product);
  const base = desc || `USDA Branded ${product.fdcId}`;
  if (brand && !base.toLowerCase().includes(brand.toLowerCase())) return `${brand} ${base}`;
  return base;
}

export function parseUsdaBrandedProduct(product) {
  if (!product || typeof product !== 'object' || !Number.isSafeInteger(product.fdcId) || product.fdcId <= 0) {
    throw providerError('USDA FoodData Central returned an invalid product.', 502);
  }
  const servingUnit = normalizeServingUnit(product.servingSizeUnit) ?? 'g';
  const isLiquid = servingUnit === 'ml';
  const nutrients = {};
  for (const row of product.foodNutrients ?? []) {
    const number = String(row?.nutrient?.number ?? row?.nutrientNumber ?? '').trim();
    const mapping = NUTRIENT_MAP.get(number);
    if (!mapping) continue;
    const [id, targetUnit] = mapping;
    const amount = row?.amount ?? row?.value;
    const unit = row?.nutrient?.unitName ?? row?.unitName;
    const converted = convertAmount(amount, unit, targetUnit);
    if (converted !== null && nutrients[id] === undefined) nutrients[id] = converted;
  }
  const barcode = normalizeBarcode(product.gtinUpc);
  const brands = formatBrand(product);
  const portions = [];
  if (typeof product.servingSize === 'number' && Number.isFinite(product.servingSize) && product.servingSize > 0) {
    const label =
      typeof product.householdServingFullText === 'string' && product.householdServingFullText.trim()
        ? product.householdServingFullText.trim()
        : `1 serving (${cleanNumber(product.servingSize)} ${isLiquid ? 'mL' : 'g'})`;
    portions.push(
      isLiquid
        ? {id: 'usda-serving', label, milliliters: cleanNumber(product.servingSize)}
        : {id: 'usda-serving', label, grams: cleanNumber(product.servingSize)},
    );
  }
  const source = {
    name: 'USDA Branded Foods',
    provider: 'usda-branded',
    fdcId: product.fdcId,
    url: `https://fdc.nal.usda.gov/food-details/${product.fdcId}/nutrients`,
    license: 'CC0 1.0',
    ...(brands ? {brands} : {}),
    ...(barcode ? {gtinUpc: barcode} : {}),
  };
  return {
    name: formatName(product),
    serving: isLiquid ? '100 mL' : '100 g',
    grams: isLiquid ? null : 100,
    milliliters: isLiquid ? 100 : null,
    ...(barcode ? {barcode} : {}),
    ...(portions.length ? {portions} : {}),
    nutrients,
    source,
    sample: false,
    dataQuality: DATA_QUALITY,
  };
}

async function readJson(response, controller) {
  const declared = response.headers?.get('content-length');
  if (declared && /^\d+$/.test(declared) && Number(declared) > MAX_BODY_BYTES) {
    controller.abort();
    await response.body?.cancel().catch(() => {});
    throw providerError('USDA FoodData Central response exceeded the 2 MiB limit.');
  }
  const text = await response.text();
  if (Buffer.byteLength(text) > MAX_BODY_BYTES) {
    throw providerError('USDA FoodData Central response exceeded the 2 MiB limit.');
  }
  try {
    return JSON.parse(text);
  } catch {
    throw providerError('USDA FoodData Central returned invalid JSON.');
  }
}

export async function searchUsdaBranded(query, {page = 1, pageSize = 15, apiKey, fetchImpl = fetch} = {}) {
  if (!apiKey) throw providerError('USDA Branded Foods API key is not configured.', 503);
  if (typeof query !== 'string' || query.trim().length < 2 || query.length > 200) {
    throw providerError('Enter a product or brand name from 2 to 200 characters.', 400);
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  timer.unref?.();
  try {
    const response = await fetchImpl(`${BASE_URL}/foods/search`, {
      method: 'POST',
      redirect: 'error',
      signal: controller.signal,
      headers: {Accept: 'application/json', 'Content-Type': 'application/json', 'X-Api-Key': apiKey},
      body: JSON.stringify({
        query: query.trim(),
        dataType: ['Branded'],
        pageNumber: page,
        pageSize,
      }),
    });
    if (!response.ok) {
      await response.body?.cancel().catch(() => {});
      throw providerError(
        response.status === 429
          ? 'USDA FoodData Central search is rate limited. Wait before searching again.'
          : `USDA FoodData Central search returned HTTP ${response.status}.`,
        response.status === 429 ? 429 : 502,
      );
    }
    const data = await readJson(response, controller);
    if (!Array.isArray(data?.foods)) throw providerError('USDA FoodData Central returned an invalid search page.');
    const items = [];
    const seen = new Set();
    for (const food of data.foods) {
      if (!Number.isSafeInteger(food?.fdcId) || food.fdcId <= 0 || seen.has(food.fdcId)) continue;
      seen.add(food.fdcId);
      const barcode = normalizeBarcode(food.gtinUpc);
      items.push({
        fdcId: food.fdcId,
        ...(barcode ? {barcode} : {}),
        name: formatName(food),
        brands: formatBrand(food),
        url: `https://fdc.nal.usda.gov/food-details/${food.fdcId}/nutrients`,
        source: 'USDA Branded Foods',
        provider: 'usda-branded',
      });
    }
    const total = Number.isSafeInteger(data.totalHits) && data.totalHits >= 0 ? data.totalHits : null;
    const totalPages = Number.isSafeInteger(data.totalPages) && data.totalPages >= 0 ? data.totalPages : null;
    return {
      items,
      page,
      pageSize,
      total,
      nextPage: totalPages !== null ? (page < totalPages ? page + 1 : null) : items.length === pageSize ? page + 1 : null,
      source: 'USDA FoodData Central Branded Foods',
      license: 'CC0 1.0',
    };
  } catch (error) {
    if (error?.[OWN_ERROR]) throw error;
    throw providerError(
      controller.signal.aborted
        ? 'USDA FoodData Central search did not finish within 15 seconds.'
        : 'USDA FoodData Central search could not be reached. Try again later.',
    );
  } finally {
    clearTimeout(timer);
  }
}

export async function getUsdaBrandedProduct(fdcId, {apiKey, fetchImpl = fetch} = {}) {
  if (!apiKey) throw providerError('USDA Branded Foods API key is not configured.', 503);
  if (!Number.isSafeInteger(fdcId) || fdcId <= 0) throw providerError('Invalid USDA FDC ID.', 400);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  timer.unref?.();
  try {
    const response = await fetchImpl(`${BASE_URL}/food/${fdcId}`, {
      method: 'GET',
      redirect: 'error',
      signal: controller.signal,
      headers: {Accept: 'application/json', 'X-Api-Key': apiKey},
    });
    if (response.status === 404) {
      await response.body?.cancel().catch(() => {});
      throw Object.assign(providerError('No USDA Branded product was found for this ID.', 400), {
        errorCode: 'barcode.productNotFound',
      });
    }
    if (!response.ok) {
      await response.body?.cancel().catch(() => {});
      throw providerError(
        response.status === 429
          ? 'USDA FoodData Central is rate limited. Wait before trying again.'
          : `USDA FoodData Central returned HTTP ${response.status}.`,
        response.status === 429 ? 429 : 502,
      );
    }
    const data = await readJson(response, controller);
    return parseUsdaBrandedProduct(data);
  } catch (error) {
    if (error?.[OWN_ERROR]) throw error;
    throw providerError(
      controller.signal.aborted
        ? 'USDA FoodData Central did not respond within 15 seconds.'
        : 'USDA FoodData Central could not be reached. Try again later.',
    );
  } finally {
    clearTimeout(timer);
  }
}

export async function lookupUsdaBrandedByBarcode(barcode, {apiKey, fetchImpl = fetch} = {}) {
  const digits = normalizeBarcode(barcode);
  if (!digits || !apiKey) return null;
  const stripped = digits.replace(/^0+/, '');
  const result = await searchUsdaBranded(digits, {page: 1, pageSize: 10, apiKey, fetchImpl});
  const match = result.items.find(item => item.barcode && item.barcode.replace(/^0+/, '') === stripped);
  if (!match) return null;
  const draft = await getUsdaBrandedProduct(match.fdcId, {apiKey, fetchImpl});
  return {...draft, barcode: digits};
}
