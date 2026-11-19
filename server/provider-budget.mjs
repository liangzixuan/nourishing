import {Query} from 'node-appwrite';
import {rowId} from './data-codec.mjs';

/** Atomic shared budgets survive parallel requests and server restarts. No user data is retained. */
export async function takeProviderBudget(
  db,
  {
    database,
    owner,
    provider,
    operation,
    ownerLimit,
    globalLimit = ownerLimit,
    windowMs = 60_000,
    message = 'Too many requests. Try again shortly.',
    now = Date.now(),
  },
) {
  if (!owner || !provider || !operation) throw Error('Provider budget identity required.');
  const bucket = Math.floor(now / windowMs);
  const base = {databaseId: database, tableId: 'login_limits'};
  const scopes = [
    ['owner:' + owner, ownerLimit],
    ['provider', globalLimit],
  ];
  for (const [scope, limit] of scopes) {
    const args = {...base, rowId: rowId(provider, operation, scope, bucket)};
    let row;
    try {
      row = await db.createRow({
        ...args,
        data: {attempts: 1, expiresAt: new Date((bucket + 2) * windowMs).toISOString()},
        permissions: [],
      });
    } catch (error) {
      if (error.code !== 409) throw error;
      row = await db.incrementRowColumn({...args, column: 'attempts', value: 1});
    }
    if (row.attempts > limit) {
      throw Object.assign(Error(message), {code: 429, publicMessage: message});
    }
  }
  const expired = await db.listRows({
    ...base,
    queries: [Query.lessThan('expiresAt', new Date(now).toISOString()), Query.limit(25)],
  });
  for (const row of expired.rows) {
    try {
      await db.deleteRow({...base, rowId: row.$id});
    } catch (error) {
      if (error.code !== 404) throw error;
    }
  }
}

export async function takeBrandedBudget(db, {database, owner, operation, now = Date.now()}) {
  if (!owner || !['product', 'search'].includes(operation)) throw Error('Provider budget identity required.');
  const limit = operation === 'search' ? 10 : 15;
  return takeProviderBudget(db, {
    database,
    owner,
    provider: 'open-food-facts',
    operation,
    ownerLimit: limit,
    globalLimit: limit,
    windowMs: 60_000,
    message: 'Too many food lookups. Try again in a minute.',
    now,
  });
}

export async function takePhotoAnalyzeBudget(db, {database, owner, now = Date.now()}) {
  return takeProviderBudget(db, {
    database,
    owner,
    provider: 'gemini-photo',
    operation: 'analyze',
    ownerLimit: 10,
    globalLimit: 60,
    windowMs: 10 * 60_000,
    message: 'Too many photo scans. Try again in a few minutes.',
    now,
  });
}

export async function takeRecipeImportBudget(db, {database, owner, now = Date.now()}) {
  return takeProviderBudget(db, {
    database,
    owner,
    provider: 'recipe-import',
    operation: 'fetch',
    ownerLimit: 10,
    globalLimit: 60,
    windowMs: 10 * 60_000,
    message: 'Too many recipe imports. Try again in a few minutes.',
    now,
  });
}
