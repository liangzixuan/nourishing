import {parseCarbohydrateDefinition,CARBOHYDRATE_COMPONENTS} from './../server/carbohydrate-policy.mjs';
import {formatMessage} from './message-format.js';
const reviewMessage=(language,key,values)=>formatMessage(language,'carbohydrateReview.'+key,values);
const controlMessage=(language,key,values)=>formatMessage(language,'carbohydrateControls.'+key,values);
export function carbohydrateControlDescription(definition,language='en'){
 if(definition===null)return reviewMessage(language,'unconfigured-net-definition')+'.';
 const {mode,excluded}=parseCarbohydrateDefinition(definition);
 return controlMessage(language,mode==='total'?'description.total':excluded.length?'description.net':'description.none',{components:excluded.map(id=>controlMessage(language,'short.'+id)).join(', ')});
}

export function carbohydrateDisplayLabel(definition,language='en'){
 return controlMessage(language,definition===null?'net':parseCarbohydrateDefinition(definition).mode);
}
const reasonCodes=new Set(['unconfigured-net-definition','no-carbohydrate-basis','unknown-reported-net-method','conflicting-carbohydrate-paths','negative-derived-value','nonfinite-derived-value','no-known-intake','missing-target','zero-target']);
export function carbohydrateReasonText(id,language='en'){
 if(id.startsWith('missing:')){const component=id.slice(8);return reviewMessage(language,'missing',{component:CARBOHYDRATE_COMPONENTS.includes(component)?controlMessage(language,component):component});}
 return reasonCodes.has(id)?reviewMessage(language,id):id;
}
