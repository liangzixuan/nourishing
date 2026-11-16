import {projectMetricSeries} from './chart-metrics.mjs';

const finite=value=>typeof value==='number'&&Number.isFinite(value);
/** Retained public chart eDc: calcium intake × CalciumAbsorption score / 100.
 * The existing score owner retains formula substitutions and diary-group weights.
 * This is separate from the manual-equation nutrient-balance estimate. */
export function captureCalciumChart(days){
 const intake=projectMetricSeries(days,{kind:'nutrient',id:'calcium'});
 const captured=days.map((day,index)=>{
  const score=day.scores.find(row=>row.id==='calciumAbsorption'),calcium=intake.values[index],percentage=score?.display?.formulaValue;
  const candidate=finite(calcium)&&finite(percentage)?calcium*percentage/100:null;
  return {date:day.date,intake:calcium,absorption:finite(candidate)?candidate:null,
   score:score?{method:score.method,formulaValue:percentage,displayValue:score.value,coverage:{...score.coverage}}:null,
   inputs:Object.fromEntries(['calcium','oxalate','phytate'].map(id=>[id,{value:day.totals[id],coverage:{...day.nutrientCoverage[id]}}]))};
 });
 return {series:[
  {id:'calcium',name:'Calcium Intake',unit:'mg',axis:'left',metric:intake.metric,points:captured.map((row,index)=>({date:row.date,value:row.intake,coverage:days[index].nutrientCoverage.calcium})),capture:intake},
  {id:'absorption',name:'Calcium Absorption',unit:'mg',axis:'left',points:captured.map(row=>({date:row.date,value:row.absorption,coverage:row.score?.coverage??null}))},
 ],axisUnits:[{key:'primaryUnit',unit:'mg',choices:['mg']}],capture:{method:'public-web-calcium-chart-v1',expression:'intakeMg * absorptionScorePercent / 100',days:captured}};
}
