import test from 'node:test';
import assert from 'node:assert/strict';
import {initialState} from '../server/domain/workspace.mjs';
import {createDashboardView} from '../server/domain/dashboard.mjs';
import {projectDashboardSettings} from '../server/domain/dashboard-settings.mjs';
import {prepareCycleImport} from '../server/domain/cycle-records.mjs';
import {projectDashboardHealthCards} from '../server/dashboard-health-cards.mjs';
import {dashboardHealthCardsMarkup,glucoseSamplePlot} from '../public/dashboard-health-cards.js';
const date='2026-11-15',context={now:new Date(date+'T18:00:00Z'),timeZone:'UTC'},range={from:'2026-11-01',to:date};
export function healthFixture(){const state=initialState(),dashboard=projectDashboardSettings(state.settings.dashboard);state.settings.dashboard={...dashboard,widgets:{...dashboard.widgets,glucose:true,cycle:true}};return state;}
const capture=state=>createDashboardView(state,range,context);
function configure(state){state.settings.glucoseTimeline={version:1,glucose:{type:'Blood Glucose'},insulin:null,displayUnit:'mmol/L',range:null};}
const reading=(id,value,time='08:00',extra={})=>({id,date,time,type:'Blood Glucose',value,unit:'mg/dL',...extra});

test('empty and disabled health widgets preserve absent measurements',()=>{
 const state=healthFixture(),result=projectDashboardHealthCards(capture(state)),html=dashboardHealthCardsMarkup(result);
 assert.equal(result.glucose.stats.mean,null);assert.equal(result.glucose.stats.latest,null);assert.match(html,/No glucose source selected/);assert.match(html,/No cycle observations/);assert.doesNotMatch(html,/0 mg\/dL|0 mmol\/L/);
 state.settings.dashboard.widgets.glucose=false;state.settings.dashboard.widgets.cycle=false;assert.deepEqual(projectDashboardHealthCards(capture(state)),{});assert.equal(dashboardHealthCardsMarkup({}),'');
});

test('glucose keeps canonical conversion, copied exclusions, unknown latest and source attribution',()=>{
 const state=healthFixture();configure(state);state.biometrics=[reading('a',90),reading('b',180),reading('copy',300,'09:00',{copiedFrom:{id:'original'}}),reading('untimed',100,''),reading('invalid',-1),reading('other',800,'10:00',{type:'Other'})];state.biometrics[0].source={provider:'Meter',recordId:'r1'};
 const before=structuredClone(state),canonical=capture(state),view=projectDashboardHealthCards(canonical).glucose;
 assert.deepEqual(view.stats,canonical.cards.glucose.stats);assert.equal(view.stats.count,3);assert.equal(view.stats.latest,null);assert.equal(view.stats.latestReason.code,'latest-duplicate');assert.equal(view.excludedCount,1);assert.deepEqual(view.readings[0].source,{provider:'Meter',recordId:'r1'});assert.deepEqual(state,before);
 const plot=glucoseSamplePlot(view);assert.equal((plot.match(/<circle /g)||[]).length,2);assert.doesNotMatch(plot,/<polyline|<path[^>]+stroke-dasharray/);assert.match(dashboardHealthCardsMarkup({glucose:view}),/Shared timestamp/);
});

test('cycle keeps each source and supplied date; latest null does not borrow old value or infer today phase',()=>{
 const state=healthFixture(),add=(id,name,records)=>{const result=prepareCycleImport(state,{format:'nourish-cycle-data',version:1,source:{id,name},exportedAt:'2026-11-15T12:00:00Z',records:records.map((row,index)=>({id:String(index),observedAt:null,...row}))});state.cycleRecords=[...(state.cycleRecords??[]),...result.writes];};
 add('a','Source <A>',[{date:'2026-11-13',metric:'cycleDay',value:5},{date:'2026-11-14',metric:'cycleDay',value:null},{date:'2026-11-14',metric:'phase',value:'follicular'},{date,metric:'phase',value:'luteal'},{date,metric:'temperatureVariation',value:0}]);
 add('b','Source B',[{date:'2026-11-12',metric:'phase',value:'unknown'}]);
 const canonical=capture(state),view=projectDashboardHealthCards(canonical).cycle,html=dashboardHealthCardsMarkup({cycle:view});
 assert.deepEqual(view.sources,canonical.cards.cycle.dashboard);assert.equal(view.sources[0].cycleDay.value,null);assert.equal(view.sources[0].phase.date,'2026-11-14');assert.equal(view.sources[0].phase.value,'follicular');assert.equal(view.sources[0].temperatureVariation.value,0);assert.equal(view.sources.length,2);
 assert.match(html,/Not supplied/);assert.match(html,/0 °C/);assert.match(html,/Unknown/);assert.match(html,/Source &lt;A&gt;/);assert.doesNotMatch(html,/Luteal/);
});
