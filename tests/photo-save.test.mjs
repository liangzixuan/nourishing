import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {initialState, act} from '../server/domain/workspace.mjs';
import {normalizePhoto} from '../server/domain/photo-images.mjs';
import {entryFacts} from '../server/domain/nutrition.mjs';
import {signPhotoReview} from '../server/cloud-photo.mjs';
import {applyPhotoLog, validatePhotoAction} from '../server/photo-commands.mjs';
import {stagePhotoMedia} from '../server/photo-storage.mjs';

const owner = 'fixture-owner', secret = 'fixture-signing-secret-at-least-32-characters', now = 1700000000000;
const photo = await normalizePhoto('data:image/png;base64,' + (await sharp({create: {width: 12, height: 10, channels: 3, background: '#aaaaaa'}}).png().toBuffer()).toString('base64'));
const estimate = {grams: 120, lowerGrams: 80, upperGrams: 180, reason: 'Depth is unclear.'};
const analysis = {observations: [{description: 'Rice', preparation: 'cooked', uncertainty: 'Variety unclear.', portionEstimate: estimate}], possibleAdditions: [{description: 'Oil', preparation: '', uncertainty: 'May have been used.'}], notes: ''};
const token = signPhotoReview({owner, photoId: photo.id, analysis}, {secret, now});
const context = {owner, reviewSecret: secret, photo, now};
const fixture = () => {const state = initialState();state.foods.push({id: 'food', name: 'Fixture cooked rice', grams: 100, serving: '100 g', nutrients: {calories: 200, protein: 5}});return state;};
const payload = rows => ({photoId: photo.id, reviewToken: token, date: '2026-11-14', time: '12:00', group: 'Lunch', rows: rows ?? [{foodId: 'food', quantity: 50, unit: 'g', observationIndex: 0}]});

test('photo save uses original food quantities and signed evidence without generated nutrition', () => {
  const state = fixture(), saved = applyPhotoLog(state, payload(), context), entry = state.entries[0];
  assert.deepEqual(saved.entryIds, [entry.id]);assert.equal(saved.photoId, photo.id);
  assert.equal(entryFacts(state, entry).nutrients.calories, 100);assert.equal(entryFacts(state, entry).nutrients.fat, null);
  assert.deepEqual(entry.photo.portionEstimate, estimate);assert.equal(entry.quantity, 50);
  assert.equal(entry.photo.description, 'Rice');assert.equal(entry.photo.provider, 'Google Gemini');assert.deepEqual(entry.photo.analysis, analysis);
  assert.equal(entry.nutrients, undefined);assert.equal(entry.photo.reviewToken, undefined);
  applyPhotoLog(state, payload([{foodId: 'food', amount: 1, additionIndex: 0}, {foodId: 'food', amount: 1}]), context);
  assert.equal(state.entries[1].photo.description, 'Oil');assert.equal(state.entries[1].photo.portionEstimate, undefined);
  assert.equal(state.entries[2].photo.provider, 'Manual review');
});

test('invalid quantities, observations, owners and completed days leave the entire batch unchanged', () => {
  for (const bad of [{quantity: 0}, {quantity: 1, unit: 'bogus'}, {observationIndex: 20}, {additionIndex: 8, observationIndex: undefined}, {foodId: 'missing'}]) {
    const state = fixture(), before = structuredClone(state), rows = [...payload().rows, {...payload().rows[0], ...bad}];
    assert.throws(() => applyPhotoLog(state, payload(rows), context));assert.deepEqual(state, before);
  }
  for (const changed of [{owner: 'other'}, {now: now + 1800000}, {photo: {...photo, id: 'b'.repeat(64)}}]) assert.throws(() => applyPhotoLog(fixture(), payload(), {...context, ...changed}));
  const state = fixture();act(state, 'day.complete', {date: '2026-11-14', completed: true});
  const before = structuredClone(state);assert.throws(() => applyPhotoLog(state, payload(), context));assert.deepEqual(state, before);
});

