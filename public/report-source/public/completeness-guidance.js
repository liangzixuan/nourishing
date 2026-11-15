import {completenessGuidance,isCompletenessGuidance} from './../server/completeness-guidance.mjs';
import {completenessDefinitionFields,completenessDefinitionText} from './../server/completeness-metric.mjs';
import {carbohydrateControlDescription} from './carbohydrate-description.js';
import {formatMessage} from './message-format.js';
export function completenessNoteText(note,language='en'){
 if(!isCompletenessGuidance(note))throw Error('Incomplete food-data completeness explanation.');
 return language==='en'||!Object.hasOwn(completenessGuidance,note.code)?note.text:formatMessage(language,'completenessGuidance.'+note.code);
}
export function completenessDefinitionDescription(row,language='en'){
 completenessDefinitionFields(row);if(language==='en')return completenessDefinitionText(row);
 return !Object.hasOwn(row,'definition')?'':row.definition===null?formatMessage(language,'completeness.netUnset'):carbohydrateControlDescription(row.definition,language);
}
