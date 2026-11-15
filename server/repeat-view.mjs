import {previewRepeats} from './domain/workspace.mjs';
import {entryFacts} from './domain/nutrition.mjs';
import {date as calendarDate} from './domain/calendar.mjs';
import {digest} from './data-codec.mjs';

export function repeatView(state, date) {
  try {
    calendarDate(date);
    const items = state.repeats.map(item => {
      const kind = item.recipeId ? 'recipe' : item.mealId ? 'meal' : 'food';
      const facts = entryFacts(state, {...item, date});
      return {...item, kind, name: facts.name, portionLabel: facts.portionLabel ?? null};
    });
    return {revision: digest(state), date, groups: [...state.settings.groups], completed: state.settings.completedDays?.includes(date) ?? false, items, preview: previewRepeats(state, {date})};
  } catch (error) {
    if ([400, 404, 409].includes(error.status)) throw Object.assign(error, {code: error.status, publicMessage: error.message});
    throw error;
  }
}