test('client metadata and unsupported photo row fields are rejected', () => {
  for (const injected of [{nutrients: {calories: 900}}, {photo: {}}, {portionEstimate: estimate}, {observationIndex: 0, additionIndex: 0}, {amount: 1}, {quantity: -1}]) {
    assert.throws(() => validatePhotoAction({type: 'photo.log', payload: payload([{...payload().rows[0], ...injected}])}), {code: 400});
  }
  assert.throws(() => validatePhotoAction({type: 'photo.log', payload: payload(Array(31).fill(payload().rows[0]))}), {code: 400});
});

function storageFixture() {
  const files = new Map(), rows = new Map(), staged = [];let creates = 0;
  const storage = {
    async getFile({fileId}) {if (!files.has(fileId)) throw {code: 404};return files.get(fileId).metadata;},
    async createFile({fileId, file, permissions}) {creates++;if (files.has(fileId)) throw {code: 409};const metadata = {$id: fileId, name: file.filename, sizeOriginal: photo.bytes.length, $permissions: permissions};files.set(fileId, {metadata, bytes: photo.bytes});return metadata;},
    async getFileView({fileId}) {return files.get(fileId).bytes;}
  };
  const db = {async getRow({rowId}) {if (!rows.has(rowId)) throw {code: 404};return rows.get(rowId);}, async createRow(input) {staged.push(input);rows.set(input.rowId, {...input.data, $permissions: input.permissions});}};
  return {files, rows, staged, db, storage, creates: () => creates};
}

test('private photo storage reuses an orphan after rollback and stages owner-scoped metadata', async () => {
  const fake = storageFixture(), input = {db: fake.db, storage: fake.storage, owner, generation: 'generation', transactionId: 'tx1', photo};
  const first = await stagePhotoMedia(input);assert.equal(fake.creates(), 1);assert.equal(fake.staged[0].transactionId, 'tx1');
  assert.deepEqual(fake.staged[0].permissions, ['read("user:fixture-owner")']);assert.equal(fake.staged[0].data.digest, photo.id);
  fake.rows.clear(); // Database rollback leaves Storage intact.
  const second = await stagePhotoMedia({...input, transactionId: 'tx2'});assert.deepEqual(second, first);assert.equal(fake.creates(), 1);
  await stagePhotoMedia({...input, transactionId: 'tx3'});assert.equal(fake.staged.length, 2);
  const other = await stagePhotoMedia({...input, owner: 'other'});assert.notEqual(other.fileId, first.fileId);assert.equal(fake.creates(), 2);
});

test('storage rejects changed bytes, dimensions, ACL, or existing metadata', async () => {
  const fake = storageFixture(), input = {db: fake.db, storage: fake.storage, owner, generation: 'generation', transactionId: 'tx', photo};
  for (const changed of [{bytes: Buffer.from('invalid')}, {width: 1601}, {mime: 'image/png'}, {bytes: Buffer.alloc(3 * 1024 * 1024 + 1)}]) await assert.rejects(() => stagePhotoMedia({...input, photo: {...photo, ...changed}}), {code: 400});
  assert.equal(fake.creates(), 0);
  const result = await stagePhotoMedia(input), file = fake.files.get(result.fileId), row = fake.rows.get(result.mediaId);
  file.metadata.$permissions.push('read("any")');await assert.rejects(() => stagePhotoMedia(input), {code: 409});file.metadata.$permissions.pop();
  file.bytes = Buffer.from('changed');await assert.rejects(() => stagePhotoMedia(input), {code: 409});file.bytes = photo.bytes;
  row.ownerId = 'other';await assert.rejects(() => stagePhotoMedia(input), {code: 409});
});

test('a concurrent upload is reused only after checking its owner and content', async () => {
  const fake = storageFixture(), create = fake.storage.createFile;
  fake.storage.createFile = async args => {await create(args);throw {code: 409};};
  const result = await stagePhotoMedia({db: fake.db, storage: fake.storage, owner, generation: 'generation', transactionId: 'tx', photo});
  assert.equal(fake.creates(), 1);assert.ok(fake.rows.has(result.mediaId));
});
