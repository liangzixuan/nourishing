import {catalog} from './nutrient-catalog.mjs';
import {sourceComponentCredit,sourceWeightedScore,sourceMacroTarget} from './source-score.mjs';
/** MAk/g1k use fractional years, not completed age bands. UTC date instants
 * keep the same saved date deterministic in server and disconnected clients.
 * A missing birth date is explicitly a calculation default, never a known age. */
export function plantProteinReference(policy,date){
 const ageYears=policy===null?null:Math.max(0,(Date.parse(date+'T00:00:00Z')-Date.parse(policy.birthDate+'T00:00:00Z'))/31556930400);
 const age=ageYears??0,sex=policy?.sex??null,lifeStage=policy?.lifeStage??null;
 const value=age<=.5?9.1:age<=1?11:age<=3?13:age<=8?19:age<=13?34:sex==='male'?(age<=18?52:56):['pregnant','lactating'].includes(lifeStage)?71:46;
 return {value,ageYears,sex,lifeStage,ageBasis:policy===null?'missing-birthday-zero':'utc-calendar-days'};
}

function plantTarget(id,resolved,inputs,macro){
 // uQk clears the source custom flag for dynamic macros. A local explicit
 // maximum remains an intentional override; saved fixed targets do not.
 const dynamic=['ratio','keto'].includes(macro.sources.protein);
 const origin=id==='iron'?inputs.ironOrigin:macro.sources.protein==='weekday'?'weekday':inputs.proteinMaximumCustom?'custom-maximum':dynamic?null:inputs.proteinOrigin;
 const reference=origin===null&&resolved.target!==null?(id==='iron'?{value:resolved.target*1.8,factor:1.8}:structuredClone(inputs.proteinReference)):null;
 const target=origin!==null?resolved.target:reference?.value??null;
 const maximum=origin!==null?resolved.maximum:reference!==null&&resolved.maximum!==null?Math.max(target,resolved.maximum):null;
 return {target,maximum,origin:maximum===null?null:resolved.origin,basis:{kind:'source-plant',origin:origin??'reference',ordinaryTarget:resolved.target,ordinaryMaximum:resolved.maximum,ordinaryReference:id==='iron'?structuredClone(inputs.ironReference):null,reference}};
}
/** Fixed-member groups inherit the source Pyk/Wzk calculation. The selection
 * retains constructor order; display order remains the catalog's order. */
export function progressScoreFacts(definition,totals,targets,coverage,{maximums,macroTargets,antioxidantTargets,plantTargets}){
 const selected=definition.selection.filter(id=>definition.targetSelection!=='non-null'||targets[id]!=null);
 const weights=Object.fromEntries(selected.map(id=>[id,1]));
 const components=catalog.filter(n=>Object.hasOwn(weights,n.id)).map(n=>{
  const c={...coverage[n.id]},value=c.known>0?totals[n.id]:null,ordinaryTarget=targets[n.id]??null;
  let resolved=n.id==='protein'?sourceMacroTarget(macroTargets,'protein',maximums):{target:ordinaryTarget,maximum:maximums.get(n.id)?.maximum??null,origin:maximums.get(n.id)?.origin??null};
  const antioxidant=definition.id==='antioxidants'?antioxidantTargets[n.id]:null;
  if(antioxidant?.origin==='published')Object.assign(resolved,{target:antioxidant.reference.value,maximum:null,origin:null});
  if(definition.id==='plant'&&['protein','iron'].includes(n.id))resolved=plantTarget(n.id,resolved,plantTargets,macroTargets);
  const {target,maximum,origin:maximumOrigin}=resolved,exclusion=target===null?'target-unavailable':target<=0?'target-disabled':null,calculationValue=value??0;
  return {id:n.id,name:n.name,unit:n.unit,value,target,targetBasis:resolved.basis?{...resolved.basis,maximum,maximumOrigin,calculationValue}:antioxidant?{kind:'source-antioxidant',...structuredClone(antioxidant),maximum,maximumOrigin,calculationValue}:{kind:'source-progress',maximum,maximumOrigin,ordinaryTarget,calculationValue},coverage:c,included:exclusion===null,exclusion,progress:exclusion===null?sourceComponentCredit({value:calculationValue,target,maximum}):null,weight:null,points:null};
 });
 const score=sourceWeightedScore(components,weights),known=components.filter(row=>row.value!==null).length;
 return {components,componentIds:components.map(row=>row.id),score:{id:definition.id,name:definition.name,value:score,coverage:{known,total:components.length,complete:components.length>0&&known===components.length&&components.every(row=>row.coverage.complete)},description:definition.description,method:definition.method}};
}
