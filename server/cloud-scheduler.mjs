import {Query} from 'node-appwrite';
import {captureCalendar} from './domain/calendar.mjs';

/** Run only from the private scheduled function. tickWorkspace owns atomic per-account writes. */
export async function runCloudScheduler({db, tickWorkspace, clock = () => new Date(), enabled = false, pageSize = 100, concurrency = 4} = {}) {
  const result = {enabled: enabled === true, examined: 0, changed: 0, unchanged: 0, failed: 0, conflicts: 0};
  // Deployment prepares this function with execution disabled until cloud cutover.
  if (enabled !== true) return result;
  if (!db || typeof tickWorkspace !== 'function' || typeof clock !== 'function' || !Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 100 || !Number.isSafeInteger(concurrency) || concurrency < 1 || concurrency > 4) throw Error('Invalid cloud scheduler configuration.');
  const now = clock();if (!(now instanceof Date) || !Number.isFinite(+now)) throw Error('The cloud scheduler clock is unavailable.');
  const databaseId = 'nourishing';let after;
  async function account(head) {
    result.examined++;
    if (typeof head.ownerId !== 'string' || !head.ownerId || head.ownerId !== head.$id) {result.failed++;return;}
    try {
      let profile;
      try {profile = await db.getRow({databaseId, tableId: 'profiles', rowId: head.ownerId});}
      catch (error) {if (error.code !== 404) throw error;}
      // Matches the account service's initial profile policy; an invalid stored zone fails.
      const timeZone = profile ? profile.timeZone : 'UTC', context = captureCalendar(now, timeZone);
      const saved = await tickWorkspace(head.ownerId, context);
      if (saved?.changed === true) result.changed++;
      else if (saved?.changed === false) result.unchanged++;
      else throw Error('The workspace scheduler returned no completion result.');
    } catch (error) {if (error.code === 409 || error.status === 409) result.conflicts++;else result.failed++;}
  }
  do {
    const page = await db.listRows({databaseId, tableId: 'workspace_heads', queries: [Query.select(['$id', 'ownerId']), Query.orderAsc('$id'), Query.limit(pageSize), ...(after ? [Query.cursorAfter(after)] : [])], total: false});
    for (let offset = 0; offset < page.rows.length; offset += concurrency) await Promise.all(page.rows.slice(offset, offset + concurrency).map(account));
    after = page.rows.length === pageSize ? page.rows.at(-1).$id : null;
  } while (after);
  return result;
}
