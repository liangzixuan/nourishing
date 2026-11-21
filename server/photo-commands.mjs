import {act, date} from './domain/workspace.mjs';
import {verifyPhotoReview} from './cloud-photo.mjs';
import {parseReviewedDestination} from './domain/reviewed-foods.mjs';
import {photoReviewMetadata} from './domain/photo-records.mjs';
import {catalogSourceId} from './domain/food-catalog-identity.mjs';
import {requiredRecordGroup, time} from './domain/diary-record-fields.mjs';

export const photoCommandFields = Object.freeze({'photo.log': ['photoId', 'reviewToken', 'date', 'time', 'group', 'rows', 'destination']});
const fail = message => {throw Object.assign(Error(message), {code: 400, status: 400, publicMessage: message});};
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const rowFields = ['foodId', 'amount', 'quantity', 'unit', 'portionId', 'observationIndex', 'additionIndex'];
export function validatePhotoAction({type, payload}) {
  if (type !== 'photo.log' || !object(payload) || Object.keys(payload).some(key => !photoCommandFields[type].includes(key))) fail('Invalid photo log fields.');
  try {parseReviewedDestination(payload.destination);} catch (error) {fail(error.message);}
  if (typeof payload.photoId !== 'string' || !/^[a-f0-9]{64}$/.test(payload.photoId) || typeof payload.reviewToken !== 'string') fail('Choose a reviewed photo.');
  // The original reviewed-food contract permits 1–30 foods per review.
  if (!Array.isArray(payload.rows) || !payload.rows.length || payload.rows.length > 30) fail('Select 1 to 30 foods.');
  for (const row of payload.rows) {
    if (!object(row) || Object.keys(row).some(key => !rowFields.includes(key)) || typeof row.foodId !== 'string' || !row.foodId || row.foodId.length > 200) fail('Choose a food for each row.');
    if (row.observationIndex !== undefined && row.additionIndex !== undefined) fail('Choose one photo observation per food.');
    for (const key of ['observationIndex', 'additionIndex']) if (row[key] !== undefined && (!Number.isSafeInteger(row[key]) || row[key] < 0)) fail('Choose a valid photo observation.');
    if (row.quantity !== undefined ? row.amount !== undefined || typeof row.quantity !== 'number' || !Number.isFinite(row.quantity) || row.quantity <= 0 : typeof row.amount !== 'number' || !Number.isFinite(row.amount) || row.amount <= 0 || row.unit !== undefined || row.portionId !== undefined) fail('Enter a positive amount for each food.');
  }
  return payload;
}

/** Catalog sources and the normalized photo are supplied by the authenticated server. */
export function applyPhotoLog(state, payload, {owner, reviewSecret, photo, now = Date.now(), reviewSavedAt} = {}) {
  validatePhotoAction({type: 'photo.log', payload});
  if (!photo || photo.id !== payload.photoId) fail('The reviewed photo changed. Scan it again.');
  const analysis = verifyPhotoReview(payload.reviewToken, {owner, photoId: photo.id, secret: reviewSecret, now, reviewSavedAt});
  const destination = parseReviewedDestination(payload.destination);
  date(payload.date);requiredRecordGroup(payload.group, state.settings.groups);time(payload.time);
  const candidate = structuredClone(state), entryIds = [], items = [], evidence = [];
  for (const row of payload.rows) {
    const {observationIndex, additionIndex, ...quantity} = row;
    const observation = observationIndex !== undefined ? analysis.observations[observationIndex] : additionIndex !== undefined ? analysis.possibleAdditions?.[additionIndex] : null;
    if ((observationIndex !== undefined || additionIndex !== undefined) && !observation) fail('Choose a valid photo observation.');
    const food = candidate.foods.find(item => item.id === row.foodId);
    if (!food) fail('This food is unavailable. Choose another match.');
    const metadata = {id: photo.id, description: observation?.description ?? food.name, provider: observation ? 'Google Gemini' : 'Manual review', analysis,
      ...(observation?.preparation ? {preparation: observation.preparation} : {}),
      ...(observation?.portionEstimate ? {portionEstimate: observation.portionEstimate} : {})};
    if (destination.kind === 'diary') {
      const count = candidate.entries.length;
      try {act(candidate, 'entry.add', {...quantity, date: payload.date, time: payload.time, group: payload.group, photo: metadata});}
      catch (error) {if ([400, 404, 409].includes(error.status)) Object.assign(error, {code: error.status, publicMessage: error.message}); throw error;}
      entryIds.push(...candidate.entries.slice(count).map(item => item.id));
    } else {
      items.push(quantity);
      evidence.push({id: `photo-row:${evidence.length}`, description: metadata.description, preparation: observation?.preparation ?? '',
        selection: food.readOnly ? {kind: 'catalog', id: catalogSourceId(food)} : {kind: 'library', id: food.id},
        quantity: row.quantity ?? row.amount, unit: row.quantity === undefined ? 'servings' : row.unit,
        ...(row.portionId === undefined ? {} : {portionId: row.portionId}), confirmed: true,
        ...(observation?.portionEstimate ? {portionEstimate: observation.portionEstimate} : {})});
    }
  }
  let saved;
  if (destination.kind !== 'diary') {
    const photoReview = photoReviewMetadata({version: 1, photo: {id: photo.id, description: destination.name, provider: 'Google Gemini', analysis}, rows: evidence, modifiedAfterReview: false});
    saved = act(candidate, destination.kind + '.save', {name: destination.name, photoReview,
      ...(destination.kind === 'recipe' ? {servings: destination.servings, cookedWeightGrams: null, ingredients: items} : {items})});
  }
  Object.assign(state, candidate);
  return {photoId: photo.id, ...(saved ? {kind: saved.kind, id: saved.id} : {entryIds})};
}
