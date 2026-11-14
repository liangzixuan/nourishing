import {catalog} from './nutrient-catalog.mjs';
import {sourceComponentCredit,sourceWeightedScore} from './source-score.mjs';
// CAk constructor order, including the minimizing sugar component uAk.
const weights={vitaminC:1,water:1,calcium:1,phosphorus:1,vitaminD:1,sugar:1};

export function oralScoreFacts(definition,totals,targets,coverage,{maximums,customScoreTargets}){
 const components=catalog.filter(n=>definition.selection.includes(n.id)).map(n=>{
  const c={...coverage[n.id]},value=c.known>0?totals[n.id]:null,ordinaryTarget=targets[n.id]??null,rule=n.id==='sugar'?'minimize':'progress';
  let target=ordinaryTarget,maximum=maximums.get(n.id)?.maximum??null,maximumOrigin=maximums.get(n.id)?.origin??null,targetOrigin='effective';
  if(rule==='minimize'){
   targetOrigin=customScoreTargets.sugar?'custom':'published';
   if(!customScoreTargets.sugar){maximum=100;maximumOrigin='published';}
   target=maximum;
  }
  const exclusion=target===null?'target-unavailable':target<=0?(rule==='minimize'?'zero-maximum':'target-disabled'):null;
  // Unlike measured intake, the formula input is always explicit. In particular,
  // vAk awards full sugar credit for missing intake when a positive max exists.
  const calculationValue=value??0,progress=exclusion===null?sourceComponentCredit({value:calculationValue,target,maximum,rule}):null;
  return {id:n.id,name:n.name,unit:n.unit,value,target,targetBasis:{kind:'oral-component',rule,maximum,maximumOrigin,targetOrigin,ordinaryTarget,calculationValue},coverage:c,included:exclusion===null,exclusion,progress,weight:null,points:null};
 });
 const base=sourceWeightedScore(components,weights),known=components.filter(row=>row.value!==null).length;
 return {components,componentIds:components.map(row=>row.id),score:{id:definition.id,name:definition.name,value:base,coverage:{known,total:components.length,complete:known===components.length&&components.every(row=>row.coverage.complete)},description:definition.description,method:definition.method}};
}
