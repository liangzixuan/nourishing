import {captureCompletenessGuidance} from './completeness-guidance.mjs';
/** Availability of resolved food data, without source-quality weighting. */
const method='local-food-leaf-completeness-v1';
const base=date=>({version:2,date,method,denominator:'food-leaf-occurrences'});

export function foodData(coverage){
  const {known,total}=coverage;
  return {known,total,percent:total>0?known/total*100:null};
}

function group(componentIds,rows){
  const selected=componentIds.map(id=>rows.get(id));
  // No food occurrences means no confidence claim, even on a completed day.
  const percent=selected.length&&selected.every(row=>row.percent!==null)?selected.reduce((sum,row)=>sum+row.percent,0)/selected.length:null;
  return {componentIds:[...componentIds],percent};
}

/** Membership is supplied by the score owner; this module never reads targets. */
export function projectDataCompleteness({date,nutrients,groups}){
  const rows=new Map(nutrients.map(row=>[row.id,row]));
  const projected=groups.map(({id,name,componentIds})=>({id,name,...group(componentIds,rows)}));
  const overall=projected.find(row=>row.id==='overall');
  return {...base(date),version:3,nutrients,groups:projected,overall:{componentIds:[...overall.componentIds],percent:overall.percent},limitations:captureCompletenessGuidance('daily')};
}

export function projectScoreDataCompleteness({date,componentIds,components}){
  return {...base(date),...group(componentIds,new Map(components.map(row=>[row.id,row.foodData]))),limitations:captureCompletenessGuidance('daily')};
}
