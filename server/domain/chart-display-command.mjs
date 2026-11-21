import {storeChartDefinition} from './chart-definition-store.mjs';
import {parseMobileChartSettings,mobileChartTemplates} from './mobile-chart-settings.mjs';
import {parseChart} from './chart-metrics.mjs';
const fail=message=>{throw Object.assign(Error(message),{status:400,code:400,publicMessage:message});};
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
export const chartDisplayCommandFields={'chart.display':['id','patch'],'chart.cycle-overlay':['id','enabled']};
export function applyChartDisplayCommand(state,action){
 if(!Object.hasOwn(chartDisplayCommandFields,action.type))return {handled:false};
 if(action.type==='chart.cycle-overlay'){applyChartPreference(state,action);return {handled:true};}
 const {id,patch}=action.payload;
 if(typeof id!=='string'||!object(patch)||!Object.keys(patch).length)fail('Choose chart settings.');
 const prefs=structuredClone(parseMobileChartSettings(state.settings?.mobileCharts,state));
 const custom=id.startsWith('custom:'),chartId=id.slice(7);
 if(custom){if(!(state.charts??[]).some(chart=>chart.id===chartId))fail('Choose an existing chart.');prefs.custom[chartId]={...prefs.custom[chartId],...patch};}
 else {if(!mobileChartTemplates.some(chart=>chart.id===id))fail('Choose an existing chart.');prefs.charts[id]={...prefs.charts[id],...patch};
  // A newly chosen source owns its unit. Retain other axis settings.
  for(const axis of ['primary','secondary'])if(Object.hasOwn(patch,axis)&&!Object.hasOwn(patch,axis+'Unit'))delete prefs.charts[id][axis+'Unit'];
 }
 state.settings={...state.settings,mobileCharts:parseMobileChartSettings(prefs,state)};
 return {handled:true};
}

export function applyChartPreference(state,action){
 const p=action.payload;
 if(action.type==='chart.display'){applyChartDisplayCommand(state,action);return;}
 if(action.type==='chart.save'){
  const chart=parseChart(p);chart.id??=crypto.randomUUID();
  return storeChartDefinition(state,chart);
 }
 if(action.type==='chart.cycle-overlay'){
  if(!object(p)||Object.keys(p).some(key=>!['id','enabled'].includes(key))||typeof p.id!=='string'||typeof p.enabled!=='boolean')fail('Choose a chart and whether to show cycle phases.');
  const chart=state.charts.find(row=>row.id===p.id);if(!chart)fail('Choose an existing chart.');chart.cycleOverlay=p.enabled;return;
 }
 fail('Choose a supported chart preference.');
}
