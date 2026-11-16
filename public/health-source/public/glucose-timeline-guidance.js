import {parseCarbohydrateDefinition} from './../../report-source/server/carbohydrate-policy.mjs';
import {carbohydrateControlDescription} from './../../report-source/public/carbohydrate-description.js';
import {glucoseTimelineGuidanceMessages} from './../../report-source/public/locales/glucose-timeline-guidance.js';
import {formatMessage} from './../../report-source/public/message-format.js';

export function validTimelineGuidance(value){
 if(!value||typeof value!=='object'||Array.isArray(value)||typeof value.code!=='string'||!value.code||typeof value.text!=='string')return false;
 if(value.code==='carbohydrate-definition'){
  try{parseCarbohydrateDefinition(value.definition);}catch{return false;}
  return Object.keys(value).length===3;
 }
 return Object.keys(value).length===2;
}

/** Unknown explanation identities retain their captured source text. */
export function timelineGuidanceText(value,language='en'){
 if(!validTimelineGuidance(value))throw Error('Invalid glucose timeline explanation');
 if(value.code==='carbohydrate-definition')return language==='en'?value.text:carbohydrateControlDescription(value.definition,language);
 return Object.hasOwn(glucoseTimelineGuidanceMessages.en,'glucoseTimelineGuidance.'+value.code)?formatMessage(language,'glucoseTimelineGuidance.'+value.code):value.text;
}
