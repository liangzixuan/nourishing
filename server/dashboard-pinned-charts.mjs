import {createMobileChartView} from './domain/mobile-chart-view.mjs';
import {mobileChartUnitChoices} from './domain/mobile-chart-metrics.mjs';
import {chartDisplayUnits} from './domain/chart-display-units.mjs';
import {chartMetricOptions} from './chart-options.mjs';
import {digest} from './data-codec.mjs';
export {chartDisplayCommandFields,applyChartDisplayCommand} from './domain/chart-display-command.mjs';

export function chartSurfaceView(state,input,clock){
 const view=createMobileChartView(state,input,clock);
 return {...view,revision:digest(state),options:chartMetricOptions(state,view.preferences),saved:state.charts,cards:view.cards.map(card=>({...card,unitChoices:Object.fromEntries(['primary','secondary'].map(axis=>[axis,card.kind==='custom'?(card.definition[axis]?chartDisplayUnits(card.definition[axis]):[]):mobileChartUnitChoices(state,card.id,axis,card.settings)]))}))};
}
export function dashboardPinnedCharts(state,to,clock){return chartSurfaceView(state,{to,surface:'dashboard'},clock);}
