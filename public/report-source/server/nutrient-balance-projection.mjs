import {captureBalanceGuidance} from './balance-guidance.mjs';
import {mergeSourceAttributions} from './catalog-source.mjs';
import {catalog} from './nutrient-catalog.mjs';
import Big from './../vendor/big.js/7.0.1/big.mjs';
import {nutrientBalanceOptions,parseNutrientBalancePolicy} from './nutrient-balance-settings.mjs';
import {calciumAbsorptionInputs,projectCalciumAbsorption,captureCalciumAbsorption} from './calcium-absorption.mjs';

const fail=message=>{throw Object.assign(new Error(message),{status:400});};
const nutrients=new Map(catalog.map(nutrient=>[nutrient.id,nutrient]));
const Decimal=Big();Decimal.DP=340;
const labels=new Map(nutrientBalanceOptions.map(option=>[option.id,option.label]));
const references=Object.freeze({'calcium-magnesium':[1.7,2.8,true],'potassium-sodium':[2,10,true],'zinc-copper':[8,15,true],'omega6-omega3':[1,4,true],'calcium-oxalate':[1.3,null,false]});
const referenceSource='https://ods.od.nih.gov/HealthInformation/nutrientrecommendations.aspx';
const pralInputs=Object.freeze([['protein','g',0.49],['phosphorus','mg',0.037],['potassium','mg',-0.021],['magnesium','mg',-0.026],['calcium','mg',-0.013]]);
const pralFormula=Object.freeze({id:'pral-2018',expression:'0.49 × protein(g) + 0.037 × phosphorus(mg) − 0.021 × potassium(mg) − 0.026 × magnesium(mg) − 0.013 × calcium(mg)',sourceUrl:'https://pmc.ncbi.nlm.nih.gov/articles/PMC3946957/',researchUrl:'https://pmc.ncbi.nlm.nih.gov/articles/PMC3946957/'});
const pairs=[['calcium-magnesium','calcium','magnesium','mg'],['potassium-sodium','potassium','sodium','mg'],['zinc-copper','zinc','copper','mg'],['omega6-omega3','omega6','omega3','g'],['calcium-oxalate','calcium','oxalate','mg']].map(([id,numerator,denominator,unit])=>{
  const left=nutrients.get(numerator),right=nutrients.get(denominator);
  if(!left||!right||left.unit!==unit||right.unit!==unit)fail('Nutrient ratio inputs must have established matching catalog units.');
  return {id,numerator:left,denominator:right,label:labels.get(id)};
});
function inputFacts(day,nutrient){
  const raw=day.totals[nutrient.id],source=day.nutrientCoverage[nutrient.id],value=Number.isFinite(raw)&&(day.complete||source.total>0)?raw:null,coverage={known:source.known,total:source.total,complete:source.complete};
  const status=value===null?'unknown':!coverage.complete?'partial':day.complete&&value===0&&coverage.total===0?'completion-zero':'complete';
  return {id:nutrient.id,name:nutrient.name,unit:nutrient.unit,value,coverage,status};
}
function inputReason(inputs){
  return inputs.some(input=>input.status==='unknown')?'unknown-input':inputs.some(input=>input.status==='partial')?'partial-input':null;
}
function ratioProjection(pair,numerator,denominator,sums){
  let value=null,reason=inputReason([numerator,denominator]);
  const left=sums?.[0]??(numerator.value===null?null:new Decimal(numerator.value)),right=sums?.[1]??(denominator.value===null?null:new Decimal(denominator.value));
  if(reason===null&&right.eq(0))reason='zero-denominator';
  if(reason===null){const ratio=Number(left.div(right).toString());if(Number.isFinite(ratio))value=ratio;else reason='non-finite-result';}
  const [low,high,lowInclusive]=references[pair.id],reference={low,high,lowInclusive,status:value===null?'unknown':value<low||!lowInclusive&&value===low?'below':high!==null&&value>high?'above':'within',sourceUrl:referenceSource};
  return {id:pair.id,label:pair.label,numerator,denominator,value,reason,reference};
}
function pralFacts(day){
  return pralInputs.map(([id,unit])=>{const nutrient=nutrients.get(id);if(nutrient?.unit!==unit)fail('PRAL inputs must use their established catalog units.');return inputFacts(day,nutrient);});
}
function pralProjection(facts,override={}){
  const terms=facts.map((facts,index)=>facts.value===null?null:new Decimal(facts.value).times(pralInputs[index][2]));
  const inputs=facts.map((facts,index)=>{const term=override.terms?.[index]??terms[index],contribution=term===null?null:Number(term.toString());return {...facts,coefficient:pralInputs[index][2],contribution:Number.isFinite(contribution)?contribution:null};});
  let value=null,reason=inputReason(inputs);
  if(reason===null){const total=Number((override.total??terms.reduce((sum,term)=>sum.plus(term),new Decimal(0))).toString());if(Number.isFinite(total))value=total;else reason='non-finite-result';}
  return {id:'pral',label:labels.get('pral'),unit:'mEq/day',value,reason,inputs,formula:{...pralFormula}};
}
const calciumFacts=day=>calciumAbsorptionInputs.map(nutrient=>inputFacts(day,nutrient));
export function projectNutrientBalances(day,rawPolicy){
  const policy=parseNutrientBalancePolicy(rawPolicy);
  const results=pairs.map(pair=>ratioProjection(pair,inputFacts(day,pair.numerator),inputFacts(day,pair.denominator)));
  return {version:3,attributions:mergeSourceAttributions(day.attributions),date:day.date,logged:day.logged,complete:day.complete,pairs:results,pral:pralProjection(pralFacts(day)),calciumAbsorption:projectCalciumAbsorption(calciumFacts(day)),policy,displayOptions:nutrientBalanceOptions.map(option=>({...option})),limitations:captureBalanceGuidance('day')};}

