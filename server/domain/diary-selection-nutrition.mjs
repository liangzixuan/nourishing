import {prepareRecordSelection} from './diary-selection.mjs';
import {energyBudget} from './energy-policy.mjs';
import {calculateSummary,calculateSelectionNutrition,isExerciseEntry} from './nutrition.mjs';

/** Read selected intake against the same full-day targets as the diary. */
export function diarySelectionNutrition(state,selection){
 const source=prepareRecordSelection(state,selection),date=source.selection.date;
 const entryIds=source.records.filter(({collection,row})=>collection==='entries'&&!isExerciseEntry(row)).map(({row})=>row.id),day=calculateSummary(state,date);
 const facts=entryIds.length?calculateSelectionNutrition(state,date,entryIds):day,consumed=facts.totals?.calories;
 const chartSummary=entryIds.length?{...day,consumedEnergy:facts.consumedEnergy,energy:{...day.energy,...energyBudget(consumed,day.energy.target,day.energy.expenditure)}}:day;
 return {selection:source.selection,facts,chartSummary};
}
