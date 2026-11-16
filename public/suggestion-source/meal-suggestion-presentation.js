import {formatMessage} from '../report-source/public/message-format.js';
import {mealSuggestionGuidance} from './meal-suggestion-guidance.mjs';
export function mealSuggestionGuidanceText(note,language='en'){
 if(!note||typeof note.text!=='string')return formatMessage(language,'mealSuggestions.invalidGuidance');
 return Object.hasOwn(mealSuggestionGuidance,note.code)?formatMessage(language,'mealSuggestions.guidance.'+note.code):note.text;
}
