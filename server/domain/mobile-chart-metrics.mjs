import {lipidUnits} from './lipid-units.mjs';
import {chartDisplayUnits} from './chart-display-units.mjs';
import {glucoseConcentrationUnits} from './glucose-ketones.mjs';
import {bodyChartSource} from './body-chart-sources.mjs';
export const sleepStageOptions=Object.entries({deep:'Sleep Deep',light:'Sleep Light',rem:'Sleep REM'})
 .map(([stage,name])=>({metric:{kind:'sleep-stage',stage},name,unit:'h'}));
export function parseSleepStageMetric(input){
 const option=sleepStageOptions.find(row=>row.metric.stage===input.stage);
 if(!option||Object.keys(input).some(key=>!['kind','stage'].includes(key)))throw Object.assign(Error('Choose a recorded sleep stage.'),{status:400});
 return {...option.metric};
}
/** Source selection is shared by setting validation and chart capture. */
export function mobileChartBiometric(state,type,defaultUnit=null,to='9999-12-31'){
 const units=[...new Set((state.biometrics??[]).filter(row=>row.type===type&&row.date<=to&&Number.isFinite(row.value)&&typeof row.unit==='string'&&row.unit.trim()&&row.unit.length<=30).map(row=>row.unit))];
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
 const metric=mobileChartMetric(state,id,axis,settings);
 if(metric?.kind==='sleep-stage')return ['h'];
 return metric?chartDisplayUnits(metric):[];
}
