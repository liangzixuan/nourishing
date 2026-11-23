import {reviewCanBeSaved,signedReviewLifetimeMs} from './domain/signed-review-time.mjs';
import {createHmac, timingSafeEqual} from 'node:crypto';
import {normalizePhoto, prepareVisionImage} from './domain/photo-images.mjs';
import {photoAnalysis} from './domain/photo-records.mjs';
import {MEAL_PHOTO_SCHEMA, MEAL_PHOTO_PROMPT, mealResult} from './domain/meal-photo-contract.mjs';
import {parseIngredientLine} from './domain/recipe-ingredients.mjs';
import {preparationFacts, mergePreparationFacts} from './domain/ingredient-preparation.mjs';
import {matchIngredient} from './domain/recipe-matching.mjs';

export const CLOUD_PHOTO_MODEL = 'gemini-3.5-flash-lite';
const PROVIDER = 'Google Gemini';
// Includes the contract's maximum text sizes even when JSON escapes each code unit.
const MAX_REVIEW_BYTES = 256 * 1024;
const failure = (message, code = 400) => Object.assign(Error(message), {code, publicMessage: message});
function signingSecret(secret) {
  if (typeof secret !== 'string' || secret.length < 32) throw failure('Photo logging is not configured.', 503);
  return secret;
}
function identity(owner, photoId) {
  if (typeof owner !== 'string' || !owner || owner.length > 100 || typeof photoId !== 'string' || !/^[a-f0-9]{64}$/.test(photoId)) throw failure('Choose a valid photo.');
}
function analysisValue(value) {
  try { const result = photoAnalysis(value); if (!result) throw Error(); return result; } catch { throw failure('Photo recognition returned an invalid result. Try again.', 502); }
}
export function signPhotoReview({owner, photoId, analysis}, {secret, now = Date.now()} = {}) {
  identity(owner, photoId); signingSecret(secret);
  if (!Number.isFinite(now)) throw failure('Photo logging is not configured.', 503);
  const payload = Buffer.from(JSON.stringify({v: 1, owner, photoId, expiresAt: now + signedReviewLifetimeMs, analysis: analysisValue(analysis)}));
  if (payload.length > MAX_REVIEW_BYTES) throw failure('Photo recognition returned an invalid result. Try again.', 502);
  const encoded = payload.toString('base64url');
  return encoded + '.' + createHmac('sha256', secret).update(encoded).digest('base64url');
}
export function verifyPhotoReview(token, {owner, photoId, secret, now = Date.now(), reviewSavedAt} = {}) {
  identity(owner, photoId); signingSecret(secret);
  const invalid = () => { throw failure('This photo review expired or changed. Scan the photo again.', 409); };
  if (typeof token !== 'string' || token.length > Math.ceil(MAX_REVIEW_BYTES * 4 / 3) + 45) invalid();
  const parts = token.split('.');
  if (parts.length !== 2 || !/^[A-Za-z0-9_-]+$/.test(parts[0]) || !/^[A-Za-z0-9_-]{43}$/.test(parts[1])) invalid();
  const expected = createHmac('sha256', secret).update(parts[0]).digest(), received = Buffer.from(parts[1], 'base64url');
  if (received.length !== expected.length || !timingSafeEqual(received, expected)) invalid();
  let parsed;
  try { parsed = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8')); } catch { invalid(); }
  if (!parsed || parsed.v !== 1 || parsed.owner !== owner || parsed.photoId !== photoId || !reviewCanBeSaved(parsed.expiresAt - signedReviewLifetimeMs, parsed.expiresAt, now, reviewSavedAt) || Object.keys(parsed).some(key => !['v', 'owner', 'photoId', 'expiresAt', 'analysis'].includes(key))) invalid();
  return analysisValue(parsed.analysis);
}
function decoderSchema(value) {
  if (Array.isArray(value)) return value.map(decoderSchema);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).filter(([key]) => !['minLength', 'maxLength', 'maxItems', 'minimum', 'maximum', 'exclusiveMinimum'].includes(key)).map(([key, child]) => [key, decoderSchema(child)]));
  return value;
}
const responseSchema = decoderSchema(MEAL_PHOTO_SCHEMA);
function ingredient(observation, index) {
  const parsed = parseIngredientLine(observation.description, String(index)), extra = preparationFacts(observation.preparation);
  return {...parsed, preparation: mergePreparationFacts(parsed.preparation, extra), ...(parsed.alternatives ? {alternatives: parsed.alternatives.map(option => ({...option, preparation: mergePreparationFacts(option.preparation, extra)}))} : {})};
}
async function matchObservations(analysis, {search, foods, signal}) {
  const observations = [...analysis.observations.map((row, index) => ({...row, kind: 'observation', observationIndex: index})), ...(analysis.possibleAdditions ?? []).map((row, index) => ({...row, kind: 'possible-addition', additionIndex: index}))];
  const parsed = observations.map(ingredient), queries = new Map();
  // The source matcher owns query alternatives and ranking. Prefetch only its queries.
  for (const item of parsed) matchIngredient(item, {foods, foodCatalog: {search(query, {limit}) { queries.set(query, {limit}); return {items: []}; }}});
  const pending = [...queries.entries()];
  for (let offset = 0; offset < pending.length; offset += 4) {
    if (signal?.aborted) throw failure('Photo recognition cancelled.', 499);
    await Promise.all(pending.slice(offset, offset + 4).map(async ([query, {limit}]) => { queries.set(query, await search(query, {limit, signal})); }));
  }
  if (signal?.aborted) throw failure('Photo recognition cancelled.', 499);
  return observations.map((row, index) => ({...row, ...matchIngredient(parsed[index], {foods, foodCatalog: {search: query => queries.get(query) ?? {items: []}}})}));
}

