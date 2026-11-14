import {lipidUnits} from './lipid-units.mjs';
import {chartDisplayUnits} from './chart-display-units.mjs';
import {glucoseConcentrationUnits} from './glucose-ketones.mjs';
import {bodyChartSource} from './body-chart-sources.mjs';
/** Source selection is shared by setting validation and chart capture. */
export function mobileChartBiometric(state,type,defaultUnit=null){
 const units=[...new Set((state.biometrics??[]).filter(row=>row.type===type&&typeof row.unit==='string').map(row=>row.unit))];
 return {kind:'biometric',type,unit:defaultUnit??(units.length===1?units[0]:null)};
}
export function mobileChartMetric(state,id,axis,settings,to='9999-12-31'){
 if(settings[axis])return settings[axis];
 if(axis==='primary'){
  if(['metric','weight-fat','weight-waist'].includes(id))return bodyChartSource(state,'weight',to).metric??mobileChartBiometric(state,'weight','kg');
  if(id==='nutrient')return {kind:'nutrient',id:'potassium'};
  if(id==='score')return {kind:'score',id:'overall'};
 }
 if(axis==='secondary'&&['weight-fat','weight-waist'].includes(id))return bodyChartSource(state,id==='weight-fat'?'bodyFat':'waist',to).metric??mobileChartBiometric(state,id==='weight-fat'?'body fat':'waist size',id==='weight-fat'?'%':'cm');
 return null;
}

export function mobileChartUnitChoices(state,id,axis,settings){
 if(id==='cgm'&&axis==='primary')return glucoseConcentrationUnits;
 if(id==='calcium'&&axis==='primary')return ['mg'];
 if(id==='lipids'&&axis==='primary')return lipidUnits;
 if(id==='gki'&&axis==='secondary')return glucoseConcentrationUnits;
 const metric=mobileChartMetric(state,id,axis,settings);return metric?chartDisplayUnits(metric):[];
}
