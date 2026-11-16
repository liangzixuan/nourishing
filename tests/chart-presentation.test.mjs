import test from 'node:test';
import assert from 'node:assert/strict';
globalThis.window={addEventListener(){}};
const {chartPlotConfig,cyclePlotOptions,validateChartView}=await import('../public/chart-presentation.js');
test('plot preserves null gaps, separate axes, stepped targets, fasting positions and cycle lanes',()=>{
 const start=Date.parse('2026-11-01T06:00:00Z'),end=Date.parse('2026-11-02T06:00:00Z'),card={id:'custom:test',range:{from:'2026-11-01',to:'2026-11-02'},dates:['2026-11-01','2026-11-02'],settings:{showFasting:true,zoom:false},plot:'lines',series:[{id:'primary',name:'Weight',unit:'kg',axis:'left',points:[{date:'2026-11-01',value:80},{date:'2026-11-02',value:null}]},{id:'secondary',name:'Fat',unit:'%',axis:'right',points:[{date:'2026-11-01',value:20}]}],target:{points:[{date:'2026-11-01',value:75}]},fasting:{rows:[{startPosition:{instant:'2026-11-01T06:00:00Z'},endPosition:{instant:'2026-11-02T07:00:00Z'}}]},cycleOverlayEnabled:true,cycleOverlay:{observations:[{source:{id:'a'},phase:'follicular',from:start,to:end},{source:{id:'b'},phase:'luteal',from:start,to:end}]}};
 const config=chartPlotConfig(card);assert.equal(config.data.datasets[0].data[1].y,null);assert.equal(config.options.spanGaps,false);assert.equal(config.data.datasets[1].yAxisID,'right');assert.equal(config.data.datasets[2].stepped,true);assert.equal(config.data.datasets[2].data.length,2);assert.equal(config.options.plugins.nourishingFasting.regions[0].to-start,25*3600000);assert.equal(cyclePlotOptions(card).sourceCount,2);assert.deepEqual(cyclePlotOptions(card).regions.map(r=>r.lane),[0,1]);
 assert.throws(()=>validateChartView({calendar:{},cards:[{...card,cycleOverlayEnabled:false}]}),/cycle data/);
});
