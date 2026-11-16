import {createMobileChartView} from './domain/mobile-chart-view.mjs';
import {parseMobileChartSettings,mobileChartTemplates} from './domain/mobile-chart-settings.mjs';
import {mobileChartUnitChoices} from './domain/mobile-chart-metrics.mjs';
import {chartDisplayUnits} from './domain/chart-display-units.mjs';
import {chartMetricOptions} from './chart-options.mjs';
import {act} from './domain/workspace.mjs';
import {digest} from './data-codec.mjs';
const fail=message=>{throw Object.assign(Error(message),{status:400,code:400,publicMessage:message});};
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);

export function chartSurfaceView(state,input,clock){
 const view=createMobileChartView(state,input,clock);
 return {...view,revision:digest(state),options:chartMetricOptions(state),saved:state.charts,cards:view.cards.map(card=>({...card,unitChoices:Object.fromEntries(['primary','secondary'].map(axis=>[axis,card.kind==='custom'?(card.definition[axis]?chartDisplayUnits(card.definition[axis]):[]):mobileChartUnitChoices(state,card.id,axis,card.settings)]))}))};
}
export function dashboardPinnedCharts(state,to,clock){return chartSurfaceView(state,{to,surface:'dashboard'},clock);}
export const chartDisplayCommandFields={'chart.display':['id','patch'],'chart.cycle-overlay':['id','enabled']};
export function applyChartDisplayCommand(state,action){
 if(!Object.hasOwn(chartDisplayCommandFields,action.type))return {handled:false};
 if(action.type==='chart.cycle-overlay')return {handled:true,result:act(state,action.type,action.payload)};
 const {id,patch}=action.payload;
 if(typeof id!=='string'||!object(patch)||!Object.keys(patch).length)fail('Choose chart settings.');
 const prefs=structuredClone(parseMobileChartSettings(state.settings?.mobileCharts,state));
 const custom=id.startsWith('custom:'),chartId=id.slice(7);
 if(custom){if(!(state.charts??[]).some(chart=>chart.id===chartId))fail('Choose an existing chart.');prefs.custom[chartId]={...prefs.custom[chartId],...patch};}
 else {if(!mobileChartTemplates.some(chart=>chart.id===id))fail('Choose an existing chart.');prefs.charts[id]={...prefs.charts[id],...patch};
  // A newly chosen source owns its unit. Retain other axis settings.
  for(const axis of ['primary','secondary'])if(Object.hasOwn(patch,axis)&&!Object.hasOwn(patch,axis+'Unit'))delete prefs.charts[id][axis+'Unit'];
 }
 return {handled:true,result:act(state,'settings.save',{mobileCharts:parseMobileChartSettings(prefs,state)})};
}
