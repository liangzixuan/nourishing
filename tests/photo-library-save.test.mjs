import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import sharp from 'sharp';
import {initialState, act} from '../server/domain/workspace.mjs';
import {normalizePhoto} from '../server/domain/photo-images.mjs';
import {mealPhotoIds} from '../server/domain/photo-records.mjs';
import {mealNutrients, recipeNutrients} from '../server/domain/nutrition.mjs';
import {signPhotoReview} from '../server/cloud-photo.mjs';
import {applyPhotoLog, validatePhotoAction} from '../server/photo-commands.mjs';
import {stagePhotoMedia} from '../server/photo-storage.mjs';
import {createWorkspaceStore} from '../server/workspace-store.mjs';
import {digest} from '../server/data-codec.mjs';
import {diaryStoreFixture} from './fixtures/diary-store.mjs';

const owner = 'photo-library-fixture', secret = 'fixture-photo-signing-key-at-least-32-characters', now = 1700000000000;
const photo = await normalizePhoto('data:image/png;base64,' + (await sharp({create: {width: 16, height: 16, channels: 3, background: '#88aa66'}}).png().toBuffer()).toString('base64'));
const estimate = {grams: 120, lowerGrams: 80, upperGrams: 180, reason: 'Fixture estimate.'};
const analysis = {observations: [{description: 'Rice', preparation: 'cooked', uncertainty: '', portionEstimate: estimate}], possibleAdditions: [{description: 'Oil', preparation: '', uncertainty: 'May be present.'}], notes: ''};
const token = signPhotoReview({owner, photoId: photo.id, analysis}, {secret, now});
const context = {owner, reviewSecret: secret, photo, now, asOf: '2026-11-14T12:00:00.000Z', timeZone: 'UTC'};
const fixture = () => {const state = initialState();state.foods.push({id: 'food', name: 'Rice fixture', grams: 100, serving: '100 g', nutrients: {calories: 200, protein: 5}});return state;};
const payload = (destination, rows = [{foodId: 'food', quantity: 50, unit: 'g', observationIndex: 0}]) => ({photoId: photo.id, reviewToken: token, date: '2026-11-14', time: '12:00', group: 'Lunch', rows, destination});

test('photo Create saves canonical meal and recipe amounts, evidence and unknown nutrients without diary entries', () => {
  for (const destination of [{kind: 'meal', name: 'My meal'}, {kind: 'recipe', name: 'My recipe', servings: 2}]) {
    const state = fixture();act(state, 'day.complete', {date: '2026-11-14', completed: true});
    const saved = applyPhotoLog(state, payload(destination, [...payload().rows, {foodId: 'food', amount: 1, additionIndex: 0}, {foodId: 'food', amount: 0.5}]), context);
    const item = state[destination.kind + 's'][0], rows = item.ingredients ?? item.items;
    assert.equal(saved.kind, destination.kind);assert.equal(saved.id, item.id);assert.equal(saved.entryIds, undefined);assert.equal(saved.photoId, photo.id);
    assert.equal(state.entries.length, 0);assert.equal(state.loggingStreaks, undefined);
    assert.deepEqual(rows, [{foodId: 'food', quantity: 50, unit: 'g'}, {foodId: 'food', amount: 1}, {foodId: 'food', amount: 0.5}]);
    const nutrition = destination.kind === 'meal' ? mealNutrients(state, item) : recipeNutrients(state, item);
    assert.equal(nutrition.calories, destination.kind === 'meal' ? 400 : 200);assert.equal(nutrition.fat, null);
    assert.deepEqual(item.photoReview.photo.analysis, analysis);assert.equal(item.photoReview.photo.description, destination.name);
    assert.equal(item.photoReview.modifiedAfterReview, false);assert.deepEqual(item.photoReview.rows.map(row => row.description), ['Rice', 'Oil', 'Rice fixture']);
    assert.deepEqual(item.photoReview.rows[0].portionEstimate, estimate);assert.equal(item.photoReview.rows[0].quantity, 50);
    assert.deepEqual(item.photoReview.rows[0].selection, {kind: 'library', id: 'food'});assert.equal(item.photoReview.rows[1].unit, 'servings');
    assert.deepEqual(mealPhotoIds(state), [photo.id]);assert.equal(JSON.stringify(item).includes('reviewToken'), false);
  }
});

