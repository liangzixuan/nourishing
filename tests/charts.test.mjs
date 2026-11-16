import test from 'node:test';
import assert from 'node:assert/strict';
import {initialState,act} from '../server/domain/workspace.mjs';
import {csvReport} from '../server/chart-view.mjs';
import {chartSurfaceView} from '../server/dashboard-pinned-charts.mjs';
test('charts preserve missing days, measured biometric units, and private definitions',()=>{
 const s=initialState();act(s,'biometric.add',{date:'2026-11-14',type:'Weight',value:80,unit:'kg'});
 act(s,'chart.save',{version:2,name:'Weight',primary:{kind:'biometric',type:'Weight',unit:'kg'},secondary:null,days:2,visible:true});
 const clock={now:new Date('2026-11-14T18:00:00Z'),timeZone:'UTC'},v=chartSurfaceView(s,{to:'2026-11-14'},clock),card=v.cards.find(row=>row.kind==='custom');assert.deepEqual(card.series[0].points.map(p=>p.value),[null,80]);assert.equal(card.series[0].unit,'kg');assert.equal(chartSurfaceView(initialState(),{to:v.to},clock).saved.length,0);
});
test('exports retain unknown amounts and prevent spreadsheet formula execution',()=>{
 const s=initialState();act(s,'note.add',{date:'2026-11-14',text:'=1+2'});
 const csv=csvReport(s,{kind:'notes',from:'2026-11-14',to:'2026-11-14'}).csv;assert.match(csv,/'=1\+2/);
 assert.throws(()=>csvReport(s,{kind:'notes',from:'2026-11-14',to:'2026-11-14',ownerId:'other'}));
});


test('CSV exports use account energy units and include requested daily group rows',()=>{
 const s=initialState();s.settings.energyUnit='kJ';const day='2026-11-16';
 const food=act(s,'food.save',{name:'Export oats',grams:100,serving:'100 g',nutrients:{calories:100}});
 act(s,'entry.add',{date:day,foodId:food.id,amount:1,group:'Breakfast'});
 const csv=csvReport(s,{kind:'daily-nutrients',from:day,to:day,includeGroups:true}).csv;
 assert.match(csv,/calories \[kJ\]/);assert.match(csv,/rowType,diaryGroup/);assert.match(csv,/,group,Breakfast,/);assert.match(csv,/418\.4/);
 const explicit=csvReport(s,{kind:'daily-energy',from:day,to:day,energyUnit:'kcal'}).csv;assert.match(explicit,/consumed \[kcal\]/);
 assert.throws(()=>csvReport(s,{kind:'notes',from:day,to:day,includeGroups:true}));
});
