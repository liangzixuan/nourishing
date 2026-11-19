import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseBloodPressureMapping,
  parseBloodPressureRange,
  createBloodPressureView,
  prepareBloodPressureLog,
} from '../server/domain/blood-pressure.mjs';

const MAPPING = {
  systolic: {type: 'Systolic Blood Pressure', unit: 'mmHg'},
  diastolic: {type: 'Diastolic Blood Pressure', unit: 'mmHg'},
  pulse: {type: 'Heart Rate', unit: 'bpm'},
};

test('parseBloodPressureMapping and parseBloodPressureRange enforce units, distinct metrics, and range limits', () => {
  assert.deepEqual(parseBloodPressureMapping(MAPPING), MAPPING);
  assert.deepEqual(parseBloodPressureMapping({...MAPPING, pulse: null}).pulse, null);
  assert.throws(() => parseBloodPressureMapping({...MAPPING, diastolic: MAPPING.systolic}), /different systolic and diastolic/);
  assert.throws(() => parseBloodPressureMapping({...MAPPING, systolic: {type: 'BP', unit: 'kPa'}}), /mmHg/);
  assert.deepEqual(parseBloodPressureRange({from: '2026-11-01', to: '2026-11-15'}), {from: '2026-11-01', to: '2026-11-15'});
  assert.throws(() => parseBloodPressureRange({from: '2026-11-15', to: '2026-11-01'}), /1 to 3660/);
});

test('createBloodPressureView pairs readings by time/order, attaches nearest pulse, and tracks unmatched readings', () => {
  const empty = createBloodPressureView({biometrics: [], settings: {}}, {from: '2026-11-01', to: '2026-11-15'}, {now: new Date('2026-11-15T12:00:00Z'), timeZone: 'UTC'});
  assert.equal(empty.status, 'unconfigured');

  const state = {
    settings: {bloodPressure: MAPPING},
    biometrics: [
      {id: 's1', date: '2026-11-14', time: '08:00', type: MAPPING.systolic.type, unit: 'mmHg', value: 118},
      {id: 'd1', date: '2026-11-14', time: '08:02', type: MAPPING.diastolic.type, unit: 'mmHg', value: 76},
      {id: 'p1', date: '2026-11-14', time: '08:01', type: MAPPING.pulse.type, unit: 'bpm', value: 64},
      {id: 's2', date: '2026-11-14', time: '20:00', type: MAPPING.systolic.type, unit: 'mmHg', value: 122},
    ],
  };
  const view = createBloodPressureView(state, {from: '2026-11-01', to: '2026-11-15'}, {now: new Date('2026-11-15T12:00:00Z'), timeZone: 'UTC'});
  assert.equal(view.status, 'ready');
  assert.equal(view.counts.readings, 4);
  assert.equal(view.counts.pairs, 1);
  assert.equal(view.counts.pulseMatched, 1);
  assert.equal(view.counts.unmatched, 1);
  assert.equal(view.pairs[0].systolic.value, 118);
  assert.equal(view.pairs[0].diastolic.value, 76);
  assert.equal(view.pairs[0].pulse.value, 64);
  assert.equal(view.pairs[0].pulseMatch, 'time');
  assert.equal(view.unmatched[0].role, 'systolic');
});

test('prepareBloodPressureLog validates, supports exact replay, and rejects conflicting retries or mapping drift', () => {
  const opId = '11111111-1111-4111-8111-111111111111';
  const state = {settings: {bloodPressure: MAPPING}, biometrics: []};
  const first = prepareBloodPressureLog(state, {
    operationId: opId,
    mapping: MAPPING,
    reading: {date: '2026-11-15', time: '09:00', systolic: 120, diastolic: 80, pulse: 62},
  });
  assert.equal(first.replayed, false);
  assert.equal(first.records.length, 3);

  // Exact replay succeeds idempotently
  state.biometrics.push(...first.records);
  const replay = prepareBloodPressureLog(state, {
    operationId: opId,
    mapping: MAPPING,
    reading: {date: '2026-11-15', time: '09:00', systolic: 120, diastolic: 80, pulse: 62},
  });
  assert.equal(replay.replayed, true);

  // Conflicting retry (changed value or dropped pulse) fails with 409
  assert.throws(
    () =>
      prepareBloodPressureLog(state, {
        operationId: opId,
        mapping: MAPPING,
        reading: {date: '2026-11-15', time: '09:00', systolic: 125, diastolic: 80},
      }),
    error => error.status === 409,
  );

  // Mapping drift fails with 409
  const op2 = '22222222-2222-4222-8222-222222222222';
  assert.throws(
    () =>
      prepareBloodPressureLog(
        {settings: {}, biometrics: []},
        {operationId: op2, mapping: MAPPING, reading: {date: '2026-11-15', systolic: 120, diastolic: 80}},
      ),
    error => error.status === 409,
  );

  // Logging pulse without a pulse mapping fails with 400
  assert.throws(
    () =>
      prepareBloodPressureLog(
        {settings: {bloodPressure: {...MAPPING, pulse: null}}, biometrics: []},
        {operationId: op2, mapping: {...MAPPING, pulse: null}, reading: {date: '2026-11-15', systolic: 120, diastolic: 80, pulse: 65}},
      ),
    error => error.status === 400,
  );
});
