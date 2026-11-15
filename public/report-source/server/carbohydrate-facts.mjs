import {carbohydrateLeaf,netCarbohydrateDefinition,carbohydrateLabel,carbohydrateDescription} from './carbohydrate-policy.mjs';
const modes=['total','net'],totalDefinition=Object.freeze({mode:'total',excluded:Object.freeze([])});
const empty=()=>({value:0,coverage:{known:0,total:0,complete:true},reasons:{}});
function scale(source,amount){
  if(source.value===null)return {...source,coverage:{...source.coverage},reasons:{...source.reasons}};
  const value=source.value*amount;
  return Number.isFinite(value)?{...source,value,coverage:{...source.coverage},reasons:{...source.reasons}}:{value:null,coverage:{...source.coverage,known:0,complete:false},reasons:{...source.reasons,'nonfinite-derived-value':(source.reasons['nonfinite-derived-value']??0)+source.coverage.known}};
}
/** Resolve each identity on the same source leaf before any combination. */
export function carbohydrateMeasurements(record,settings={},amount=1){
  const definitions={total:totalDefinition,net:netCarbohydrateDefinition(settings)};
  return Object.fromEntries(modes.map(mode=>{const definition=definitions[mode],leaf=definition?carbohydrateLeaf(record,definition):{value:null,reasons:['unconfigured-net-definition']};return [mode,scale({value:leaf.value,coverage:{known:leaf.value===null?0:1,total:1,complete:leaf.value!==null},reasons:Object.fromEntries(leaf.reasons.map(reason=>[reason,1]))},amount)];}));
}
/** Nonfood records have no carbohydrate leaves. Counts do not scale with servings. */
export function combineCarbohydrateMeasurements(results,amount=1){
  return Object.fromEntries(modes.map(mode=>{const combined=empty();for(const result of results){if(!result)continue;const source=scale(result[mode],amount);if(source.value!==null)combined.value+=source.value;combined.coverage.known+=source.coverage.known;combined.coverage.total+=source.coverage.total;combined.coverage.complete&&=source.coverage.complete;for(const[reason,count]of Object.entries(source.reasons))combined.reasons[reason]=(combined.reasons[reason]??0)+count;}if(combined.coverage.total>0&&combined.coverage.known===0)combined.value=null;return [mode,scale(combined,1)];}));
}
/** A missing Net definition never becomes zero through diary completion. */
export function projectCarbohydrates({settings={},measurements,targets,roundValue=value=>value,emptyIsUnknown=false}){
  const definitions={total:totalDefinition,net:netCarbohydrateDefinition(settings)};
  return Object.fromEntries(modes.map(mode=>{const definition=definitions[mode],source=measurements[mode],raw=!definition||emptyIsUnknown&&source.coverage.total===0?null:source.value,value=raw===null?null:roundValue(raw),row={definition:definition?{mode,excluded:[...definition.excluded]}:null,label:definition?carbohydrateLabel(definition):'Net carbohydrate',description:definition?carbohydrateDescription(definition):'Net carbohydrate definition is not set.',unit:'g',value,coverage:{...source.coverage,...(!definition?{known:0,complete:false}:{})},reasons:{...source.reasons}};if(targets){const target=targets[mode];row.target=target??null;row.remaining=raw!==null&&target!==null&&target!==undefined?roundValue(target-raw):null;}return [mode,row];}));
}
