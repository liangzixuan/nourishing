import {date as calendarDate} from './calendar.mjs';
import {createDiaryContributionsView} from './diary-display-view.mjs';
import {createNutrientTargetsView} from './nutrient-target-view.mjs';
import {calculateSelectionNutrition} from './nutrition.mjs';
import {createNutrientContributions} from './diary-display.mjs';
import {nutrientDisplayOptions} from './nutrient-display.mjs';
const ids=new Set(nutrientDisplayOptions.map(row=>row.id));
const fail=message=>{throw Object.assign(Error(message),{status:400})};
/** Compose a nutrient screen from one workspace snapshot. Calculation and target
 * owners retain units, availability, scope, reference provenance and editability. */
export function createNutrientDetailView(state,input){
 if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).sort().join(',')!=='date,entryIds,nutrient')fail('Choose date, nutrient and entryIds only.');
 const {date,nutrient,entryIds}=input;calendarDate(date);if(!ids.has(nutrient))fail('Choose a known nutrient.');
 const selected=entryIds===null?null:calculateSelectionNutrition(state,date,entryIds);
 const contributions=selected?createNutrientContributions(selected,nutrient):createDiaryContributionsView(state,date,nutrient);
 const targets=createNutrientTargetsView(state,date),controls=targets.groups.flatMap(group=>group.nutrients).find(row=>row.id===nutrient);
 return {version:1,date,energyUnit:targets.energyUnit,selection:selected?.selectedEntryIds??null,contributions,controls};
}
