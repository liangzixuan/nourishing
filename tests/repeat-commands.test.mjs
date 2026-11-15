import test from 'node:test';
import assert from 'node:assert/strict';
import {act, initialState} from '../server/domain/workspace.mjs';
import {repeatView} from '../server/repeat-view.mjs';
import {validateRepeatAction} from '../server/repeat-commands.mjs';

const date = '2026-11-14';
const fixture = () => {
  const state = initialState();
  state.foods.push({id: 'test:food', name: 'Fixture oats', grams: 100, serving: '100 g', nutrients: {calories: 200, protein: 10}});
  return state;
};
const schedule = {foodId: 'test:food', quantity: 50, unit: 'g', group: 'Breakfast', time: '08:00', startDate: date, endDate: null, days: [6], enabled: true};
function run(state, type, payload) { validateRepeatAction({type, payload}); return act(state, type, payload); }

test('repeats preview source quantities and apply only reviewed occurrences once', () => {
  const state = fixture();
  run(state, 'repeat.save', schedule);
  const view = repeatView(state, date);
  assert.equal(view.items[0].name, 'Fixture oats');
  assert.equal(view.preview.items[0].nutrients.calories, 100);
  assert.equal(view.preview.items[0].nutrients.fat, null);
  const items = view.preview.items.map(({id, fingerprint}) => ({id, fingerprint}));
  run(state, 'repeat.apply', {date, items});
  run(state, 'repeat.apply', {date, items});
  assert.equal(state.entries.length, 1);
  assert.equal(state.entries[0].quantity, 50);
  assert.equal(repeatView(state, date).preview.alreadyLogged, 1);
  assert.equal(repeatView(state, date).preview.items.length, 0);
});

test('changing schedule or food rejects a stale review; schedule edits replace old reference', () => {
  const state = fixture();
  run(state, 'repeat.save', schedule);
  const id = state.repeats[0].id, items = repeatView(state, date).preview.items.map(({id, fingerprint}) => ({id, fingerprint}));
  state.foods[0].nutrients.calories = 220;
  assert.throws(() => run(state, 'repeat.apply', {date, items}), {status: 409});
  assert.equal(state.entries.length, 0);
  act(state, 'recipe.save', {name: 'Fixture porridge', servings: 2, ingredients: [{foodId: 'test:food', amount: 2}]});
  run(state, 'repeat.save', {id, recipeId: state.recipes[0].id, amount: 1, group: 'Lunch', time: '12:00', startDate: date, days: [6]});
  assert.equal(state.repeats[0].foodId, undefined);
  assert.equal(state.repeats[0].recipeId, state.recipes[0].id);
  assert.equal(repeatView(state, date).preview.items[0].nutrients.calories, 220);
});

test('date boundaries, enabled state, deletion and completed days retain original rules', () => {
  const state = fixture();
  run(state, 'repeat.save', {...schedule, endDate: date});
  const id = state.repeats[0].id;
  assert.equal(repeatView(state, '2026-11-21').preview.items.length, 0);
  run(state, 'repeat.setEnabled', {id, enabled: false});
  assert.equal(repeatView(state, date).preview.items.length, 0);
  run(state, 'repeat.setEnabled', {id, enabled: true});
  const items = repeatView(state, date).preview.items.map(({id, fingerprint}) => ({id, fingerprint}));
  act(state, 'day.complete', {date, completed: true});
  assert.equal(repeatView(state, date).completed, true);
  assert.throws(() => run(state, 'repeat.apply', {date, items}));
  assert.equal(state.entries.length, 0);
  run(state, 'repeat.delete', {id});
  assert.equal(state.repeats.length, 0);
});

test('repeat boundary rejects forged provenance, owner fields and invalid selection', () => {
  const state = fixture();
  for (const payload of [{...schedule, ownerId: 'another'}, {...schedule, nutrients: {calories: 1}}, {...schedule, recipeId: 'other'}]) assert.throws(() => run(state, 'repeat.save', payload), {code: 400});
  assert.throws(() => run(state, 'repeat.save', {...schedule, days: [6, 6]}));
  assert.throws(() => run(state, 'repeat.save', {...schedule, endDate: '2026-11-13'}));
  assert.throws(() => run(state, 'repeat.apply', {date, items: [{id: 'other', fingerprint: 'x', ownerId: 'another'}]}), {code: 400});
  assert.throws(() => repeatView(state, '2026-02-30'), {code: 400});
});
