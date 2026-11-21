import test from 'node:test';
import assert from 'node:assert/strict';
import {initialState,act} from '../server/domain/workspace.mjs';
import {biometricCatalog} from '../server/domain/biometric-library.mjs';
import {chartSurfaceView} from '../server/dashboard-pinned-charts.mjs';
import {applyChartPreference} from '../server/domain/chart-display-command.mjs';
const clock={now:new Date('2026-11-16T12:00:00Z'),timeZone:'UTC'};
test('empty-account chart choices include canonical catalog units and can create a chart without measurements',()=>{
 const state=initialState(),before=structuredClone(state),view=chartSurfaceView(state,{to:'2026-11-16'},clock),keys=view.options.map(row=>JSON.stringify(row.metric));
 for(const definition of biometricCatalog)for(const unit of definition.units)assert.ok(keys.includes(JSON.stringify({kind:'biometric',type:definition.type,unit})));
 assert.equal(new Set(keys).size,keys.length);assert.deepEqual(state,before);
 const primary=view.options.find(row=>row.metric.type==='weight'&&row.metric.unit==='lbs');assert.equal(primary.name,'Weight');
 act(state,'chart.save',{version:2,name:'Weight and pulse',primary:primary.metric,secondary:{kind:'biometric',type:'heart rate',unit:'bpm'},days:7,visible:true,cycleOverlay:false});
 const card=chartSurfaceView(state,{to:'2026-11-16'},clock).cards.find(row=>row.kind==='custom');assert.equal(card.series.length,2);assert.ok(card.series.every(row=>row.points.every(point=>point.value===null)));
});
test('standard chart source choices retain exact identifiers after save and query',()=>{
 const state=initialState(),to='2026-11-16',id='metric',view=()=>chartSurfaceView(state,{to,card:id},clock);
 const sources=view().options.map(row=>row.metric).filter(metric=>metric.kind==='biometric');
 for(const [type,unit] of [['systolic blood pressure','mmHg'],['diastolic blood pressure','mmHg'],['total cholesterol','mg/dL'],['triglycerides','mmol/L']])assert.ok(sources.some(row=>row.type===type&&row.unit===unit));
 for(const primary of [...sources,{kind:'biometric',type:'Historic source',unit:'historic unit'}]){
  applyChartPreference(state,{type:'chart.display',payload:{id,patch:{primary}}});
  const next=view();assert.deepEqual(next.cards[0].series[0].metric,primary);
  assert.ok(next.options.some(row=>JSON.stringify(row.metric)===JSON.stringify(primary)));
 }
});
test('chart choices retain selected historical identities and user-defined metrics without catalog aliasing',()=>{
 const state=initialState();state.charts=[{version:2,id:'old',name:'Saved identity',primary:{kind:'biometric',type:'Weight',unit:'kg'},secondary:{kind:'biometric',type:'My reading',unit:'points'},days:7,visible:false,cycleOverlay:true}];
 const {options}=chartSurfaceView(state,{to:'2026-11-16'},clock);
 for(const metric of [state.charts[0].primary,state.charts[0].secondary])assert.deepEqual(options.find(row=>JSON.stringify(row.metric)===JSON.stringify(metric)).metric,metric);
 assert.ok(options.some(row=>row.metric.type==='weight'));assert.ok(options.some(row=>row.metric.type==='Weight'));
});

test('new chart sources have established units, and convert only the selected circumference source',()=>{
 const state=initialState(),to='2026-11-16',read=()=>chartSurfaceView(state,{to,card:'metric'},clock);
 const options=read().options.filter(row=>row.metric.kind==='biometric');
 for(const [type,units] of [['wrist size',['cm','in']],['thigh size',['cm','in']],['upper arm size',['cm','in']],['waist size',['cm','in']],['v02 max',['mL/kg/min']],['skin temperature',['°C']],['readiness',[null]]]){
  assert.deepEqual(options.filter(row=>row.metric.type===type).map(row=>row.metric.unit),units,type);
 }
 const primary={kind:'biometric',type:'wrist size',unit:'cm'};
 applyChartPreference(state,{type:'chart.display',payload:{id:'metric',patch:{primary,primaryUnit:'in'}}});
 assert.ok(read().cards[0].series[0].points.every(point=>point.value===null));
 state.biometrics=[{id:'cm',date:to,type:primary.type,unit:'cm',value:25.4},{id:'other',date:to,type:primary.type,unit:'in',value:20}];
 const series=read().cards[0].series[0];
 assert.deepEqual(series.metric,primary);assert.equal(series.unit,'in');
 assert.deepEqual(series.points.map(point=>point.value),[null,null,null,null,null,null,10]);
 assert.throws(()=>applyChartPreference(state,{type:'chart.display',payload:{id:'metric',patch:{primaryUnit:'kg'}}}),/supported/);
});
test('saved standard and custom charts with an unknown unit plot only a single unambiguous recorded source',()=>{
 const state=initialState(),to='2026-11-16',primary={kind:'biometric',type:'readiness',unit:null};
 applyChartPreference(state,{type:'chart.display',payload:{id:'metric',patch:{primary}}});
 act(state,'chart.save',{version:2,id:'r',name:'Readiness',primary,secondary:null,days:7,visible:true});
 const check=(unit,last)=>{for(const card of ['metric','custom:r']){
  const series=chartSurfaceView(state,{to,card},clock).cards[0].series[0];
  assert.equal(series.unit,unit);assert.deepEqual(series.points.map(p=>p.value),[null,null,null,null,null,null,last]);
  assert.deepEqual(series.metric,primary);assert.deepEqual(series.displayUnits,[]);
 }};
 check(null,null);
 state.biometrics.push({id:'a',date:to,type:'readiness',unit:'points',value:0});check('points',0);
 state.biometrics.push({id:'b',date:to,type:'readiness',unit:'%',value:70});check(null,null);
});
