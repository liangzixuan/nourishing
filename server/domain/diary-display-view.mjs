import {date as calendarDate} from './calendar.mjs';
import {parseDiaryDisplayPolicy,createNutrientContributions} from './diary-display.mjs';
import {nutrientDisplayOptions} from './nutrient-display.mjs';
import {calculateSummary,calculateDailyNutrition} from './nutrition.mjs';

export function createDiaryDisplayView(state,date){
  calendarDate(date);
  const summary=calculateSummary(state,date);
  return {date,policy:parseDiaryDisplayPolicy(state.settings?.diaryDisplay),options:nutrientDisplayOptions,projection:summary.diaryDisplay,summary};
}

export function createDiaryContributionsView(state,date,id){
  calendarDate(date);
  if(!nutrientDisplayOptions.some(option=>option.id===id))throw Object.assign(Error('Choose a known nutrient.'),{status:400});
  const daily=calculateDailyNutrition(state,date),summary=calculateSummary(state,date);
  return createNutrientContributions({...daily,entries:summary.entries,hydration:summary.hydration},id);
}
