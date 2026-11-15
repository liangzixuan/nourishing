import {parseChart} from './chart-metrics.mjs';
const fail=()=>{throw Object.assign(Error('Choose a name, nutrient or biometric series, optional second series, and cycle overlay for each report-only chart.'),{status:400});};
/** Report-only definitions have no saved identity, window or visibility. */
export function parsePrintChartDefinitions(value){
 if(value===undefined)return [];
 if(!Array.isArray(value))fail();
 return value.map(input=>{
  const keys=['name','primary','secondary','cycleOverlay'];
  if(!input||typeof input!=='object'||Object.keys(input).length!==keys.length||keys.some(key=>!Object.hasOwn(input,key))||typeof input.cycleOverlay!=='boolean')fail();
  const parsed=parseChart({version:2,...input,days:1,visible:false});
  const group=metric=>metric?.kind==='biometric'?'biometric':['nutrient','carbohydrate'].includes(metric?.kind)?'nutrient':null;
  if(!group(parsed.primary)||parsed.secondary!==null&&group(parsed.secondary)!==group(parsed.primary))fail();
  return {name:parsed.name,primary:parsed.primary,secondary:parsed.secondary,cycleOverlay:parsed.cycleOverlay};
 });
}
