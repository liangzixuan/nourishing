import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {runCloudScheduler} from '../server/cloud-scheduler.mjs';
import {tickCloudFasting, applyFastingCommand} from '../server/fasting.mjs';
import {initialState} from '../server/domain/workspace.mjs';

function fixture(ids, profiles = {}) {
  const calls = [], db = {async listRows(input) {calls.push(input);const queries = input.queries.map(JSON.parse), cursor = queries.find(query => query.method === 'cursorAfter')?.values[0], limit = queries.find(query => query.method === 'limit').values[0], start = cursor ? ids.indexOf(cursor) + 1 : 0;return {rows: ids.slice(start, start + limit).map(id => ({$id: id, ownerId: id}))};}, async getRow({rowId}) {if (!Object.hasOwn(profiles, rowId)) throw {code: 404};return profiles[rowId];}};
  return {calls, db};
}

test('scheduled execution is disabled by default without reading or changing any account', async () => {
  const result = await runCloudScheduler({db: {listRows() {throw Error('Must not run');}}, tickWorkspace() {throw Error('Must not run');}});
  assert.deepEqual(result, {enabled: false, examined: 0, changed: 0, unchanged: 0, failed: 0, conflicts: 0});
});

test('worker pages owners, captures one instant, honors account zones and bounds concurrency', async () => {
  const {db, calls} = fixture(['a', 'b', 'c', 'd', 'e'], {a: {timeZone: 'America/Chicago'}, c: {timeZone: 'Asia/Tokyo'}}), seen = [];let running = 0, peak = 0, clocks = 0;
  const result = await runCloudScheduler({db, enabled: true, pageSize: 2, concurrency: 2, clock: () => {clocks++;return new Date('2026-11-14T23:00:00Z');}, tickWorkspace: async (owner, context) => {running++;peak = Math.max(peak, running);await new Promise(resolve => setImmediate(resolve));seen.push({owner, context});running--;return {changed: owner === 'a'};}});
  assert.equal(clocks, 1);assert.equal(peak, 2);assert.equal(calls.length, 3);assert.equal(result.examined, 5);assert.equal(result.changed, 1);assert.equal(result.unchanged, 4);
  assert.equal(seen.find(row => row.owner === 'a').context.timeZone, 'America/Chicago');assert.equal(seen.find(row => row.owner === 'c').context.today, '2026-11-15');assert.equal(seen.find(row => row.owner === 'b').context.timeZone, 'UTC');
});

test('worker isolates profile and transaction failures while retaining conflict counts', async () => {
  const {db} = fixture(['a', 'b', 'c', 'd'], {a: {timeZone: 'invalid-zone'}}), seen = [];
  const result = await runCloudScheduler({db, enabled: true, tickWorkspace: async owner => {seen.push(owner);if (owner === 'b') throw {code: 409};if (owner === 'c') throw {code: 503};return {changed: false};}});
  assert.equal(result.failed, 2);assert.equal(result.conflicts, 1);assert.equal(result.unchanged, 1);assert.ok(!seen.includes('a'));
});

test('due schedule writes once and an unchanged tick creates no receipt work; late schedules remain missed', async () => {
  const {db} = fixture(['owner']), state = initialState(), timeZone = 'UTC', arm = new Date('2026-11-14T10:00:00Z');
  const save = (hour, label) => applyFastingCommand(state, {type: 'fasting.schedule.save', payload: {id: randomUUID(), revision: 0, label, startDate: '2026-11-14', time: hour, recurrence: 'once', interval: 1, days: [], untilDate: null, goalHours: 16, enabled: true}}, {now: arm, timeZone});
  save('10:10', 'Missed');save('11:00', 'Due');let writes = 0;
  const options = {db, enabled: true, clock: () => new Date('2026-11-14T11:01:00Z'), tickWorkspace: async (_, context) => {const result = tickCloudFasting(state, context);if (result.changed) writes++;return result;}};
  const first = await runCloudScheduler(options);assert.equal(first.changed, 1);assert.equal(state.fasts.length, 1);assert.equal(state.fastingPlan.schedules[0].lastOccurrence.outcome, 'missed');assert.equal(state.fastingPlan.schedules[1].lastOccurrence.outcome, 'started');
  const second = await runCloudScheduler(options);assert.equal(second.unchanged, 1);assert.equal(writes, 1);assert.equal(state.fasts.length, 1);
});
