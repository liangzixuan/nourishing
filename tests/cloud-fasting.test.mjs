import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {initialState} from '../server/domain/workspace.mjs';
import {applyFastingCommand, fastingView, tickCloudFasting} from '../server/fasting.mjs';

const context = {now: new Date('2026-11-14T18:00:00Z'), timeZone: 'America/Chicago'};
const run = (state, type, payload, clock = context) => applyFastingCommand(state, {type, payload}, clock).result;
const schedule = () => ({id: randomUUID(), revision: 0, label: 'Evening', startDate: '2026-11-14', time: '20:00', recurrence: 'daily', interval: 1, days: [], untilDate: null, goalHours: 16, enabled: true});

test('server clock controls start/end and account zone owns edited wall times', () => {
  const state = initialState();run(state, 'fast.start', {goalHours: 16});assert.equal(state.fasts[0].start, context.now.toISOString());
  assert.throws(() => run(state, 'fast.start', {}), {code: 400});assert.equal(state.fasts.length, 1);
  const view = fastingView(state, {...context, now: new Date('2026-11-14T19:00:00Z')});assert.equal(view.timing.elapsedSeconds, 3600);assert.equal(view.active.startLocal, '2026-11-14T12:00');
  run(state, 'fast.end', {id: state.fasts[0].id}, {...context, now: new Date('2026-11-14T20:00:00Z')});assert.equal(state.fasts[0].end, '2026-11-14T20:00:00.000Z');
  run(state, 'fast.record', {start: '2026-11-13T18:00', end: '2026-11-14T10:00', goalHours: 16});assert.equal(state.fasts[1].start, '2026-11-14T00:00:00Z');
  assert.throws(() => run(state, 'fast.record', {start: '2026-11-14T18:00', end: '2026-11-14T19:00'}), {code: 400});
  assert.throws(() => run(state, 'fast.start', {now: '2000-01-01'}), {code: 400});
  assert.throws(() => run(state, 'fast.start', {}, {timeZone: 'UTC'}), {code: 503});
});

test('history keeps goal separate from edited duration and record repeat does not schedule execution', () => {
  const state = initialState();run(state, 'fast.record', {start: '2026-11-13T12:00', end: '2026-11-14T04:00', goalHours: 20});
  const record = state.fasts[0], repeat = {recurrence: 'weekly', interval: 2, days: [1, 3], untilDate: null, custom: true};
  run(state, 'fast.update', {id: record.id, durationHours: 18, repeat});assert.equal(state.fasts[0].goalHours, 20);assert.equal(Date.parse(state.fasts[0].end) - Date.parse(state.fasts[0].start), 18 * 3600000);
  assert.deepEqual(state.fasts[0].repeat, repeat);assert.equal(state.fastingPlan, undefined);
  run(state, 'fast.update', {id: record.id, repeat: {recurrence: 'once', interval: 1, days: [], untilDate: null}});assert.equal(state.fasts[0].repeat, undefined);
});

test('history summaries use completed records and average the latest seven, with stale pagination detection', () => {
  const state = initialState();
  for (let index = 1; index <= 8; index++) run(state, 'fast.record', {start: `2026-11-${String(index).padStart(2, '0')}T00:00Z`, end: `2026-11-${String(index).padStart(2, '0')}T${String(index).padStart(2, '0')}:00Z`});
  run(state, 'fast.start', {goalHours: null});
  const view = fastingView(state, context, {offset: 0, limit: 2});assert.equal(view.history.total, 9);assert.equal(view.history.summary.completedCount, 8);assert.equal(view.history.summary.lastSevenAverageSeconds, 5 * 3600);assert.equal(view.history.summary.totalSeconds, 36 * 3600);assert.equal(view.history.summary.longestSeconds, 8 * 3600);
  assert.equal(view.history.rows[0].end, null);assert.equal(view.history.rows.length, 2);
  run(state, 'fast.update', {id: state.fasts[0].id, note: 'Changed'});
  assert.throws(() => fastingView(state, context, {offset: 2, limit: 2, revision: view.history.revision}), {status: 409});
  const before = structuredClone(state);assert.throws(() => run(state, 'fasting.deleteMany', {ids: [state.fasts[0].id, 'missing']}));assert.deepEqual(state, before);
  run(state, 'fasting.deleteMany', {ids: state.fasts.slice(0, 2).map(row => row.id)});assert.equal(state.fasts.length, 7);
});

test('schedule start-now consumes one occurrence; stale revision and future replay cannot duplicate it', () => {
  const state = initialState(), draft = schedule();run(state, 'fasting.schedule.save', draft);
  const selected = fastingView(state, context).schedules[0];assert.equal(selected.nextStart, '2026-11-15T02:00:00Z');
  run(state, 'fasting.schedule.startNow', {id: selected.id, revision: selected.revision, start: selected.nextStart});
  run(state, 'fasting.schedule.startNow', {id: selected.id, revision: selected.revision, start: selected.nextStart});assert.equal(state.fasts.length, 1);assert.equal(state.fasts[0].scheduled.start, selected.nextStart);
  assert.equal(tickCloudFasting(state, {...context, now: new Date('2026-11-15T02:01:00Z')}).started.length, 0);
  assert.throws(() => run(state, 'fasting.schedule.delete', {id: selected.id, revision: 99}), {code: 409});
  run(state, 'fasting.schedule.delete', {id: selected.id, revision: 1});assert.equal(state.fasts.length, 1);assert.equal(state.fastingPlan.schedules.length, 0);
});

test('schedule tick retains source late/conflict rules, and edits preserve the recorded schedule zone', () => {
  const state = initialState(), draft = schedule();run(state, 'fasting.schedule.save', draft);
  const result = tickCloudFasting(state, {...context, now: new Date('2026-11-15T02:16:00Z')});assert.equal(result.outcomes[0].outcome, 'missed');assert.equal(state.fasts.length, 0);
  run(state, 'fast.start', {});const due = tickCloudFasting(state, {...context, now: new Date('2026-11-16T02:01:00Z')});assert.equal(due.outcomes[0].outcome, 'conflict');
  run(state, 'fasting.schedule.save', {...draft, revision: 1, label: 'Revised'}, {...context, timeZone: 'Asia/Tokyo'});assert.equal(state.fastingPlan.schedules[0].timeZone, 'America/Chicago');
  const before = structuredClone(state);assert.throws(() => run(state, 'fasting.schedule.save', {...draft, revision: 2, timeZone: 'UTC'}), {code: 400});assert.deepEqual(state, before);
});

test('daylight-saving gaps are rejected and preference patches retain unrelated settings', () => {
  const state = initialState();assert.throws(() => run(state, 'fast.record', {start: '2026-03-08T02:30', end: '2026-03-08T04:00'}), /daylight saving/);
  run(state, 'fast.record', {start: '2026-11-01T01:30-06:00', end: '2026-11-01T03:30-06:00'});assert.equal(state.fasts[0].start, '2026-11-01T01:30-06:00');
  const targets = structuredClone(state.settings.targets);run(state, 'fasting.settings', {showDashboard: false, showDiary: false, timerDirection: 'down', askToStopFast: true});
  const view = fastingView(state, context);assert.deepEqual(view.settings, {enabled: true, showDashboard: false, showDiary: false, askToStopFast: true, timerDirection: 'down'});assert.deepEqual(state.settings.targets, targets);
  assert.throws(() => run(state, 'fasting.settings', {enabled: 'false'}), {code: 400});
});
