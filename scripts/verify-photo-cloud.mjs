// Live Appwrite boundary check. Uses disposable accounts and a synthetic photo; no Gemini calls.
import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {createHash, randomBytes, randomUUID} from 'node:crypto';
import {Client, ID, Query, Storage, TablesDB} from 'node-appwrite';
import sharp from 'sharp';
import {operator, allRows, databaseId} from './operator.mjs';
import {createWorkspaceStore} from '../server/workspace-store.mjs';
import {createDataRepository} from '../server/data-repository.mjs';
import {digest, rowId} from '../server/data-codec.mjs';
import {normalizePhoto, validateStoredPhoto} from '../server/domain/photo-images.mjs';
import {entryFacts} from '../server/domain/nutrition.mjs';
import {signPhotoReview} from '../server/cloud-photo.mjs';
import {stagePhotoMedia} from '../server/photo-storage.mjs';

const {users, db, storage, config} = operator(), owner = ID.unique(), other = ID.unique();
const ids = [owner, other], report = {at: new Date().toISOString(), checks: [], providerCalls: 0}, cleanupFailures = [];
const args = (tableId, id) => ({databaseId, tableId, rowId: id});
const png = await sharp({create: {width: 24, height: 20, channels: 3, background: '#92a883'}}).png().toBuffer();
const normalized = await normalizePhoto('data:image/png;base64,' + png.toString('base64'));
const photo = await validateStoredPhoto({id: normalized.id, dataUrl: normalized.dataUrl});
const fileId = rowId(owner, 'meal_photos', photo.id), reviewSecret = randomBytes(32).toString('base64url'), reviewAt = Date.now();
// Only fixture identities are retained for recovery; no session or signing secrets.
const ownedPath = new URL('../.local/photo-cloud-fixture.json', import.meta.url), reportPath = new URL('../.local/photo-cloud-verification.json', import.meta.url);
writeFileSync(ownedPath, JSON.stringify({accounts: ids, fileIds: [fileId], createdAt: report.at}));
const denied = operation => assert.rejects(operation, error => [401, 403, 404].includes(error.code));
const context = {owner, reviewSecret, photo, now: reviewAt, stageMedia: async ({generation, transactionId}) => stagePhotoMedia({db, storage, owner, generation, transactionId, photo})};
try {
  const clients = [];
  for (const userId of ids) {
    await users.create({userId, email: `photo-${userId}@example.com`, password: randomUUID() + 'Aa1!', name: 'Photo cloud verification fixture'});
    const session = await users.createSession({userId});
    clients.push(new Client().setEndpoint(config.endpoint).setProject(config.projectId).setSession(session.secret));
  }
  const userDb = new TablesDB(clients[0]), otherDb = new TablesDB(clients[1]), userStorage = new Storage(clients[0]), otherStorage = new Storage(clients[1]);
  const store = createWorkspaceStore(db, owner), repository = createDataRepository(userDb, owner), readCatalog = async () => null;
  await store.create();let state = await repository.readState();
  assert.equal(state.entries.length, 0);assert.equal(state.foods.length, 0);
  await store.command({requestId: randomUUID(), revision: digest(state), type: 'food.save', payload: {name: 'Synthetic photo fixture food', grams: 100, serving: '100 g', nutrients: {calories: 200, protein: 10}}}, readCatalog);
  state = await repository.readState();const foodId = state.foods[0].id;
  const analysis = {observations: [{description: 'Fixture food', preparation: 'cooked', uncertainty: 'Synthetic test image.', portionEstimate: {grams: 75, lowerGrams: 50, upperGrams: 100, reason: 'Fixture estimate.'}}], possibleAdditions: [], notes: ''};
  const reviewToken = signPhotoReview({owner, photoId: photo.id, analysis}, {secret: reviewSecret, now: reviewAt});
  const command = {requestId: randomUUID(), revision: digest(state), type: 'photo.log', payload: {photoId: photo.id, reviewToken, date: '2026-11-14', time: '12:00', group: 'Lunch', rows: [{foodId, observationIndex: 0, quantity: 50, unit: 'g'}]}};
  const saved = await store.command(command, readCatalog, context);
  state = await repository.readState();assert.equal(state.entries.length, 1);assert.deepEqual(saved.entryIds, [state.entries[0].id]);assert.equal(saved.photoId, photo.id);
  assert.equal(entryFacts(state, state.entries[0]).nutrients.calories, 100);assert.equal(state.entries[0].photo.portionEstimate.grams, 75);
  const file = await repository.media('meal_photos', photo.id);assert.equal(file, fileId);
  const bytes = Buffer.from(await userStorage.getFileView({bucketId: 'private-media', fileId}));
  assert.equal(createHash('sha256').update(bytes).digest('hex'), photo.id);
  const metadata = await userStorage.getFile({bucketId: 'private-media', fileId});assert.deepEqual(metadata.$permissions, [`read("user:${owner}")`]);
  const head = await userDb.getRow(args('workspace_heads', owner)), mediaId = rowId(owner, head.generation, 'meal_photos', photo.id);
  const media = await userDb.getRow(args('workspace_media', mediaId));assert.equal(media.ownerId, owner);assert.equal(media.bytes, photo.bytes.length);assert.deepEqual(media.$permissions, metadata.$permissions);
  await denied(() => otherStorage.getFileView({bucketId: 'private-media', fileId}));
  await denied(() => otherDb.getRow(args('workspace_media', mediaId)));
  await denied(() => otherDb.getRow(args('workspace_heads', owner)));
  report.checks.push('atomic photo and diary commit', 'original nutrition and signed estimates', 'owner private media read', 'second account denied');

  // Receipt replay must return the committed IDs even after the signed review expires.
  assert.deepEqual(await store.command(command, readCatalog, {...context, now: reviewAt + 1800001, stageMedia: async () => {throw Error('Receipt replay must not restage media');}}), saved);
  assert.equal((await repository.readState()).entries.length, 1);
  await assert.rejects(() => store.command({...command, requestId: randomUUID()}, readCatalog, context), error => error.code === 409);
  const revision = digest(await repository.readState()), invalid = {...command, requestId: randomUUID(), revision, payload: {...command.payload, reviewToken: command.payload.reviewToken.slice(0, -1)}};
  await assert.rejects(() => store.command(invalid, readCatalog, context), error => error.code === 409);
  assert.equal(digest(await repository.readState()), revision);
  const forgedOwner = {...command, requestId: randomUUID(), revision, payload: {...command.payload, reviewToken: signPhotoReview({owner: other, photoId: photo.id, analysis}, {secret: reviewSecret, now: reviewAt})}};
  await assert.rejects(() => store.command(forgedOwner, readCatalog, context), error => error.code === 409);
  assert.equal(digest(await repository.readState()), revision);
  report.checks.push('expired review receipt replay has no duplicate', 'stale revision conflict', 'invalid and cross-account reviews leave no changes');
} finally {
  const clean = async (label, operation) => {try {await operation();} catch (error) {if (error.code !== 404) cleanupFailures.push({resource: label, code: error.code ?? 'unknown'});}};
  for (const userId of ids) {
    for (const tableId of ['command_receipts', 'workspace_media', 'workspace_records']) {
      let rows = [];await clean(`${tableId}:${userId}:list`, async () => {rows = await allRows(db, tableId, [Query.equal('ownerId', userId)]);});
      for (const row of rows) {
        assert.equal(row.ownerId, userId);
        await clean(`${tableId}:${row.$id}`, () => db.deleteRow(args(tableId, row.$id)));
      }
    }
    await clean(`workspace_heads:${userId}`, () => db.deleteRow(args('workspace_heads', userId)));
    await clean(`profiles:${userId}`, () => db.deleteRow(args('profiles', userId)));
    await clean(`users:${userId}`, () => users.delete({userId}));
  }
  await clean(`private-media:${fileId}`, () => storage.deleteFile({bucketId: 'private-media', fileId}));
  report.fixtureRemoved = cleanupFailures.length === 0;
  writeFileSync(ownedPath, JSON.stringify({accounts: ids, fileIds: [fileId], removed: report.fixtureRemoved, cleanupFailures}));
  writeFileSync(reportPath, JSON.stringify({...report, status: 'verification-incomplete'}, null, 2));
  if (cleanupFailures.length) throw Error('Photo fixture cleanup is incomplete. See .local/photo-cloud-fixture.json.');
}
report.status = 'passed';writeFileSync(reportPath, JSON.stringify(report, null, 2));console.log(JSON.stringify(report));
