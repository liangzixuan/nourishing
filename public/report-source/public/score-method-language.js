import {scoreDescriptionPartIds} from './../server/nutrition-score-policy.mjs';
import {formatMessage} from './message-format.js';
export function scoreMethodDescription(score,language='en'){
 if(score===null||typeof score!=='object'||![score.id,score.method,score.description].every(value=>typeof value==='string'))throw new TypeError('Incomplete captured score method.');
 const parts=scoreDescriptionPartIds(score.id,score.method);
 return language==='en'||parts===null?score.description:parts.map(code=>formatMessage(language,'scoreMethod.'+code)).join(' ');
}
