import {scoreDisplayName,scoreGroupName} from './score-language.js';
import {nutrientDisplayName} from './nutrient-language.js';
import {formatMessage} from './message-format.js';

/** Translate owned metric identities only. Source captures and user names stay literal. */
export function metricDisplayName(row,{language='en',definition=row.definition}={}){
 const name=row.name??row.info?.name,metric=row.metric;
 if(language==='en'||!metric)return name;
 if(metric.kind==='nutrient')return nutrientDisplayName({id:metric.id,name},language);
 if(metric.kind==='score')return scoreDisplayName({id:metric.id,name},language);
 if(metric.kind==='energy'&&['expenditure','target','remaining','balance'].includes(metric.id))return formatMessage(language,'metric.energy.'+metric.id);
 const completeness=metric.kind==='data-completeness';
 if(completeness&&metric.scope===undefined)return formatMessage(language,'metric.completeness');
 if(completeness&&metric.scope==='group'){
  const group=scoreGroupName(metric.id,null,language);
  return group===null?name:formatMessage(language,'metric.nutrientCompleteness',{name:group});
 }
 if(completeness&&metric.scope==='nutrient'){
  const nutrient=nutrientDisplayName({id:metric.id,name:null},language);
  return nutrient===null?name:formatMessage(language,'metric.nutrientCompleteness',{name:nutrient});
 }
 if(metric.kind==='carbohydrate'||completeness&&metric.scope==='carbohydrate'){
  const mode=metric.mode??definition?.mode;
  let label=mode==='total'||mode==='net'?nutrientDisplayName({id:mode==='net'?'netCarbohydrate':'carbs',name},language):formatMessage(language,'metric.trackedCarbohydrate');
  if(completeness)label=formatMessage(language,'metric.nutrientCompleteness',{name:label});
  return metric.mode===undefined&&mode!==undefined?formatMessage(language,'metric.tracked',{name:label}):label;
 }
 return name;
}
