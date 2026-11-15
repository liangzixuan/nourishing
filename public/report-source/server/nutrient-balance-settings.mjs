import {catalog} from './nutrient-catalog.mjs';
import {calciumAbsorptionIdentity} from './calcium-absorption.mjs';

const names=new Map(catalog.map(nutrient=>[nutrient.id,nutrient.name]));
export const nutrientBalancePairs=Object.freeze([['calcium','magnesium'],['potassium','sodium'],['zinc','copper'],['omega6','omega3'],['calcium','oxalate']].map(([numerator,denominator])=>Object.freeze({id:`${numerator}-${denominator}`,numerator:Object.freeze({id:numerator,name:names.get(numerator)}),denominator:Object.freeze({id:denominator,name:names.get(denominator)})})));
export const nutrientBalanceOptions=Object.freeze([
  ...nutrientBalancePairs.map(({id,numerator,denominator})=>Object.freeze({id,label:`${numerator.name} : ${denominator.name}`})),
  Object.freeze({id:'pral',label:'Potential renal acid load (PRAL)'}),
  calciumAbsorptionIdentity,
]);
const ids=new Set(nutrientBalanceOptions.map(option=>option.id));
const fail=message=>{throw Object.assign(new Error(message),{status:400});};
/** Missing preferences show all balances without writing settings. */
export function parseNutrientBalancePolicy(value){
  if(value===null||value===undefined)return null;
  if(typeof value!=='object'||Array.isArray(value)||Object.keys(value).length!==2||!Object.hasOwn(value,'version')||!Object.hasOwn(value,'hidden')||value.version!==1||!Array.isArray(value.hidden))fail('Choose version 1 with explicit hidden nutrient balances only.');
  const hidden=Array.from(value.hidden);if(hidden.some(id=>!ids.has(id))||new Set(hidden).size!==hidden.length)fail('Choose each known nutrient balance at most once.');
  return {version:1,hidden};
}
