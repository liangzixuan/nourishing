import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {createCloudPhotoAnalyzer, signPhotoReview, verifyPhotoReview} from '../server/cloud-photo.mjs';

const secret = 'fixture-secret-at-least-thirty-two-characters', owner = 'fixture-owner', photoId = 'a'.repeat(64), now = 1700000000000;
const estimate = {grams: 120, lowerGrams: 80, upperGrams: 180, reason: 'Depth is unclear.'};
const analysis = {observations: [{description: 'White rice', preparation: 'cooked', uncertainty: 'Variety is unclear.', portionEstimate: estimate}], possibleAdditions: [], notes: ''};
const raw = {foods: [{name: 'White rice', preparation: 'cooked', uncertainty: 'Variety is unclear.', portionEstimate: estimate}], possibleAdditions: [], notes: ''};
const image = async () => 'data:image/png;base64,' + (await sharp({create: {width: 24, height: 20, channels: 3, background: '#aaaaaa'}}).png().toBuffer()).toString('base64');

test('photo review is authenticated, owner-bound, photo-bound and expiring', () => {
  const token = signPhotoReview({owner, photoId, analysis}, {secret, now});
  assert.deepEqual(verifyPhotoReview(token, {owner, photoId, secret, now: now + 1000}), analysis);
  for (const options of [{owner: 'other'}, {photoId: 'b'.repeat(64)}, {secret: secret + 'other'}, {now: now + 30 * 60 * 1000}]) assert.throws(() => verifyPhotoReview(token, {owner, photoId, secret, now, ...options}), {code: 409});
  const [payload, signature] = token.split('.'), parsed = JSON.parse(Buffer.from(payload, 'base64url'));parsed.analysis.observations[0].portionEstimate.grams = 170;
  assert.throws(() => verifyPhotoReview(Buffer.from(JSON.stringify(parsed)).toString('base64url') + '.' + signature, {owner, photoId, secret, now}), {code: 409});
  assert.throws(() => signPhotoReview({owner, photoId, analysis: null}, {secret, now}), {code: 502});
});

test('recognition normalizes images, disables storage/retries, and ranks original source matches', async () => {
  let captured, requests = 0;
  const analyzer = createCloudPhotoAnalyzer({apiKey: 'fixture-key', reviewSecret: secret, now: () => now, clientFactory: async () => ({interactions: {create: async (input, options) => {captured = {input, options}; return {status: 'completed', output_text: JSON.stringify(raw), usage: {total_input_tokens: 5, total_output_tokens: 20}};}}})});
  const result = await analyzer.analyze({image: await image()}, {owner, search: async () => {requests++;return {items: [{id: 'raw', name: 'White rice, raw', grams: 100, serving: '100 g'}, {id: 'cooked', name: 'White rice, cooked', grams: 100, serving: '100 g'}]};}});
  assert.equal(captured.input.store, false);assert.equal(captured.options.retries.strategy, 'none');assert.equal(captured.input.generation_config.thinking_level, 'minimal');
  assert.equal(captured.input.input[0].content[1].mime_type, 'image/jpeg');assert.match(result.photo.dataUrl, /^data:image\/jpeg;base64,/);assert.equal(result.photo.width, 24);
  assert.equal(result.suggestions[0].selection.id, 'cooked');assert.deepEqual(result.observations[0].portionEstimate, estimate);assert.ok(requests > 0 && requests <= 4);
  assert.deepEqual(verifyPhotoReview(result.reviewToken, {owner, photoId: result.photo.id, secret, now}), analysis);
  assert.equal(result.metrics.inputTokens, 5);assert.ok(!JSON.stringify(result).includes('fixture-key'));
});

test('invalid images and model nutrition inventions do not become review data', async () => {
  let called = false;
  const clientFactory = async () => ({interactions: {create: async () => {called = true;return {status: 'completed', output_text: JSON.stringify({...raw, calories: 200})};}}});
  const analyzer = createCloudPhotoAnalyzer({apiKey: 'fixture-key', reviewSecret: secret, clientFactory});
  await assert.rejects(() => analyzer.analyze({image: 'data:image/png;base64,YQ=='}, {owner, search: async () => ({items: []})}), {code: 400});assert.equal(called, false);
  await assert.rejects(() => analyzer.analyze({image: awaitImage}, {owner, search: async () => ({items: []})}), {code: 502});
});
const awaitImage = await image();

test('quota and cancellation errors are concise and do not disclose provider details', async () => {
  const analyzer = createCloudPhotoAnalyzer({apiKey: 'fixture-key', reviewSecret: secret, clientFactory: async () => ({interactions: {create: async () => {throw {statusCode: 429, message: 'provider-secret-detail'};}}})});
  await assert.rejects(() => analyzer.analyze({image: awaitImage}, {owner, search: async () => ({items: []})}), error => error.code === 429 && !error.message.includes('provider-secret-detail'));
  const abort = new AbortController();abort.abort();await assert.rejects(() => analyzer.analyze({image: awaitImage}, {owner, search: async () => ({items: []}), signal: abort.signal}), {code: 499});
});
