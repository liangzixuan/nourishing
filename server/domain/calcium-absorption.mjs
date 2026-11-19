import {captureBalanceGuidance} from './balance-guidance.mjs';
import Big from 'big.js';
import {catalog} from './nutrient-catalog.mjs';

export const calciumAbsorptionIdentity=Object.freeze({id:'calcium-absorption',label:'Published calcium-absorption estimate'});
export const calciumAbsorptionInputs=Object.freeze(['calcium','oxalate','phytate'].map(id=>{
  const nutrient=catalog.find(row=>row.id===id);
  if(nutrient?.unit!=='mg')throw Error('Calcium absorption inputs must use canonical milligrams.');
  return Object.freeze({id,name:nutrient.name,unit:nutrient.unit});
}));
const formula=Object.freeze({
  id:'calcium-absorption-manual-0.0946',
  expression:'A = C × (0.889 − 0.0946 × ln(C) − O − 0.060 × P); C in mg, O and P in g',
  sourceUrl:'https://ods.od.nih.gov/factsheets/Calcium-HealthProfessional/',
  researchUrl:'https://doi.org/10.1016/j.tjnut.2023.12.005',
  coefficientDiscrepancy:'The reference formula uses 0.0946; the cited research equation uses 0.0964. This estimate uses the 0.0946 coefficient.',
});
const Decimal=Big();Decimal.DP=340;
const copyInput=({id,name,unit,value,coverage,status})=>({id,name,unit,value,coverage:{known:coverage.known,total:coverage.total,complete:coverage.complete},status});
const base=inputs=>({...calciumAbsorptionIdentity,unit:'mg',value:null,fraction:null,rawFraction:null,reason:null,inputs,formula:{...formula},limitations:captureBalanceGuidance('calcium-day')});

/** Input availability and coverage are supplied by the shared balance owner. */
export function projectCalciumAbsorption(facts){
  if(!Array.isArray(facts)||facts.length!==3||facts.some((row,index)=>row.id!==calciumAbsorptionInputs[index].id||row.unit!=='mg'))throw Error('Supply calcium, oxalate and phytate input facts in canonical milligrams.');
  const inputs=facts.map(copyInput),result=base(inputs);
  if(inputs.some(row=>row.status==='unknown'))result.reason='unknown-input';
  else if(inputs.some(row=>row.status==='partial'))result.reason='partial-input';
  else if(inputs[0].value<=0)result.reason='non-positive-calcium';
  else{
    const [calcium,oxalateMg,phytateMg]=inputs.map(row=>row.value);
    const rawFraction=0.889-0.0946*Math.log(calcium)-oxalateMg/1000-0.060*(phytateMg/1000),value=calcium*rawFraction;
    if(Number.isFinite(rawFraction))result.rawFraction=rawFraction;
    if(!Number.isFinite(rawFraction)||!Number.isFinite(value))result.reason='non-finite-result';
    else if(rawFraction<0||rawFraction>1)result.reason='fraction-out-of-range';
    else{result.fraction=rawFraction;result.value=value;}
  }
  return result;
}

/** This nonlinear model averages accepted daily estimates, never pooled inputs. */
export function captureCalciumAbsorption(inputDays){
  const days={eligible:inputDays.length,used:0,unknown:0,partial:0,nonPositiveCalcium:0,outOfRange:0,nonFinite:0},accepted=[];
  const rejected={'unknown-input':'unknown','partial-input':'partial','non-positive-calcium':'nonPositiveCalcium','fraction-out-of-range':'outOfRange','non-finite-result':'nonFinite'};
  for(const facts of inputDays){const result=projectCalciumAbsorption(facts);if(result.reason===null){accepted.push(result);days.used++;}else days[rejected[result.reason]]++;}
  const mean=values=>values.length?Number(values.reduce((sum,value)=>sum.plus(value),new Decimal(0)).div(values.length).toString()):null;
  const inputs=calciumAbsorptionInputs.map((identity,index)=>{
    const rows=accepted.map(day=>day.inputs[index]),value=mean(rows.map(row=>row.value)),known=rows.reduce((sum,row)=>sum+row.coverage.known,0),total=rows.reduce((sum,row)=>sum+row.coverage.total,0);
    return {...identity,value,coverage:{known,total,complete:days.used>0},status:value===null?'unknown':value===0&&total===0?'completion-zero':'complete'};
  });
  const fraction=mean(accepted.map(day=>day.fraction));
  return {...base(inputs),value:mean(accepted.map(day=>day.value)),fraction,rawFraction:fraction,reason:days.used?null:'no-valid-days',days,limitations:captureBalanceGuidance('calcium-period')};}
