import {sourceComponentCredit,sourceWeightedScore,sourceMacroTarget} from './source-score.mjs';
import {catalog} from './nutrient-catalog.mjs';
import {nutritionScoreDescription} from './nutrition-score-policy.mjs';

// Source: public build 462A37A7CB87811B30713434A43219D0,
// Ozk/Pyk/Wzk/Pzk/cAk/vAk; see evidence/score-components-public-source.json.
// The fixed denominator includes unmeasured/disabled components as zero credit.
const weights={netCarbohydrate:0,protein:1,fat:10,sodium:1,potassium:1,magnesium:1,water:1,fiber:1};


/** Read-only projection. Missing source intake contributes zero, but its
 * measured value and coverage remain unknown in the returned evidence. */
export function ketoScoreFacts(definition,totals,targets,coverage,carbohydrate,{maximums,macroTargets,customScoreTargets}){
 const active=sourceMacroTarget(macroTargets,'carbohydrate',maximums),protein=sourceMacroTarget(macroTargets,'protein',maximums),fat=sourceMacroTarget(macroTargets,'fat',maximums);
 const components=catalog.filter(n=>definition.selection.includes(n.id)).map(n=>{
  let id=n.id,name=n.name,c={...coverage[id]},value=c.known>0?totals[id]:null,target=targets[id]??null,maximum=maximums.get(id)?.maximum??null,maximumOrigin=maximums.get(id)?.origin??null,rule='progress',targetOrigin='effective',exclusion=null;
  const ordinaryTarget=target;
  if(id==='carbs'){
   id='netCarbohydrate';name='Net carbohydrate';rule='minimize';
   if(carbohydrate.definition.mode==='net'){c={...carbohydrate.coverage};value=c.known>0?carbohydrate.value:null;maximum=active.maximum;maximumOrigin=active.origin;target=maximum;}
   else{c={known:0,total:carbohydrate.coverage.total,complete:false};value=null;target=null;maximum=null;maximumOrigin=null;exclusion='net-required';}
  }else if(id==='protein'){target=protein.target;maximum=protein.maximum;maximumOrigin=protein.origin;rule='protein';}
  else if(id==='fat'){target=fat.target;maximum=null;maximumOrigin=null;}
  else if(id==='sodium'){targetOrigin=customScoreTargets.sodium?'custom':'published';if(!customScoreTargets.sodium){target=4000;maximum=null;maximumOrigin=null;}}
  exclusion??=target===null?'target-unavailable':target<=0?(rule==='minimize'?'zero-maximum':'target-disabled'):value===null?'unmeasured':null;
  const progress=exclusion===null?sourceComponentCredit({value,target,maximum,rule}):null;
  return {id,name,unit:n.unit,value,target,targetBasis:{kind:'keto-component',rule,maximum,maximumOrigin,targetOrigin,ordinaryTarget},coverage:c,included:exclusion===null,exclusion,progress,weight:null,points:null};
 });
 const baseValue=sourceWeightedScore(components,weights);
 const value=carbohydrate.coverage.known>0?carbohydrate.value:null,maximum=active.maximum;
 const penalty=maximum!==null&&value!==null&&value>maximum?Math.min(baseValue,(value-maximum)/2):0;
 const gate={mode:carbohydrate.definition.mode,value,maximum,maximumOrigin:active.origin,baseValue,penalty,status:maximum===null?'not-set':value===null?'unmeasured':value>maximum?'above':'within'};
 const known=components.filter(row=>row.value!==null).length;
 // Qyk includes every constructor component, including zero-weight Net in Total mode.
 return {components,confidenceComponentIds:components.map(row=>row.id),componentIds:components.filter(row=>row.exclusion!=='net-required').map(row=>row.id),score:{id:definition.id,name:definition.name,value:baseValue-penalty,coverage:{known,total:components.length,complete:known===components.length&&components.every(row=>row.coverage.complete)},description:nutritionScoreDescription(definition,gate),method:definition.method,gate}};
}
