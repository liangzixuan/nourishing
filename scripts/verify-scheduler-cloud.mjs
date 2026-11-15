// Live Appwrite transactions for one disposable account. Never runs the project-wide scheduler.
import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {ID, Query} from 'node-appwrite';
import {fixtureOperator} from './fixture-operator.mjs';
import {allRows,databaseId} from './operator.mjs';
import {createWorkspaceStore} from '../server/workspace-store.mjs';
import {createDataRepository} from '../server/data-repository.mjs';
import {digest} from '../server/data-codec.mjs';

const {users, db} = fixtureOperator(), owner = ID.unique(), store = createWorkspaceStore(db, owner), repository = createDataRepository(db, owner), failures = [];
const ledgerPath = new URL('../.local/scheduler-cloud-fixture.json', import.meta.url), reportPath = new URL('../.local/scheduler-cloud-verification.json', import.meta.url);
const report = {at: new Date().toISOString(), checks: [], projectWideSchedulerRun: false};let created = false;
const context = hour => ({asOf: `2026-11-14T${hour}:00Z`, timeZone: 'UTC', today: '2026-11-14'});
const args = (tableId, rowId) => ({databaseId, tableId, rowId});
const receipts = async () => (await allRows(db, 'command_receipts', [Query.equal('ownerId', owner)])).length;
const command = async (type, payload, clock) => store.command({requestId: randomUUID(), revision: digest(await repository.readState()), type, payload}, async () => null, clock);
const schedule = async (time, arm) => command('fasting.schedule.save', {id: randomUUID(), revision: 0, label: `Fixture ${time}`, startDate: '2026-11-14', time, recurrence: 'once', interval: 1, days: [], untilDate: null, goalHours: 16, enabled: true}, context(arm));
const end = async clock => command('fast.end', {id: (await repository.readState()).fasts.find(row => row.end === null).id}, context(clock));
function wrapped(overrides) {return new Proxy(db, {get(target, key) {if (Object.hasOwn(overrides, key)) return overrides[key];const value = Reflect.get(target, key);return typeof value === 'function' ? value.bind(target) : value;}});}
writeFileSync(ledgerPath, JSON.stringify({owner, created: false, removed: false}));
try {
  await users.create({userId: owner, email: `scheduler-${owner}@example.com`, password: randomUUID() + 'Aa1!', name: 'Scheduler verification fixture'});created = true;
  writeFileSync(ledgerPath, JSON.stringify({owner, created, removed: false}));
  await store.create();await schedule('11:00', '10:00');const baselineReceipts = await receipts();
  const armed=await db.getRow(args('fasting_dispatch',owner));assert.equal(armed.ownerId,owner);assert.equal(armed.dueAt,'2026-11-14T11:00:00.000Z');assert.deepEqual(armed.$permissions,[]);
  assert.equal((await store.tickFasting(context('11:01'))).changed, true);
  await assert.rejects(()=>db.getRow(args('fasting_dispatch',owner)),{code:404});
  let state = await repository.readState();assert.equal(state.fasts.length, 1);assert.equal(state.fasts[0].start, '2026-11-14T11:00:00Z');
  assert.equal(state.fastingPlan.schedules[0].lastOccurrence.fastId, state.fasts[0].id);
  let transactions = 0;
  const observedStore = createWorkspaceStore(wrapped({createTransaction: async input => {transactions++;return db.createTransaction(input);}}), owner);
  assert.deepEqual(await observedStore.tickFasting(context('11:02')), {changed: false});assert.equal(transactions, 0);assert.equal(await receipts(), baselineReceipts);
  report.checks.push('private dispatch intent commits with schedule and is removed with its last occurrence', 'due occurrence and cursor commit together', 'unchanged tick creates no transaction or receipt');

  await end('11:02');await schedule('12:00', '11:03');const beforeParallel = await receipts();
  const parallel = await Promise.allSettled([store.tickFasting(context('12:01')), createWorkspaceStore(db, owner).tickFasting(context('12:01'))]);
  assert.equal(parallel.filter(result => result.status === 'fulfilled' && result.value.changed).length, 1);
  for (const result of parallel) if (result.status === 'rejected') assert.equal(result.reason.code, 409);
  state = await repository.readState();assert.equal(state.fasts.length, 2);assert.equal(new Set(state.fasts.map(row => row.id)).size, 2);assert.equal(await receipts(), beforeParallel);
  report.checks.push('concurrent ticks produce one fast without receipt growth');

  await end('12:02');await schedule('13:00', '12:03');let interleaved = false;
  const staleStore = createWorkspaceStore(wrapped({getRow: async input => {
    const head = await db.getRow(input);
    if (!interleaved && input.tableId === 'workspace_heads' && input.rowId === owner) {
      interleaved = true;
      await command('note.add', {date: '2026-11-14', time: '12:30', group: 'Lunch', text: 'Concurrent fixture note'}, context('12:30'));
    }
    return head;
  }}), owner);
  await assert.rejects(() => staleStore.tickFasting(context('13:01')), error => error.code === 409);assert.equal(interleaved, true);
  state = await repository.readState();assert.equal(state.fasts.length, 2);assert.equal(state.notes.length, 1);assert.equal(state.notes[0].text, 'Concurrent fixture note');
  const beforeRetry = await receipts();assert.equal((await store.tickFasting(context('13:01'))).changed, true);
  state = await repository.readState();assert.equal(state.fasts.length, 3);assert.equal(state.notes.length, 1);assert.equal(await receipts(), beforeRetry);
  report.checks.push('stale tick conflicts while preserving a concurrent note', 'retry merges the scheduled fast with the newer workspace');
} finally {
  const clean = async (resource, operation) => {try {await operation();} catch (error) {if (error.code !== 404) failures.push({resource, code: error.code ?? 'unknown'});}};
  if (created) {
    for (const tableId of ['command_receipts', 'workspace_media', 'workspace_records']) {
      let rows = [];await clean(`${tableId}:list`, async () => {rows = await allRows(db, tableId, [Query.equal('ownerId', owner)]);});
      for (const row of rows) {assert.equal(row.ownerId, owner);await clean(`${tableId}:${row.$id}`, () => db.deleteRow(args(tableId, row.$id)));}
    }
    await clean('workspace_heads', () => db.deleteRow(args('workspace_heads', owner)));
    await clean('fasting_dispatch', () => db.deleteRow(args('fasting_dispatch', owner)));
    await clean('profiles', () => db.deleteRow(args('profiles', owner)));
    await clean('fixture_user', () => users.delete({userId: owner}));
  }
  report.fixtureRemoved = failures.length === 0;
  writeFileSync(ledgerPath, JSON.stringify({owner, created, removed: report.fixtureRemoved, cleanupFailures: failures}));
  writeFileSync(reportPath, JSON.stringify({...report, status: 'verification-incomplete'}, null, 2));
  if (failures.length) throw Error('Scheduler fixture cleanup is incomplete. See .local/scheduler-cloud-fixture.json.');
}
report.status = 'passed';writeFileSync(reportPath, JSON.stringify(report, null, 2));console.log(JSON.stringify(report));
