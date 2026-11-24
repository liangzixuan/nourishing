import test from 'node:test';
import assert from 'node:assert/strict';
import {initialState} from '../server/domain/workspace.mjs';
import {entryFacts} from '../server/domain/nutrition.mjs';
import {parseUsdaBrandedProduct} from '../server/domain/usda-branded.mjs';
import {lookupBarcode, applyBarcodeLog, previewBarcode, searchBranded} from '../server/barcode.mjs';

const context = {
  owner: 'fixture-owner',
  reviewSecret: 'fixture-signing-secret-at-least-32-bytes',
  now: 1700000000000,
  usdaApiKey: 'test-usda-key',
};

const usdaBar = {
  fdcId: 2345678,
  description: 'DARK CHOCOLATE ALMOND PROTEIN BAR',
  brandName: 'KIND',
  brandOwner: 'Kind LLC',
  gtinUpc: '602652170003',
  servingSize: 40,
  servingSizeUnit: 'g',
  householdServingFullText: '1 bar (40 g)',
  foodNutrients: [
    {nutrient: {number: '208', unitName: 'kcal'}, amount: 500},
    {nutrient: {number: '203', unitName: 'g'}, amount: 30},
    {nutrient: {number: '205', unitName: 'g'}, amount: 42.5},
    {nutrient: {number: '204', unitName: 'g'}, amount: 25},
    {nutrient: {number: '291', unitName: 'g'}, amount: 12.5},
    {nutrient: {number: '307', unitName: 'mg'}, amount: 350},
    {nutrient: {number: '328', unitName: 'µg'}, amount: 5},
  ],
};

test('parseUsdaBrandedProduct normalizes nutrients, portions and liquid basis', () => {
  const solid = parseUsdaBrandedProduct(usdaBar);
  assert.equal(solid.name, 'KIND DARK CHOCOLATE ALMOND PROTEIN BAR');
  assert.equal(solid.serving, '100 g');
  assert.equal(solid.grams, 100);
  assert.equal(solid.milliliters, null);
  assert.equal(solid.barcode, '602652170003');
  assert.equal(solid.nutrients.calories, 500);
  assert.equal(solid.nutrients.protein, 30);
  assert.equal(solid.nutrients.sodium, 350);
  assert.equal(solid.nutrients.vitaminD, 5);
  assert.deepEqual(solid.portions, [{id: 'usda-serving', label: '1 bar (40 g)', grams: 40}]);
  assert.equal(solid.source.provider, 'usda-branded');

  const liquid = parseUsdaBrandedProduct({
    fdcId: 999001,
    description: 'OAT MILK',
    brandName: 'Oatly',
    servingSize: 240,
    servingSizeUnit: 'MLT',
    foodNutrients: [{nutrientNumber: '208', unitName: 'KCAL', value: 50}],
  });
  assert.equal(liquid.serving, '100 mL');
  assert.equal(liquid.grams, null);
  assert.equal(liquid.milliliters, 100);
  assert.deepEqual(liquid.portions, [{id: 'usda-serving', label: '1 serving (240 mL)', milliliters: 240}]);
});

test('lookupBarcode supports fdcId directly and falls back to USDA Branded on Open Food Facts 404', async () => {
  const state = initialState();
  const fetchImpl = async url => {
    const s = String(url);
    if (s.includes('world.openfoodfacts.org/api/v3.6/product/')) return Response.json({}, {status: 404});
    if (s.includes('/fdc/v1/foods/search')) return Response.json({foods: [usdaBar], totalHits: 1, totalPages: 1});
    if (s.includes('/fdc/v1/food/2345678')) return Response.json(usdaBar);
    throw Error('Unexpected URL: ' + s);
  };

  // Barcode fallback: OFF 404 -> USDA Branded match by GTIN/UPC
  const fallbackReview = await lookupBarcode(state, {code: '0602652170003'}, {...context, fetchImpl});
  assert.equal(fallbackReview.resource.source.provider, 'usda-branded');
  assert.equal(fallbackReview.resource.barcode, '0602652170003');

  // Direct fdcId lookup + preview + atomic log using named portion
  const directReview = await lookupBarcode(state, {fdcId: 2345678}, {...context, fetchImpl});
  assert.equal(directReview.resource.source.fdcId, 2345678);
  const entryPayload = {
    reviewToken: directReview.reviewToken,
    date: '2026-11-24',
    time: '12:00',
    group: 'Lunch',
    quantity: 1,
    unit: 'portion',
    portionId: 'usda-serving',
  };
  const preview = previewBarcode(state, entryPayload, context);
  assert.equal(preview.nutrition.totals.calories, 200);
  applyBarcodeLog(state, entryPayload, context);
  assert.equal(state.entries.length, 1);
  assert.equal(entryFacts(state, state.entries[0]).nutrients.calories, 200);
});

test('searchBranded merges USDA Branded and Open Food Facts, deduplicates barcodes and survives single-provider failure', async () => {
  const merged = await searchBranded(
    {q: 'kind bar', page: 1, lang: 'fr'},
    {
      usdaApiKey: 'test-usda-key',
      fetchImpl: async (url, init) => {
        const s = String(url);
        if (s.includes('/fdc/v1/foods/search')) {
          return Response.json({foods: [usdaBar], totalHits: 1, totalPages: 1});
        }
        if (s.includes('search.openfoodfacts.org/search')) {
          const body = JSON.parse(init.body);
          assert.deepEqual(body.langs, ['fr', 'en']);
          return Response.json({
            hits: [
              {code: '0602652170003', product_name: 'Duplicate Kind Bar', brands: 'KIND'},
              {code: '0099988877766', product_name: 'Another Branded Bar', brands: 'Other'},
            ],
            count: 2,
            page_count: 1,
          });
        }
        throw Error('Unexpected URL: ' + s);
      },
    },
  );
  assert.equal(merged.items.length, 2);
  assert.equal(merged.items[0].provider, 'usda-branded');
  assert.equal(merged.items[0].fdcId, 2345678);
  assert.equal(merged.items[1].provider, 'open-food-facts');
  assert.equal(merged.items[1].barcode, '0099988877766');

  // If Open Food Facts is rate-limited (429), USDA Branded results still return cleanly
  const partial = await searchBranded(
    {q: 'kind bar', page: 1},
    {
      usdaApiKey: 'test-usda-key',
      fetchImpl: async url => {
        if (String(url).includes('/fdc/v1/foods/search')) return Response.json({foods: [usdaBar], totalHits: 1, totalPages: 1});
        return Response.json({}, {status: 429});
      },
    },
  );
  assert.equal(partial.items.length, 1);
  assert.equal(partial.items[0].provider, 'usda-branded');
});
