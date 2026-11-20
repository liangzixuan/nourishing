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
