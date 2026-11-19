import test from 'node:test';
import assert from 'node:assert/strict';
import {repairReminderDispatch} from '../server/reminder-schedules-repair.mjs';

test('repairReminderDispatch returns inert summary when disabled and validates limits/clock', async () => {
  let listed = false;
  const db = {listRows: async () => { listed = true; return {rows: []}; }};
  const disabled = await repairReminderDispatch({db, dispatch: async () => ({}), defer: async () => {}, enabled: false});
  assert.deepEqual(disabled, {enabled: false, examined: 0, queued: 0, unchanged: 0, failed: 0, blocked: 0, more: false});
  assert.equal(listed, false);

  await assert.rejects(() => repairReminderDispatch({db, dispatch: async () => ({}), defer: async () => {}, enabled: true, pageSize: 0}), /Invalid scheduler limits/);
  await assert.rejects(() => repairReminderDispatch({db, dispatch: async () => ({}), defer: async () => {}, enabled: true, concurrency: 5}), /Invalid scheduler limits/);
  await assert.rejects(() => repairReminderDispatch({db, dispatch: async () => ({}), defer: async () => {}, enabled: true, budgetMs: 50000}), /Invalid scheduler limits/);
  await assert.rejects(() => repairReminderDispatch({db, dispatch: async () => ({}), defer: async () => {}, enabled: true, clock: () => new Date('invalid')}), /Scheduler clock unavailable/);
});

test('repairReminderDispatch processes queued, unchanged, invalid-owner, deferred, and blocked rows', async () => {
  const rows = [
    {$id: 'owner-queued', ownerId: 'owner-queued', token: 't1'},
    {$id: 'owner-same', ownerId: 'owner-same', token: 't2'},
    {$id: 'row-mismatch', ownerId: 'other-owner', token: 't3'},
    {$id: 'owner-defer', ownerId: 'owner-defer', token: 't4'},
    {$id: 'owner-blocked', ownerId: 'owner-blocked', token: 't5'},
  ];
  const deferred = [];
  const db = {listRows: async () => ({rows})};
  const result = await repairReminderDispatch({
    db,
    enabled: true,
    pageSize: 5,
    concurrency: 2,
    clock: () => new Date('2026-11-19T12:00:00Z'),
    dispatch: async owner => {
      if (owner === 'owner-queued') return {queued: true};
      if (owner === 'owner-same') return {queued: false};
      throw Error('dispatch failed');
    },
    defer: async (owner, token) => {
      if (owner === 'owner-blocked') throw Error('defer failed');
      deferred.push([owner, token]);
    },
  });

  assert.deepEqual(result, {enabled: true, examined: 5, queued: 1, unchanged: 1, failed: 3, blocked: 2, more: true});
  assert.deepEqual(deferred, [['owner-defer', 't4']]);
});

test('repairReminderDispatch stops early and marks more=true when time budget is exceeded', async () => {
  let tick = 0;
  const rows = [
    {$id: 'a', ownerId: 'a', token: '1'},
    {$id: 'b', ownerId: 'b', token: '2'},
    {$id: 'c', ownerId: 'c', token: '3'},
  ];
  const result = await repairReminderDispatch({
    db: {listRows: async () => ({rows})},
    enabled: true,
    pageSize: 10,
    concurrency: 1,
    budgetMs: 100,
    monotonic: () => {
      const value = tick;
      tick += 60;
      return value;
    },
    dispatch: async () => ({queued: true}),
    defer: async () => {},
  });
  assert.equal(result.examined, 2);
  assert.equal(result.queued, 2);
  assert.equal(result.more, true);
});
