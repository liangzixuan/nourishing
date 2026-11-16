import test from 'node:test';
import assert from 'node:assert/strict';
import {initialState,act} from '../server/domain/workspace.mjs';
import {chartSurfaceView,dashboardPinnedCharts,applyChartDisplayCommand} from '../server/dashboard-pinned-charts.mjs';
import {prepareCycleImport} from '../server/domain/cycle-records.mjs';
const to='2026-11-15',clock={now:new Date(to+'T18:00:00Z'),timeZone:'America/Chicago'};
const change=(state,id,patch)=>applyChartDisplayCommand(state,{type:'chart.display',payload:{id,patch}});
function fixture(){const state=initialState();state.charts.push({version:2,id:'weight',name:'Weight history',primary:{kind:'biometric',type:'weight',unit:'kg'},secondary:null,days:14,visible:false,cycleOverlay:true});state.biometrics=[{id:'w',date:'2026-11-14',time:'12:00',type:'weight',unit:'kg',value:80}];return state;}
test('hidden custom chart pins independently and preserves dates, units, missing values and source overlays',()=>{
 const state=fixture();change(state,'custom:weight',{showOnDashboard:true,range:'custom',from:'2026-11-13',to,primaryUnit:'lbs',includeToday:false,showFasting:true});
 const source=prepareCycleImport(state,{format:'nourish-cycle-data',version:1,source:{id:'watch',name:'Watch'},exportedAt:'2026-11-15T12:00:00Z',records:[{id:'1',date:'2026-11-14',observedAt:null,metric:'phase',value:'follicular'}]});state.cycleRecords=source.writes;
 const before=structuredClone(state),pinned=dashboardPinnedCharts(state,to,clock),detail=chartSurfaceView(state,{to,card:'custom:weight'},clock),charts=chartSurfaceView(state,{to},clock);
 assert.deepEqual(pinned.cards,detail.cards);assert.equal(charts.cards.some(row=>row.id==='custom:weight'),false);assert.equal(pinned.cards[0].settings.visible,false);assert.deepEqual(pinned.cards[0].dates,['2026-11-13','2026-11-14']);assert.equal(pinned.cards[0].series[0].points[0].value,null);assert.equal(pinned.cards[0].series[0].unit,'lbs');assert.ok(pinned.cards[0].series[0].points[1].value>176);assert.equal(pinned.cards[0].cycleOverlay.observations[0].source.id,'watch');assert.deepEqual(state,before);
 change(state,'custom:weight',{showOnDashboard:false});assert.equal(dashboardPinnedCharts(state,to,clock).cards.length,0);
});
test('built-in pinning and source changes validate units and preserve unrelated settings',()=>{
 const state=fixture();change(state,'metric',{showOnDashboard:true,visible:false,primary:{kind:'biometric',type:'weight',unit:'kg'},primaryUnit:'lbs',range:'14',dayFilter:'nonempty'});change(state,'metric',{primary:{kind:'biometric',type:'waist size',unit:'cm'}});
 assert.equal(state.settings.mobileCharts.charts.metric.primaryUnit,undefined);assert.equal(state.settings.mobileCharts.charts.metric.showOnDashboard,true);assert.equal(state.settings.mobileCharts.charts.metric.range,'14');assert.equal(dashboardPinnedCharts(state,to,clock).cards[0].id,'metric');
 const before=structuredClone(state);assert.throws(()=>change(state,'custom:missing',{showOnDashboard:true}),/existing chart/);assert.throws(()=>change(state,'metric',{primaryUnit:'watts'}),/display unit/);assert.throws(()=>change(state,'custom:weight',{visible:true}),/Invalid mobile chart settings/);assert.deepEqual(state,before);
});
test('complete-day filtering and custom cycle editing use canonical owners',()=>{
 const state=fixture();state.settings.completedDays=['2026-11-14'];change(state,'custom:weight',{showOnDashboard:true,dayFilter:'complete'});const card=dashboardPinnedCharts(state,to,clock).cards[0];assert.deepEqual(card.dates,['2026-11-14']);
 applyChartDisplayCommand(state,{type:'chart.cycle-overlay',payload:{id:'weight',enabled:false}});assert.equal(dashboardPinnedCharts(state,to,clock).cards[0].cycleOverlayEnabled,false);
 act(state,'chart.delete',{id:'weight'});assert.equal(state.settings.mobileCharts.custom.weight,undefined);assert.equal(dashboardPinnedCharts(state,to,clock).cards.length,0);
});
