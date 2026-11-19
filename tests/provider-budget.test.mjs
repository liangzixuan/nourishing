import test from 'node:test';
import assert from 'node:assert/strict';
import {takeBrandedBudget, takePhotoAnalyzeBudget, takeRecipeImportBudget} from '../server/provider-budget.mjs';

function createMemoryDb() {
  const rows = new Map();
  return {
    rows,
    async createRow({rowId, data}) {
      if (rows.has(rowId)) throw Object.assign(Error('Conflict'), {code: 409});
      const row = {$id: rowId, ...data};
      rows.set(rowId, row);
      return row;
    },
    async incrementRowColumn({rowId, column, value}) {
      const row = rows.get(rowId);
      row[column] += value;
      return row;
    },
    async listRows() {
      return {rows: []};
    },
    async deleteRow({rowId}) {
      rows.delete(rowId);
    },
  };
}

test('takePhotoAnalyzeBudget enforces per-owner 10-call limit per 10-minute window', async () => {
  const db = createMemoryDb();
  const now = Date.parse('2026-11-19T12:00:00Z');
  for (let i = 0; i < 10; i++) {
    await takePhotoAnalyzeBudget(db, {database: 'nourishing', owner: 'user-a', now});
  }
  await assert.rejects(
    () => takePhotoAnalyzeBudget(db, {database: 'nourishing', owner: 'user-a', now}),
    error => error.code === 429 && /photo scans/.test(error.publicMessage),
  );
  // Another user still has their own budget in the same window
  await takePhotoAnalyzeBudget(db, {database: 'nourishing', owner: 'user-b', now});
});

test('takeRecipeImportBudget enforces per-owner 10-call limit and takeBrandedBudget keeps existing limits', async () => {
  const db = createMemoryDb();
  const now = Date.parse('2026-11-19T12:00:00Z');
  for (let i = 0; i < 10; i++) {
    await takeRecipeImportBudget(db, {database: 'nourishing', owner: 'user-a', now});
  }
  await assert.rejects(
    () => takeRecipeImportBudget(db, {database: 'nourishing', owner: 'user-a', now}),
    error => error.code === 429 && /recipe imports/.test(error.publicMessage),
  );
  for (let i = 0; i < 10; i++) {
    await takeBrandedBudget(db, {database: 'nourishing', owner: 'user-a', operation: 'search', now});
  }
  await assert.rejects(
    () => takeBrandedBudget(db, {database: 'nourishing', owner: 'user-a', operation: 'search', now}),
    error => error.code === 429 && /food lookups/.test(error.publicMessage),
  );
});
