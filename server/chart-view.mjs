import {digest} from './data-codec.mjs';
import {createChartFacts,projectChart,metricOptions,chartRange} from './domain/chart-metrics.mjs';
import {exportReport} from './domain/report-exports.mjs';
const fail=message=>{throw Object.assign(Error(message),{code:400,publicMessage:message});};
export function chartView(state,range){
 const facts=createChartFacts(state,range);
 const definitions=[{id:'energy',name:'Energy',primary:{kind:'nutrient',id:'calories'},secondary:{kind:'energy',id:'expenditure'}},...(state.charts??[]).filter(c=>c.visible).map(c=>({...c,custom:true}))];
 return {revision:digest(state),range,options:metricOptions(state),saved:state.charts,charts:definitions.map(({custom,...c})=>({...c,custom:custom??false,chart:projectChart(facts.rows,c.primary,c.secondary,custom?chartRange(c,range.to):range)}))};
}
export function csvReport(state,input){
 if(!input||Object.keys(input).some(k=>!['kind','from','to','includeGroups','energyUnit'].includes(k)))fail('Choose a report and date range.');
 return exportReport(state,input);
}
