import test from 'node:test';
import assert from 'node:assert/strict';
import {initialState, act} from '../server/domain/workspace.mjs';
import {beginCloudLogging, finishCloudLogging, loggingCalendar} from '../server/cloud-logging.mjs';

const calendar = {asOf: '2026-11-15T01:00:00.000Z', timeZone: 'America/Chicago', today: '2026-11-14'};

function fixture() {
  const state = initialState();
  state.foods = [];
  state.entries = [];
  act(state, 'food.save', {name: 'Fixture', serving: '100 g', grams: 100, nutrients: {calories: 200, protein: 10}});
  return state;
}

test('logging observes only new current-day records and uses the original ledger for cloud commands', () => {
  const state = fixture();
  const before = beginCloudLogging(state, 'photo.log');
  act(state, 'entry.add', {foodId: state.foods[0].id, date: calendar.today, group: 'Dinner', quantity: 100, unit: 'g'});
  act(state, 'entry.add', {foodId: state.foods[0].id, date: '2026-11-13', group: 'Dinner', quantity: 100, unit: 'g'});
  finishCloudLogging(state, before, 'photo.log', calendar);
  assert.equal(state.loggingStreaks.events.length, 1);
  assert.equal(state.loggingStreaks.events[0].day, calendar.today);
  assert.equal(state.loggingStreaks.events[0].category, 'food');
  finishCloudLogging(state, before, 'photo.log', calendar);
  assert.equal(state.loggingStreaks.events.length, 1);
  assert.equal(beginCloudLogging(state, 'health.import'), null);
  assert.equal(beginCloudLogging(state, 'entry.ingredients.adjust'), null);
  assert.equal(beginCloudLogging(state, 'note.add'), null);
  const metricBefore = beginCloudLogging(state, 'biometric.log');
  state.biometrics.push({id: 'native-fixture', date: calendar.today, source: {provider: 'health-connect'}});
  finishCloudLogging(state, metricBefore, 'biometric.log', calendar);
  assert.equal(state.loggingStreaks.events.length, 1);
});

test('logging clock keeps supplied server capture and reads only the owning profile otherwise', async () => {
  const calls = [];
  const db = {
    getRow: async args => {
      calls.push(args);
      return {timeZone: 'America/Chicago'};
    },
  };
  assert.deepEqual(await loggingCalendar(db, 'owner', calendar), calendar);
  assert.equal(calls.length, 0);
  const captured = await loggingCalendar(db, 'owner', {});
  assert.equal(captured.timeZone, 'America/Chicago');
  assert.equal(calls[0].rowId, 'owner');
  await assert.rejects(() =>
    loggingCalendar(
      {
        getRow: async () => {
          throw Object.assign(Error('denied'), {code: 403});
        },
      },
      'owner',
      {},
    ),
  );
});
