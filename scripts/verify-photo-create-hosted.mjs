// Hosted UI + real Appwrite saves. Only image analysis is replaced with signed synthetic evidence.
// Run after deployment with a short-lived fixture operator key. No Gemini request is made.
import assert from 'node:assert/strict';
import {readFileSync, writeFileSync} from 'node:fs';
import {createHash, randomUUID} from 'node:crypto';
import {chromium} from 'playwright-core';
import {ID, Query} from 'node-appwrite';
import sharp from 'sharp';
import {fixtureOperator} from './fixture-operator.mjs';
import {allRows, databaseId} from './operator.mjs';
import {normalizePhoto} from '../server/domain/photo-images.mjs';
import {signPhotoReview} from '../server/cloud-photo.mjs';
import {rowId} from '../server/data-codec.mjs';

const origin = 'https://nourishing.app', {users, db, storage} = fixtureOperator();
const id = ID.unique(), otherId = ID.unique(), accounts = [id, otherId], created = [];
const owner = JSON.parse(readFileSync('.local/migration-destination.json', 'utf8')).accountId;
const before = await db.getRow({databaseId, tableId: 'workspace_heads', rowId: owner});
const secret = readFileSync('.local/photo-review-secret.txt', 'utf8').replace(/^\uFEFF/, '').trim();
const png = await sharp({create: {width: 48, height: 40, channels: 3, background: '#87a873'}}).png().toBuffer();
const normalized = await normalizePhoto('data:image/png;base64,' + png.toString('base64'));
const photo = {id: normalized.id, dataUrl: normalized.dataUrl, width: normalized.width, height: normalized.height};
const estimate = {grams: 120, lowerGrams: 80, upperGrams: 180, reason: 'Synthetic fixture estimate.'};
const analysis = {observations: [{description: 'Fixture rice', preparation: 'cooked', uncertainty: 'Synthetic image.', portionEstimate: estimate}], possibleAdditions: [], notes: ''};
const reviewToken = signPhotoReview({owner: id, photoId: photo.id, analysis}, {secret});
const report = {at: new Date().toISOString(), checks: [], providerCalls: 0, fixtureRemoved: false};
const reportPath = '.local/photo-create-hosted-result.json', fileIds = new Set([rowId(id, 'meal_photos', photo.id)]), cleanupFailures = [];
let browser, page;
try {
  browser = await chromium.launch({executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true});
  const context = await browser.newContext({viewport: {width: 412, height: 915}, isMobile: true, hasTouch: true});context.setDefaultTimeout(60000);
  const other = await browser.newContext();
  const post = async (ctx, path, data, expected = 200) => {const res = await ctx.request.post(origin + path, {headers: {Origin: origin}, data});assert.equal(res.status(), expected, path);return res.json();};
  for (const [userId, ctx] of [[id, context], [otherId, other]]) {
    const email = `photo-create-${userId}@example.com`, password = randomUUID() + 'Aa1!';
    await users.create({userId, email, password, name: 'Photo Create hosted fixture'});created.push(userId);
    await post(ctx, '/api/auth/login', {email, password});
  }
  const day = new Date().toLocaleDateString('en-CA');
  const diary = async () => {const response = await context.request.get(origin + '/api/diary?date=' + day);assert.equal(response.status(), 200);return response.json();};
  const first = await diary(), food = await post(context, '/api/workspace/command', {requestId: randomUUID(), revision: first.revision, type: 'food.save', payload: {name: 'Photo Create Rice', serving: '100 g', grams: 100, nutrients: {calories: 200, protein: 5}}});
  const candidate = {ref: {kind: 'library', id: food.item.id}, name: 'Photo Create Rice', grams: 100, serving: '100 g'};
  page = await context.newPage();const errors = [], packets = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {window.cspErrors = [];document.addEventListener('securitypolicyviolation', event => window.cspErrors.push(event.violatedDirective));});
  await page.route('**/api/photos/analyze', route => route.fulfill({status: 200, contentType: 'application/json', body: JSON.stringify({provider: 'Google Gemini', photo, reviewToken, ...analysis, suggestions: [{kind: 'observation', observationIndex: 0, ...analysis.observations[0], candidates: [candidate], selection: candidate.ref}]})}));
  let lost = false;
  await page.route('**/api/photos/save', async route => {
    const input = route.request().postDataJSON();packets.push(input);
    if (!lost) {lost = true;const response = await route.fetch();assert.equal(response.status(), 200);return route.fulfill({status: 503, contentType: 'application/json', body: JSON.stringify({error: 'Fixture lost save response'})});}
    return route.continue();
  });
  await page.goto(origin + '/diary');await page.locator('#page[aria-busy=false] .md-diary').waitFor();
  const open = async () => {
    await page.locator('#add-food').click();await page.getByRole('button', {name: 'Photo Log', exact: true}).click();
    await page.locator('[data-photo-gallery]').setInputFiles({name: 'synthetic.png', mimeType: 'image/png', buffer: png});await page.locator('.photo-food-main strong').waitFor();
    await page.locator('[data-quantity]').click();await page.getByLabel('Amount', {exact: true}).fill('50');await page.getByRole('button', {name: 'Done', exact: true}).click();
    await page.locator('[data-create]').click();await page.getByRole('dialog', {name: 'Create', exact: true}).waitFor();
  };
  await open();await page.getByLabel('Meal name', {exact: true}).fill('Photo Create Meal');await page.screenshot({path: '.local/photo-create-hosted.png'});
  await page.getByRole('button', {name: 'Create Meal', exact: true}).click();await page.getByRole('dialog', {name: 'Create', exact: true}).getByText('Fixture lost save response', {exact: true}).waitFor();
  assert.equal((await diary()).entries.length, 0);
  await page.getByRole('button', {name: 'Create Meal', exact: true}).click();await page.locator('#sheet').waitFor({state: 'hidden'});assert.deepEqual(packets[0], packets[1]);
  await open();await page.getByLabel('Save to', {exact: true}).selectOption('recipe');await page.getByLabel('Recipe name', {exact: true}).fill('Photo Create Recipe');await page.getByLabel('Servings', {exact: true}).fill('2');
  await page.getByRole('button', {name: 'Create Recipe', exact: true}).click();await page.locator('#sheet').waitFor({state: 'hidden'});
  assert.equal((await diary()).entries.length, 0);assert.equal(packets.length, 3);
  const find = async name => {const response = await context.request.get(origin + '/api/food-search?' + new URLSearchParams({q: name, category: 'custom'}));assert.equal(response.status(), 200);return (await response.json()).items.filter(row => row.name === name);};
  const meals = await find('Photo Create Meal'), recipes = await find('Photo Create Recipe');assert.equal(meals.length, 1);assert.equal(recipes.length, 1);
  for (const [kind, row, expected] of [['meal', meals[0], 100], ['recipe', recipes[0], 50]]) {
    const response = await context.request.get(origin + '/api/library/item?' + new URLSearchParams({kind, id: row.id}));assert.equal(response.status(), 200);const item = await response.json();
    assert.equal(item.resource.photoReview.rows[0].quantity, 50);assert.deepEqual(item.resource.photoReview.rows[0].portionEstimate, estimate);
    const preview = await post(context, '/api/diary/preview', {[kind + 'Id']: row.id, amount: 1, date: day, group: 'Lunch', time: '12:00'});
    assert.equal(preview.nutrition.totals.calories, expected);assert.equal(preview.nutrition.totals.fat, null);
  }
  report.checks.push('hosted Create Meal and Create Recipe UI save canonical 50 g amounts', 'recipe yield and unknown nutrients retained', 'lost response retries same request without duplicate', 'library destinations add no diary entries', 'signed photo evidence retained');
  const mediaPath = '/api/media?' + new URLSearchParams({namespace: 'meal_photos', id: photo.id});
  const media = await context.request.get(origin + mediaPath);assert.equal(media.status(), 200);assert.equal(createHash('sha256').update(await media.body()).digest('hex'), photo.id);
  assert.ok([403, 404].includes((await other.request.get(origin + mediaPath)).status()));
  const mediaRows = await allRows(db, 'workspace_media', [Query.equal('ownerId', id)]);assert.equal(mediaRows.length, 1);
  for (const row of mediaRows) {fileIds.add(row.fileId);const file = await storage.getFile({bucketId: 'private-media', fileId: row.fileId});assert.deepEqual(file.$permissions, [`read("user:${id}")`]);}
  report.checks.push('library-only photo reads for owner', 'other account cannot read photo', 'Storage photo ACL is owner-only');
  const after = await db.getRow({databaseId, tableId: 'workspace_heads', rowId: owner});assert.equal(after.digest, before.digest);assert.equal(after.$updatedAt, before.$updatedAt);
  assert.deepEqual(errors, []);assert.deepEqual(await page.evaluate(() => window.cspErrors), []);assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  report.checks.push('real owner workspace unchanged', 'no browser or CSP errors and no horizontal overflow');report.status = 'passed';
} catch (error) {
  await page?.screenshot({path: '.local/photo-create-hosted-failure.png'}).catch(() => {});throw error;
} finally {
  await browser?.close();
  const clean = async (resource, work) => {try {await work();} catch (error) {if (error.code !== 404) cleanupFailures.push({resource, code: error.code ?? 'unknown'});}};
  for (const userId of created) {
    for (const tableId of ['command_receipts', 'workspace_media', 'workspace_records']) {
      let rows = [];await clean(`${tableId}:${userId}:list`, async () => {rows = await allRows(db, tableId, [Query.equal('ownerId', userId)]);});
      for (const row of rows) {assert.equal(row.ownerId, userId);if (tableId === 'workspace_media') fileIds.add(row.fileId);await clean(`${tableId}:${row.$id}`, () => db.deleteRow({databaseId, tableId, rowId: row.$id}));}
    }
    for (const tableId of ['workspace_heads', 'profiles']) await clean(`${tableId}:${userId}`, () => db.deleteRow({databaseId, tableId, rowId: userId}));
    await clean(`account:${userId}`, () => users.delete({userId}));
  }
  for (const fileId of fileIds) await clean(`file:${fileId}`, () => storage.deleteFile({bucketId: 'private-media', fileId}));
  report.fixtureRemoved = cleanupFailures.length === 0;
  writeFileSync(reportPath, JSON.stringify({...report, accounts, cleanupFailures, status: report.status ?? 'verification-incomplete'}, null, 2));
  if (cleanupFailures.length) throw Error('Photo Create fixture cleanup is incomplete. See ' + reportPath);
}
console.log(JSON.stringify(report));
