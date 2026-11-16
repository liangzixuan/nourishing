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
