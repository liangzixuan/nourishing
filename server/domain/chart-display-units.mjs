import Big from './energy-decimal.mjs';
import {metricInfo} from './chart-metrics.mjs';
import {weightKilogramsPerUnit,publicWeightUnits} from './weight-units.mjs';
import {convertEnergy} from './energy-units.mjs';

const Decimal=Big();
const lengthCentimetresPerUnit=Object.freeze({cm:'1',in:'2.54'});
const fail=()=>{throw Object.assign(Error('Choose a display unit supported by this chart metric.'),{status:400});};
function factors(metric){
 if(metric.kind!=='biometric')return null;
 if(['weight','Weight'].includes(metric.type))return weightKilogramsPerUnit;
 // Waist options are captured in phone-discover-20261108/chart-waist-unit-options.png.
 if(['waist size','height','Height'].includes(metric.type))return lengthCentimetresPerUnit;
 return null;
}
/** Display choices never change the source metric's exact type or unit. */
export function chartDisplayUnits(metric){
 const unit=metricInfo(metric).unit,table=factors(metric);
 if(table&&Object.hasOwn(table,unit))return [...new Set([unit,...(table===weightKilogramsPerUnit?publicWeightUnits:Object.keys(table))])];
 if(metric.kind==='energy'||metric.kind==='nutrient'&&metric.id==='calories')return ['kcal','kJ'];
 return unit===null?[]:[unit];
}
export function convertChartValue(value,metric,to){
 const from=metricInfo(metric).unit;if(!chartDisplayUnits(metric).includes(to))fail();
 if(value===null||from===to)return value;
 if(typeof value!=='number'||!Number.isFinite(value))fail();
 if(from==='kcal')return convertEnergy(value,from,to);
 const table=factors(metric);if(!table)fail();
 const converted=Number(new Decimal(value).times(table[from]).div(table[to]).toString());
 if(!Number.isFinite(converted))fail();return converted;
}
export function displayChartSeries(series,unit){
 if(!series.metric)return series;
 const displayUnits=chartDisplayUnits(series.metric);
 if(unit===undefined||unit===series.unit)return {...series,displayUnits};
 return {...series,unit,displayUnits,points:series.points.map(point=>({...point,value:convertChartValue(point.value,series.metric,unit)}))};
}
