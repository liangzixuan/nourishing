import Big from 'big.js';
import {catalog} from './nutrient-catalog.mjs';
// SDK fields denote nutrient mass, not activity equivalents. RAE/DFE and
// alpha-tocopherol equivalents have no confirmed matching SDK basis here.
const mappings=[['calories','energy'],['protein','protein'],['carbs','totalCarbohydrate'],['fat','totalFat'],['fiber','dietaryFiber'],...['caffeine','calcium','chloride','cholesterol','chromium','copper','folicAcid','iodine','iron','magnesium','manganese','molybdenum','monounsaturatedFat','niacin','pantothenicAcid','phosphorus','polyunsaturatedFat','potassium','riboflavin','saturatedFat','selenium','sodium','sugar','thiamin','transFat','vitaminB12','vitaminB6','vitaminC','vitaminD','vitaminK','zinc','biotin'].map(id=>[id,id])];
export const healthNutritionFields=Object.freeze(mappings.map(([id,field])=>{const n=catalog.find(n=>n.id===id);return Object.freeze({id,field,name:n.name,unit:n.unit,nativeUnit:id==='calories'?'kcal':'g'});}));
const mapped=new Set(mappings.map(([id])=>id));
const factor={g:'1',mg:'0.001','µg':'0.000001',kcal:'1'};
export function knownHealthNutrient(facts,id){return facts.coverage[id]?.complete===true&&facts.coverage[id].total>0&&typeof facts.nutrients[id]==='number'&&Number.isFinite(facts.nutrients[id])&&facts.nutrients[id]>=0;}
export function projectHealthNutrition(facts){
 const nutrients={},details=[],omissions=[];
 const omit=(nutrient,code,text)=>omissions.push({id:nutrient.id,name:nutrient.name,code,text});
 for(const mapping of healthNutritionFields){
  if(!knownHealthNutrient(facts,mapping.id)){if(facts.coverage[mapping.id]?.known>0)omit(mapping,'partial',mapping.name+': only partially known.');continue;}
  const value=facts.nutrients[mapping.id],converted=Number(new Big(value).times(factor[mapping.unit]));
  if(!Number.isFinite(converted)){omit(mapping,'nonfinite',mapping.name+': converted amount is not finite.');continue;}
  nutrients[mapping.field]=converted;details.push({id:mapping.id,name:mapping.name,value,unit:mapping.unit});
 }
 for(const n of catalog)if(!mapped.has(n.id)&&facts.coverage[n.id]?.known>0){
  const code=n.id==='water'?(facts.attributions.length?'water-attributed':'water-export'):'unsupported';
  omit(n,code,n.name+': no matching nutrient field in this export'+(n.id==='water'?(facts.attributions.length?'; retained in the attributed Nourish data export because Health Connect hydration cannot retain source credits.':'; available through food-water export.'):'.'));
 }
 return {record:{nutrients,details:details.map(({id,...detail})=>detail),omitted:omissions.map(item=>item.text),attributions:facts.attributions},presentation:{details,omissions}};
}
