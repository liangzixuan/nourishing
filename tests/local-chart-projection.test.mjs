import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {buildLocalCharts} from '../scripts/package-local-charts.mjs';
import {initialState} from '../server/domain/workspace.mjs';
import {chartSurfaceView} from '../server/dashboard-pinned-charts.mjs';
import {applyChartPreference} from '../server/domain/chart-display-command.mjs';
import {prepareCycleImport} from '../server/domain/cycle-records.mjs';
await buildLocalCharts();
const {projectLocalChart}=await import('../public/local-chart-projection.js');
const clock={now:new Date('2026-11-15T18:00:00Z'),timeZone:'America/Chicago'},to='2026-11-15';
test('server and offline metric choices use defaults for a null stored chart setting',async()=>{
 const state=initialState(),id='metric';
 state.settings.mobileCharts={version:1,charts:{metric:null}};
 const read=state=>chartSurfaceView(state,{to,card:id},clock);
 const canonical=read(state);
 assert.deepEqual(canonical.options,read(initialState()).options);
 const action={type:'chart.display',payload:{id,patch:{zoom:true}}};
 const local=await projectLocalChart(state,action,canonical,id);
 assert.deepEqual(local.options,canonical.options);
 assert.equal(local.cards[0].settings.zoom,true);
 assert.equal(state.settings.mobileCharts.charts.metric,null);
});
test('browser chart projection matches server periods, units, missing values and validated cycle identities',async()=>{
 const state=initialState();state.charts=[{version:2,id:'weight',name:'Weight',primary:{kind:'biometric',type:'weight',unit:'kg'},secondary:null,days:7,visible:true,cycleOverlay:true}];
 state.biometrics=[{id:'w',date:'2026-11-14',time:'12:00',type:'weight',unit:'kg',value:80}];
 state.cycleRecords=prepareCycleImport(state,{format:'nourish-cycle-data',version:1,source:{id:'watch',name:'Watch'},exportedAt:'2026-11-15T12:00:00Z',records:[{id:'1',date:'2026-11-14',observedAt:null,metric:'phase',value:'follicular'}]}).writes;
 for(const [id,patch]of [['custom:weight',{primaryUnit:'lbs',range:'14',includeToday:false}],['energy',{range:'14',dayFilter:'complete'}],['nutrient',{primary:{kind:'nutrient',id:'protein'},grouping:'hour',range:'7'}]]){
  const view=chartSurfaceView(state,{to,card:id},clock),action={type:'chart.display',payload:{id,patch}},before=structuredClone(state),local=await projectLocalChart(state,action,view,id),server=structuredClone(state);applyChartPreference(server,action);
  const canonical=chartSurfaceView(server,{to,card:id},clock);assert.deepEqual(local.cards,canonical.cards);assert.deepEqual(local.catalog,canonical.catalog);assert.deepEqual(state,before);
 }
 const bad=structuredClone(state);bad.cycleRecords[0].id='cycle-wrong';await assert.rejects(projectLocalChart(bad,{type:'chart.display',payload:{id:'custom:weight',patch:{range:'14'}}},chartSurfaceView(state,{to},clock),'custom:weight'),/identity/);
 assert.doesNotMatch(await readFile('public/local-chart-projection.js','utf8'),/from\s*["'`]node:/);
});
test('chart phase controls use account history and offline settings preserve the observed subset',async()=>{
 const id='metric',state=initialState(),origin={id:'fixture',name:'Fixture device'};
 const records=[['2026-08-01','phase','unknown'],['2026-11-14','phase','follicular'],[to,'phase','luteal'],['2026-11-16','phase','luteal'],['2026-10-01','temperatureVariation',0.1]];
 state.cycleRecords=prepareCycleImport(state,{format:'nourish-cycle-data',version:1,source:origin,exportedAt:clock.now.toISOString(),records:records.map(([date,metric,value],i)=>({id:String(i),observedAt:null,date,metric,value}))}).writes;
 const read=state=>chartSurfaceView(state,{to,card:id},clock),action=patch=>({type:'chart.display',payload:{id,patch}});
 assert.equal(read({...state,cycleRecords:state.cycleRecords.slice(2)}).hasRecordedPhases,false);
 assert.equal(read({...state,cycleRecords:state.cycleRecords.slice(0,1)}).hasRecordedPhases,true);
 applyChartPreference(state,action({showCycle:true}));const canonical=read(state),[card]=canonical.cards;
 assert.deepEqual(card.cycleOverlay.observations.map(row=>row.date),['2026-11-14']);
 const offline=structuredClone(state);delete offline.cycleRecords;
 const fit=await projectLocalChart(offline,action({zoom:true}),canonical,id);
 assert.equal(fit.hasRecordedPhases,true);assert.deepEqual(fit.cards[0].cycleOverlay,card.cycleOverlay);assert.equal(fit.cards[0].cycleCoveredDates,undefined);
 const wider=await projectLocalChart(offline,action({range:'14'}),fit,id);
 assert.deepEqual(wider.cards[0].cycleCoveredDates,card.dates.filter(day=>day<to));assert.deepEqual(wider.cards[0].cycleOverlay.observations,card.cycleOverlay.observations);
 const narrowed=await projectLocalChart(offline,action({range:'7'}),wider,id);
 assert.deepEqual(narrowed.cards[0].cycleOverlay,card.cycleOverlay);assert.equal(narrowed.cards[0].cycleCoveredDates,undefined);
 const filtered=await projectLocalChart(offline,action({dayFilter:'complete'}),canonical,id);
 assert.equal(filtered.cards[0].cycleOverlayEnabled,true);assert.deepEqual(filtered.cards[0].cycleOverlay.observations,[]);assert.equal(filtered.hasRecordedPhases,true);
 const disabled=await projectLocalChart(offline,action({showCycle:false}),filtered,id);
 assert.equal(disabled.cards[0].cycleOverlayEnabled,false);assert.equal(disabled.cards[0].cycleOverlay,undefined);
 const enabled=await projectLocalChart(offline,action({showCycle:true,dayFilter:'all'}),disabled,id);
 assert.deepEqual(enabled.cards[0].cycleOverlay,card.cycleOverlay);assert.equal(enabled.cards[0].cycleCoveredDates,undefined);
});
