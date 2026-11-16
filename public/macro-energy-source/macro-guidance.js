import {macroGuidance} from '../report-source/server/macro-guidance.mjs';
import {formatMessage} from '../report-source/public/message-format.js';
export function macroGuidanceText(note,language='en'){
 if(language==='en'||!Object.hasOwn(macroGuidance,note.code))return note.text;
 const macros=note.macros?.map(name=>formatMessage(language,'targetSetup.macro.'+(name==='carbohydrate'?'carbs':name))).join(', ');
 return formatMessage(language,'macroGuidance.'+note.code,{macros});
}
