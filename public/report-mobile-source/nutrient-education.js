import {nutrientEducationContent} from './nutrient-education-content.js';
const languages=['en','fr','de','pt-BR'],byId=new Map(nutrientEducationContent.map(([id,source,functions,sources])=>[id,{source:Object.freeze({...source}),text:languages.map((_,i)=>Object.freeze({function:functions[i],sources:sources[i]}))}]));
export const nutrientEducationIds=Object.freeze([...byId.keys()]);
/** Exact catalogue identities only. An uncovered compound has no guessed alias.
 * Education never supplies nutrient values, targets or unit conversions. */
export function nutrientEducation(id,language='en'){const row=byId.get(id);if(!row)return null;const i=languages.indexOf(language);return {...row.text[i<0?0:i],source:row.source}}