/** Every balance selects one common set of complete dates for all its inputs. */
function pool(days,select,evaluate){
  const counts={eligible:days.length,used:0,unknown:0,partial:0,nonFinite:0,completionZero:0},used=[];
  for(const day of days){
    const facts=select(day),reason=inputReason(facts);
    if(reason==='unknown-input'){counts.unknown++;continue;}
    if(reason==='partial-input'){counts.partial++;continue;}
    if(evaluate(facts).reason==='non-finite-result'){counts.nonFinite++;continue;}
    used.push(facts);counts.used++;
    if(facts.some(input=>input.status==='completion-zero'))counts.completionZero++;
  }
  return {days:counts,used};
}
function meanInputs(used,required){
  const sums=required.map((_,index)=>used.reduce((sum,facts)=>sum.plus(facts[index].value),new Decimal(0)));
  const inputs=required.map((nutrient,index)=>{
    const known=used.reduce((sum,facts)=>sum+facts[index].coverage.known,0),total=used.reduce((sum,facts)=>sum+facts[index].coverage.total,0),raw=used.length?Number(sums[index].div(used.length).toString()):null,value=Number.isFinite(raw)?raw:null;
    return {id:nutrient.id,name:nutrient.name,unit:nutrient.unit,value,coverage:{known,total,complete:used.length>0},status:value===null?'unknown':value===0&&total===0?'completion-zero':'complete'};
  });
  return {inputs,sums};
}
export function captureNutrientBalances(days,rawPolicy,{from,to}){
  const policy=parseNutrientBalancePolicy(rawPolicy),results=pairs.map(pair=>{
    const selected=pool(days,day=>[inputFacts(day,pair.numerator),inputFacts(day,pair.denominator)],facts=>ratioProjection(pair,...facts));
    const {inputs,sums}=meanInputs(selected.used,[pair.numerator,pair.denominator]),result=ratioProjection(pair,...inputs,sums);
    if(!selected.days.used){result.value=null;result.reason='no-complete-days';}
    return {...result,days:selected.days};
  });
  const selected=pool(days,pralFacts,pralProjection),{inputs,sums}=meanInputs(selected.used,pralInputs.map(([id])=>nutrients.get(id)));
  const terms=sums.map((sum,index)=>sum.times(pralInputs[index][2])),count=selected.days.used;
  const pral=pralProjection(inputs,count?{terms:terms.map(term=>term.div(count)),total:terms.reduce((sum,term)=>sum.plus(term),new Decimal(0)).div(count)}:{});
  if(!count){pral.value=null;pral.reason='no-complete-days';}
  pral.days=selected.days;
  return {version:3,attributions:mergeSourceAttributions(...days.map(day=>day.attributions)),scope:'period',from,to,policy,displayOptions:nutrientBalanceOptions.map(option=>({...option})),pairs:results,pral,calciumAbsorption:captureCalciumAbsorption(days.map(calciumFacts)),limitations:captureBalanceGuidance('period')};}
