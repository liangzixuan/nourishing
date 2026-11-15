import {createHash} from 'node:crypto';
import {Permission, Role} from 'node-appwrite';
import {InputFile} from 'node-appwrite/file';
import {rowId} from './data-codec.mjs';

const fail = (message, code = 409) => {throw Object.assign(Error(message), {code, publicMessage: message});};
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const optional = async operation => {try {return await operation();} catch (error) {if (error.code === 404) return null; throw error;}};
const samePermissions = (actual, expected) => Array.isArray(actual) && actual.length === 1 && actual[0] === expected[0];

/** photo is the result of validateStoredPhoto at the HTTP boundary, never raw request metadata. */
export async function stagePhotoMedia({db, storage, owner, generation, transactionId, photo, namespace = 'meal_photos'}) {
  if (typeof owner !== 'string' || !owner || owner.length > 100 || typeof generation !== 'string' || !generation || typeof transactionId !== 'string' || !transactionId) fail('Photo storage is unavailable.', 503);
  if (!photo || !Buffer.isBuffer(photo.bytes) || photo.mime !== 'image/jpeg' || photo.bytes.length < 1 || photo.bytes.length > 3 * 1024 * 1024 || hash(photo.bytes) !== photo.id || ![photo.width, photo.height].every(value => Number.isInteger(value) && value > 0 && value <= 1600)) fail('Choose a valid normalized photo.', 400);
  if (!['meal_photos','progress_photos','note_photos'].includes(namespace)) fail('Invalid photo namespace.', 400);
  const fileId = rowId(owner, namespace, photo.id), permissions = [Permission.read(Role.user(owner))];
  const fileArgs = {bucketId: 'private-media', fileId};
  let file = await optional(() => storage.getFile(fileArgs));
  if (!file) {
    try {file = await storage.createFile({...fileArgs, file: InputFile.fromBuffer(photo.bytes, `${fileId}.jpg`), permissions});}
    catch (error) {if (error.code !== 409) throw error; file = await storage.getFile(fileArgs);}
  }
  if (!samePermissions(file.$permissions, permissions) || file.sizeOriginal !== photo.bytes.length || file.name !== `${fileId}.jpg`) fail('Stored photo ownership could not be verified.');
  const bytes = Buffer.from(await storage.getFileView(fileArgs));
  if (hash(bytes) !== photo.id) fail('Stored photo content could not be verified.');
  const args = {databaseId: 'nourishing', tableId: 'workspace_media', rowId: rowId(owner, generation, namespace, photo.id)};
  const data = {ownerId: owner, generation, namespace, sourceId: photo.id, fileId, digest: photo.id, width: photo.width, height: photo.height, bytes: photo.bytes.length};
  const prior = await optional(() => db.getRow({...args, transactionId}));
  if (prior) {
    if (!samePermissions(prior.$permissions, permissions) || Object.entries(data).some(([key, value]) => prior[key] !== value)) fail('Stored photo metadata could not be verified.');
  } else await db.createRow({...args, data, permissions, transactionId});
  // Storage is not transactional. A failed diary commit leaves a private content-addressed
  // blob that an identical retry can reuse. Never delete it here: another commit may use it.
  return {fileId, mediaId: args.rowId, photoId: photo.id};
}
