import test from 'node:test';
import assert from 'node:assert/strict';
import {createInsightCatalog} from '../server/food-insights.mjs';

test('clientSearchIndex uses metadata.datasets priority order, includes catalog IDs and schema 2', () => {
  const foods = [
    {
      id: 'cnf:cnf-2015:5001',
      name: 'Crème fraîche',
      serving: '100 g',
      grams: 100,
      nutrients: {calories: 300},
      source: {provider: 'cnf', datasetId: 'cnf-2015', dataset: 'CNF 2015', foodCode: 5001, cnfFoodId: 10},
    },
    {
      id: 'usda:usda-sr-legacy:171705',
      name: 'Chicken, broilers or fryers, breast, meat only, raw',
      serving: '100 g',
      grams: 100,
      nutrients: {calories: 120},
      source: {provider: 'usda', datasetId: 'usda-sr-legacy', dataset: 'USDA SR Legacy', fdcId: 171705},
    },
  ];
  const catalog = createInsightCatalog(foods, {
    metadata: {
      generation: 'gen-1',
      datasets: [
        {id: 'cnf-2015', name: 'CNF 2015', foodCount: 1},
        {id: 'usda-sr-legacy', name: 'USDA SR Legacy', foodCount: 1},
      ],
    },
  });
  try {
    const idx = catalog.clientSearchIndex();
    assert.equal(idx.version, 1);
    assert.equal(idx.schema, 2);
    const cnfRow = idx.rows.find(r => r[0] === 'cnf:cnf-2015:5001');
    const usdaRow = idx.rows.find(r => r[0] === 'usda:usda-sr-legacy:171705');
    // Priority follows metadata.datasets order: cnf-2015 is 0, usda-sr-legacy is 1
    assert.equal(cnfRow[5], 0);
    assert.equal(usdaRow[5], 1);
    // Numeric catalog IDs are included in aliases for ID search
    assert.ok(cnfRow[6].includes('5001'));
    assert.ok(usdaRow[6].includes('171705'));
  } finally {
    catalog.disposeSearch();
  }
});
