import test from 'node:test';
import assert from 'node:assert/strict';
import {
  convertGlucoseUnit,
  parseGlucoseKetoneMapping,
  parseGlucoseKetoneRange,
  createGlucoseKetoneView,
  prepareGlucoseKetoneLog,
  serializeGlucoseKetoneCsv,
} from '../server/domain/glucose-ketones.mjs';

const MAPPING = {
  version: 1,
  glucose: {type: 'Blood Glucose'},
  ketones: {type: 'Blood Ketones'},
  displayUnit: 'mmol/L',
};

test('convertGlucoseUnit and mapping/range parsers validate inputs accurately', () => {
  assert.equal(convertGlucoseUnit(5, 'mmol/L', 'mmol/L'), 5);
  assert.ok(Math.abs(convertGlucoseUnit(90.08, 'mg/dL', 'mmol/L') - 5) < 1e-6);
  assert.ok(Math.abs(convertGlucoseUnit(5, 'mmol/L', 'mg/dL') - 90.08) < 1e-6);
  assert.throws(() => convertGlucoseUnit(-1, 'mmol/L', 'mg/dL'), /nonnegative/);
  assert.deepEqual(parseGlucoseKetoneMapping(MAPPING), MAPPING);
  assert.equal(parseGlucoseKetoneMapping(null), null);
  assert.throws(() => parseGlucoseKetoneMapping({...MAPPING, ketones: MAPPING.glucose}), /different source types/);
  assert.throws(() => parseGlucoseKetoneRange({from: '2026-11-15', to: '2026-11-01'}), /1 to 3660/);
});

test('createGlucoseKetoneView pairs readings, computes GKI, handles zero-ketones and exclusions, and serializes CSV', () => {
  const state = {
    settings: {glucoseKetones: MAPPING},
    biometrics: [
      {id: 'g1', date: '2026-11-14', time: '07:00', type: 'Blood Glucose', unit: 'mg/dL', value: 90.08},
      {id: 'k1', date: '2026-11-14', time: '07:02', type: 'Blood Ketones', unit: 'mmol/L', value: 2.0},
      {id: 'g2', date: '2026-11-15', time: '07:00', type: 'Blood Glucose', unit: 'mmol/L', value: 5.0},
      {id: 'k2', date: '2026-11-15', time: '07:01', type: 'Blood Ketones', unit: 'mmol/L', value: 0},
      {id: 'bad-unit', date: '2026-11-15', time: '08:00', type: 'Blood Glucose', unit: 'g', value: 5},
      {id: 'bad-neg', date: '2026-11-15', time: '08:00', type: 'Blood Ketones', unit: 'mmol/L', value: -2},
      {id: 'unmatched-g', date: '2026-11-13', time: '09:00', type: 'Blood Glucose', unit: 'mmol/L', value: 4.8},
    ],
  };

  const view = createGlucoseKetoneView(
    state,
    {from: '2026-11-01', to: '2026-11-15'},
    {now: new Date('2026-11-15T12:00:00Z'), timeZone: 'UTC'},
  );
  assert.equal(view.status, 'ready');
  assert.equal(view.counts.pairs, 2);
  assert.equal(view.counts.ratioAvailable, 1);
  assert.equal(view.counts.ratioUnavailable, 1);
  assert.equal(view.counts.excluded, 2);
  assert.equal(view.counts.unmatched, 1);
  assert.ok(Math.abs(view.pairs[0].gki - 2.5) < 1e-6);
  assert.equal(view.pairs[1].gki, null);
  assert.equal(view.pairs[1].reason, 'zero-ketones');

  const csv = serializeGlucoseKetoneCsv(view);
  assert.equal(csv.filename, 'nourish-glucose-ketones-2026-11-01-to-2026-11-15.csv');
  assert.match(csv.text, /pair,2026-11-14/);
  assert.match(csv.text, /unmatched,2026-11-13/);
  assert.match(csv.text, /excluded,2026-11-15/);
});

test('prepareGlucoseKetoneLog supports valid logs, idempotent replay, and 409 conflict checks', () => {
  const opId = '33333333-3333-4333-8333-333333333333';
  const state = {settings: {glucoseKetones: MAPPING}, biometrics: []};
  const created = prepareGlucoseKetoneLog(state, {
    operationId: opId,
    mapping: MAPPING,
    reading: {date: '2026-11-15', time: '08:30', glucose: {value: 5.2, unit: 'mmol/L'}, ketones: {value: 1.3, unit: 'mmol/L'}},
  });
  assert.equal(created.replayed, false);
  assert.equal(created.records.length, 2);

  state.biometrics.push(...created.records);
  const replay = prepareGlucoseKetoneLog(state, {
    operationId: opId,
    mapping: MAPPING,
    reading: {date: '2026-11-15', time: '08:30', glucose: {value: 5.2, unit: 'mmol/L'}, ketones: {value: 1.3, unit: 'mmol/L'}},
  });
  assert.equal(replay.replayed, true);

  assert.throws(
    () =>
      prepareGlucoseKetoneLog(state, {
        operationId: opId,
        mapping: MAPPING,
        reading: {date: '2026-11-15', time: '08:30', glucose: {value: 6.0, unit: 'mmol/L'}, ketones: {value: 1.3, unit: 'mmol/L'}},
      }),
    error => error.status === 409,
  );
});