test('photo library destination and row failures leave the complete workspace unchanged', () => {
  for (const destination of [null, {kind: 'meal'}, {kind: 'meal', name: ''}, {kind: 'meal', name: 'Meal', id: 'overwrite'}, {kind: 'recipe', name: 'Recipe', servings: 0}, {kind: 'recipe', name: 'Recipe', servings: Infinity}, {kind: 'recipe', name: 'Recipe', servings: 2, nutrients: {calories: 1}}]) {
    assert.throws(() => validatePhotoAction({type: 'photo.log', payload: payload(destination)}), {code: 400});
  }
  const destination = {kind: 'recipe', name: 'Recipe', servings: 2};
  for (const change of [{rows: [...payload().rows, {foodId: 'food', quantity: 1, unit: 'invalid'}]}, {rows: [{foodId: 'food', amount: 1, observationIndex: 99}]}, {rows: [{foodId: 'missing', amount: 1}]}, {date: 'bad'}, {group: 'missing'}, {time: '25:00'}]) {
    const state = fixture(), before = structuredClone(state);assert.throws(() => applyPhotoLog(state, {...payload(destination), ...change}, context));assert.deepEqual(state, before);
  }
  for (const change of [{owner: 'other'}, {now: now + 1800000}, {photo: {...photo, id: 'b'.repeat(64)}}]) {
    const state = fixture(), before = structuredClone(state);assert.throws(() => applyPhotoLog(state, payload(destination), {...context, ...change}));assert.deepEqual(state, before);
  }
});

function privateStorage() {
  const files = new Map();let uploads = 0;
  return {files, uploads: () => uploads, storage: {
    async getFile({fileId}) {if (!files.has(fileId)) throw {code: 404};return files.get(fileId).metadata;},
    async createFile({fileId, file, permissions}) {uploads++;const bytes = Buffer.from(file.source.data), metadata = {$id: fileId, name: file.filename, sizeOriginal: bytes.length, $permissions: permissions};files.set(fileId, {bytes, metadata});return metadata;},
    async getFileView({fileId}) {return files.get(fileId).bytes;}
  }};
}

test('photo library command atomically stores catalog provenance and private media, recovers failed commit and lost reply exactly once', async () => {
  const state = fixture(), db = diaryStoreFixture(state, owner), blob = privateStorage(), store = createWorkspaceStore(db.db, owner);
  const catalog = {id: 'usda:fixture:7', name: 'Catalog beans', serving: '100 g', grams: 100, nutrients: {calories: 110, protein: 5}, readOnly: true, sample: false, source: {name: 'USDA fixture', datasetId: 'fixture', fdcId: 7, archiveSha256: 'a'.repeat(64), normalizerSha256: 'b'.repeat(64)}};
  const input = {requestId: randomUUID(), revision: digest(state), type: 'photo.log', payload: payload({kind: 'recipe', name: 'Photo recipe', servings: 2}, [{foodId: catalog.id, quantity: 50, unit: 'g', observationIndex: 0}])};
  const ctx = {...context, stageMedia: tx => stagePhotoMedia({...tx, db: db.db, storage: blob.storage, owner, photo})};
  db.fail();await assert.rejects(store.command(input, async id => id === catalog.id ? catalog : null, ctx), /Fixture commit failed/);
  assert.deepEqual(db.state(), state);assert.equal(db.table('workspace_media').size, 0);assert.equal(db.table('command_receipts').size, 0);assert.equal(blob.uploads(), 1);
  db.lose();const result = await store.command(input, async id => id === catalog.id ? catalog : null, ctx), saved = db.state(), recipe = saved.recipes[0];
  assert.deepEqual(result.item, {kind: 'recipe', id: recipe.id});assert.equal(result.entryIds, undefined);assert.equal(saved.entries.length, 0);assert.equal(saved.loggingStreaks?.events?.length ?? 0, 0);
  assert.deepEqual(recipe.photoReview.rows[0].selection, {kind: 'catalog', id: catalog.id});
  const food = saved.foods.find(row => row.id === recipe.ingredients[0].foodId);assert.deepEqual(food.source, catalog.source);assert.equal(recipeNutrients(saved, recipe).calories, 27.5);
  assert.equal(blob.uploads(), 1);assert.equal(db.table('workspace_media').size, 1);assert.equal(db.table('command_receipts').size, 1);
  assert.deepEqual([...blob.files.values()][0].metadata.$permissions, [`read("user:${owner}")`]);
  assert.deepEqual(await store.command(input, async () => {throw Error('No replay catalog read');}, {...ctx, now: now + 1800001, stageMedia: () => {throw Error('No replay upload');}}), result);
  assert.equal(db.state().recipes.length, 1);
  await assert.rejects(store.command({...input, requestId: randomUUID()}, async () => catalog, ctx), {code: 409});
  await assert.rejects(store.command({...input, payload: {...input.payload, destination: {kind: 'meal', name: 'Changed'}}}, async () => catalog, ctx), {code: 409});
  const other = diaryStoreFixture(state, 'other'), otherStore = createWorkspaceStore(other.db, 'other');
  await assert.rejects(otherStore.command({...input, requestId: randomUUID()}, async () => catalog, {...ctx, owner: 'other', stageMedia: () => {throw Error('Unauthorized media write');}}), {code: 409});assert.deepEqual(other.state(), state);
});
