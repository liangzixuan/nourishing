import {catalog} from './nutrient-catalog.mjs';
import {sourceComponentCredit,sourceWeightedScore} from './source-score.mjs';

import {sourceNutrients} from './source-nutrient-registry.mjs';

const identities=new Map([...catalog.map(n=>[n.id,n]),['netCarbohydrate',{id:'netCarbohydrate',name:'Net carbohydrate',unit:'g'}]]);
/** PAk selects the effective target map. It does not evaluate target-bar getters. */
export function overallScoreFacts(definition,totals,targets,coverage,{carbohydrates,hiddenNutrients}){
 const components=sourceNutrients.map(({id,sourceId,sourceUnit})=>{
  const identity=identities.get(id);if(!identity)throw Error('Unmapped Overall nutrient: '+id);
  const carbohydrate=id==='carbs'?carbohydrates.total:id==='netCarbohydrate'?carbohydrates.net:null;
  const c={...(carbohydrate?carbohydrate.coverage:coverage[id])},value=c.known>0?(carbohydrate?carbohydrate.value:totals[id]):null,target=(carbohydrate?carbohydrate.target:targets[id])??null,visible=!hiddenNutrients.has(id);
  const exclusion=!visible?'hidden':target===null?'target-unavailable':target<=0?'target-disabled':null;
  return {id,name:identity.name,unit:identity.unit,value,target,targetBasis:{kind:'source-overall',sourceId,sourceUnit,visible,calculationValue:value??0,carbohydrateDefinition:carbohydrate?structuredClone(carbohydrate.definition):null},coverage:c,included:exclusion===null,exclusion,progress:exclusion===null?sourceComponentCredit({value,target,maximum:null}):null,weight:null,points:null};
 });
 const selected=components.filter(row=>row.included),weights=Object.fromEntries(selected.map(row=>[row.id,1])),value=sourceWeightedScore(components,weights),known=selected.filter(row=>row.value!==null).length;
 return {components,componentIds:selected.map(row=>row.id),score:{id:definition.id,name:definition.name,value,coverage:{known,total:selected.length,complete:selected.length>0&&known===selected.length&&selected.every(row=>row.coverage.complete)},description:definition.description,method:definition.method}};
}
