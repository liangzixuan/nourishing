import {catalog} from './nutrient-catalog.mjs';
/** Public web CalciumAbsorptionNutritionScore (jzk/kzk/lzk).
 * Inputs are resolved diary records, with milligram values and leaf coverage
 * supplied by the nutrition owner. This never reads targets or treats a
 * calculation default as a measured value. */
export const calciumScoreNutrients=Object.freeze(['calcium','oxalate','phytate']);
export const calciumScoreMethod='public-web-calcium-absorption-v1';

function emptyInput(id){return {id,unit:'mg',value:null,calculationValue:0,coverage:{known:0,total:0,complete:true}};}
function addInput(input,facts){
 const coverage=facts.coverage[input.id],value=facts.values[input.id];
 input.coverage.known+=coverage.known;input.coverage.total+=coverage.total;input.coverage.complete&&=coverage.complete;
 if(coverage.known>0&&value!==null){input.calculationValue+=value;input.value=(input.value??0)+value;}
}
/** Java DoubleSummaryStatistics accumulation used by Wbp/O1o/P1o. */
function sourceSum(values){let sum=0,correction=0,simple=0;for(const value of values){simple+=value;const corrected=value-correction,next=sum+corrected;correction=next-sum-corrected;sum=next;}const result=sum+correction;return Number.isNaN(result)&&!Number.isFinite(simple)?simple:result;}
function percent(inputs){const [calcium,oxalate,phytate]=inputs.map(r=>r.calculationValue);return Math.max(.889-.0964*Math.log(Math.max(1,calcium))-oxalate/1000-.06*phytate/1000,0)*100;}

/** Group identity is a date plus the diary group, never a timestamp. Records
 * with facts:null represent notes, biometrics or exercise: they form a context
 * but do not contribute nutrient measurements. Callers normalize missing group
 * identities once and apply selection/supplement filters before this boundary. */
export function calculateCalciumScore(records,{showGroups}){
 const dates=new Map(),groups=[],inputs=calciumScoreNutrients.map(emptyInput);
 for(const record of records){
  let dateGroups=dates.get(record.date);if(!dateGroups){dateGroups=new Map();dates.set(record.date,dateGroups);}
  const key=showGroups?record.group:null;let group=dateGroups.get(key);
  if(!group){group={date:record.date,group:key,recordCount:0,foodEntryCount:0,inputs:calciumScoreNutrients.map(emptyInput)};dateGroups.set(key,group);groups.push(group);}
  group.recordCount++;
  if(record.facts!==null){group.foodEntryCount++;for(let i=0;i<inputs.length;i++){addInput(group.inputs[i],record.facts);addInput(inputs[i],record.facts);}}
 }
 for(const group of groups){group.rawValue=percent(group.inputs);group.calciumWeight=0;}
 const calcium=sourceSum(groups.map(g=>g.inputs[0].calculationValue));let rawValue,aggregation;
 if(groups.length===0){rawValue=88.9;aggregation='empty-default';}
 else if(calcium>0){let numerator=0;for(const group of groups){const amount=group.inputs[0].calculationValue;group.calciumWeight=amount/calcium;numerator+=group.rawValue*amount;}rawValue=numerator/calcium;aggregation='calcium-weighted';}
 else{rawValue=sourceSum(groups.map(g=>g.rawValue))/groups.length;aggregation='mean-contexts';}
 return {id:'calciumAbsorption',method:calciumScoreMethod,value:Math.round(rawValue),rawValue,aggregation,grouping:showGroups?'date-and-diary-group':'date',inputs,groups};
}

export function calciumScoreFacts(definition,capture){
 const components=capture.inputs.map(input=>({id:input.id,name:catalog.find(n=>n.id===input.id).name,unit:'mg',value:input.value,target:null,targetBasis:{kind:'calcium-input',calculationValue:input.calculationValue},coverage:{...input.coverage},included:true,exclusion:null,progress:null,weight:null,points:null}));
 const known=components.filter(r=>r.value!==null).length;
 return {components,componentIds:[...calciumScoreNutrients],score:{id:definition.id,name:definition.name,value:capture.rawValue,coverage:{known,total:3,complete:known===3&&components.every(r=>r.coverage.complete)},description:definition.description,method:definition.method},calculation:{rawValue:capture.rawValue,aggregation:capture.aggregation,grouping:capture.grouping,groups:structuredClone(capture.groups)}};
}
