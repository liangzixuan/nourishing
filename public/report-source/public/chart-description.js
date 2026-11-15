import {scoreDescriptionPartIds} from './../server/nutrition-score-policy.mjs';
import {scoreMethodDescription} from './score-method-language.js';
import {carbohydrateControlDescription} from './carbohydrate-description.js';
import {formatMessage} from './message-format.js';

/** Translate captured identities only; unknown methods keep their source text. */
export function chartSeriesDescription(series,language='en'){
 const description=series?.description,metric=series?.metric;
 if(language==='en'||typeof description!=='string'||!metric)return description;
 const m=(key,values)=>formatMessage(language,'chartText.'+key,values);
 if(metric.kind==='carbohydrate'&&Object.hasOwn(series,'definition'))return carbohydrateControlDescription(series.definition,language);
 if(metric.kind==='score'&&scoreDescriptionPartIds(metric.id,series.method)!==null)return m('scoreDescription')+' '+scoreMethodDescription({id:metric.id,method:series.method,description},language);
 if(metric.kind==='data-completeness'&&series.method==='local-food-leaf-completeness-v1'){
  let result=m(['nutrient','carbohydrate'].includes(metric.scope)?'availabilitySelected':'availabilityTargets');
  if(metric.scope==='carbohydrate'&&Object.hasOwn(series,'definition'))result+=' '+(series.definition===null?formatMessage(language,'completeness.netUnset'):carbohydrateControlDescription(series.definition,language));
  return result;
 }
 return description;
}
