import {formatMessage} from '../report-source/public/message-format.js';
import {displayValue,displayUnit} from '../dashboard-source/energy-display.js';
import {mealSuggestionGuidance} from './meal-suggestion-guidance.mjs';
export function mealSuggestionGuidanceText(note,language='en'){
 if(!note||typeof note.text!=='string')return formatMessage(language,'mealSuggestions.invalidGuidance');
 return Object.hasOwn(mealSuggestionGuidance,note.code)?formatMessage(language,'mealSuggestions.guidance.'+note.code):note.text;
}

export function mealMacroAmounts({totals,carbohydrate},energyUnit){
 return [
  {id:'energy',value:displayValue(totals.calories,'kcal',energyUnit),unit:displayUnit('kcal',energyUnit)},
  {id:'protein',value:totals.protein,unit:'g'},
  {id:'carbs',value:carbohydrate.value,unit:'g'},
  {id:'fat',value:totals.fat,unit:'g'}
 ];
}