export async function measurePhotoStep(stages, name, work) {
  const started = performance.now();
  try { return await work(); }
  finally { stages[name] = Math.round(performance.now() - started); }
}

/** The caller authenticates and meters the request before invoking this provider. */
export function createCloudPhotoAnalyzer({apiKey = process.env.GEMINI_API_KEY, reviewSecret = process.env.PHOTO_REVIEW_SECRET, model = CLOUD_PHOTO_MODEL, clientFactory = async key => {const {GoogleGenAI} = await import('@google/genai'); return new GoogleGenAI({apiKey: key, vertexai: false, apiVersion: 'v1'});}, timeoutMs = 30000, now = Date.now} = {}) {
  async function recognize(visionBase64, requestSignal, signal, timeout) {
    try {
      const client = await clientFactory(apiKey);
      // Retry only explicit temporary-overload responses, within the same total deadline.
      // Do not replay quota, authentication, validation or ambiguous transport failures.
      return await client.interactions.create({model, store: false, input: [{type: 'user_input', content: [{type: 'text', text: MEAL_PHOTO_PROMPT + ' Use the best-supported likely food name. Keep reasons brief. Return concise JSON only.'}, {type: 'image', mime_type: 'image/jpeg', data: visionBase64}]}], response_format: {type: 'text', mime_type: 'application/json', schema: responseSchema}, generation_config: {thinking_level: 'minimal', max_output_tokens: 4096}}, {signal: requestSignal, retry_codes: ['503'], retries: {strategy: 'attempt-count-backoff', maxRetries: 2, retryConnectionErrors: false, backoff: {initialInterval: 500, maxInterval: 1000, exponent: 2}}});
    } catch (error) {
      if (signal?.aborted) throw failure('Photo recognition cancelled.', 499);
      if (timeout.aborted) throw failure('Recognition took too long. Try again.', 504);
      const code = error?.statusCode ?? error?.status ?? error?.response?.status;
      if (code === 429) throw failure('Photo recognition limit reached. Try again later.', 429);
      if ([401, 403].includes(code)) throw failure('Photo recognition access needs attention.', 503);
      throw failure('Photo recognition is unavailable. Try again.', 503);
    }
  }
  return {
    async analyze(input, {owner, prepareMatching, signal, stages = {}} = {}) {
      if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).length !== 1 || !Object.hasOwn(input, 'image')) throw failure('Choose one photo.');
      if (typeof apiKey !== 'string' || !apiKey.trim() || apiKey.length > 512 || /\s/.test(apiKey)) throw failure('Photo recognition is not configured.', 503);
      signingSecret(reviewSecret);
      if (typeof prepareMatching !== 'function') throw failure('Food search is unavailable.', 503);
      if (signal?.aborted) throw failure('Photo recognition cancelled.', 499);
      let photo;
      try { photo = await measurePhotoStep(stages, 'normalizeMs', () => normalizePhoto(input.image)); } catch (error) { throw failure(error.message, error.status ?? 400); }
      identity(owner, photo.id);
      const visionBase64 = await measurePhotoStep(stages, 'visionImageMs', () => prepareVisionImage(photo));
      const timeout = AbortSignal.timeout(timeoutMs), controller = new AbortController();
      const requestSignal = AbortSignal.any([controller.signal, timeout, ...(signal ? [signal] : [])]);
      const started = performance.now();
      let response, matching;
      try {
        [response, matching] = await Promise.all([
          measurePhotoStep(stages, 'geminiMs', () => recognize(visionBase64, requestSignal, signal, timeout)),
          measurePhotoStep(stages, 'matchingSetupMs', prepareMatching),
        ]);
      } catch (error) {
        controller.abort();
        throw error;
      }
      if (requestSignal.aborted) throw failure(signal?.aborted ? 'Photo recognition cancelled.' : 'Recognition took too long. Try again.', signal?.aborted ? 499 : 504);
      if (response?.status !== 'completed' || typeof response.output_text !== 'string') throw failure('Photo recognition did not finish. Try again.', 502);
      let result;
      try { result = mealResult(JSON.parse(response.output_text), PROVIDER); } catch { throw failure('Photo recognition returned an invalid result. Try again.', 502); }
      const analysis = analysisValue({observations: result.observations, possibleAdditions: result.possibleAdditions, notes: result.notes});
      let suggestions;
      try { suggestions = await measurePhotoStep(stages, 'matchMs', () => matchObservations(analysis, {...matching, signal: requestSignal})); }
      catch (error) { if (timeout.aborted && !signal?.aborted) throw failure('Food matching took too long. Try again.', 504); throw error; }
      const token = value => Number.isSafeInteger(value) && value >= 0 ? value : null;
      return {...result, photo: {id: photo.id, dataUrl: photo.dataUrl, width: photo.width, height: photo.height}, suggestions, reviewToken: signPhotoReview({owner, photoId: photo.id, analysis}, {secret: reviewSecret, now: now()}), metrics: {model, stages, elapsedMs: Math.round(performance.now() - started), inputTokens: token(response.usage?.total_input_tokens), outputTokens: token(response.usage?.total_output_tokens)}};
    },
  };
}
