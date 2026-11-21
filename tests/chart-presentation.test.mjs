import test from 'node:test';
import assert from 'node:assert/strict';
globalThis.window={addEventListener(){}};
const {chartCardMarkup,chartPlotConfig,cyclePlotOptions,validateChartView}=await import('../public/chart-presentation.js');
test('source chart cards put the metric title above the plot and the legend and dates below it',()=>{
 const card={id:'nutrient',name:'Single Nutrient',range:{from:'2026-11-01',to:'2026-11-02'},settings:{},series:[{id:'protein',name:'Protein',unit:'g',points:[{date:'2026-11-01',value:32},{date:'2026-11-02',value:null}]}]};
 const html=chartCardMarkup(card),config=chartPlotConfig(card);
 assert.match(html,/<h2>Protein<\/h2>/);assert.doesNotMatch(html,/>Edit<|style=/);assert.ok(html.indexOf('mcl-card-title')<html.indexOf('data-chart-plot'));assert.ok(html.indexOf('data-chart-plot')<html.indexOf('mcl-legend'));assert.ok(html.indexOf('mcl-legend')<html.indexOf('mcl-dates'));
 assert.match(html,/Protein \(g\)/);assert.match(html,/#57d599/);assert.equal(config.data.datasets[0].borderColor,'#57d599');assert.equal(config.options.plugins.legend.display,false);
 const empty={...card,series:[{...card.series[0],points:[{date:'2026-11-01',value:null}]}]};assert.match(chartCardMarkup(empty),/No data available/);assert.doesNotMatch(chartCardMarkup(card,{detail:true}),/data-chart-open/);
});
test('plot preserves null gaps, separate axes, stepped targets, fasting positions and cycle lanes',()=>{
 const start=Date.parse('2026-11-01T06:00:00Z'),end=Date.parse('2026-11-02T06:00:00Z'),card={id:'custom:test',range:{from:'2026-11-01',to:'2026-11-02'},dates:['2026-11-01','2026-11-02'],settings:{showFasting:true,zoom:false},plot:'lines',series:[{id:'primary',name:'Weight',unit:'kg',axis:'left',points:[{date:'2026-11-01',value:80},{date:'2026-11-02',value:null}]},{id:'secondary',name:'Fat',unit:'%',axis:'right',points:[{date:'2026-11-01',value:20}]}],target:{points:[{date:'2026-11-01',value:75}]},fasting:{rows:[{startPosition:{instant:'2026-11-01T06:00:00Z'},endPosition:{instant:'2026-11-02T07:00:00Z'}}]},cycleOverlayEnabled:true,cycleOverlay:{observations:[{source:{id:'a'},phase:'follicular',from:start,to:end},{source:{id:'b'},phase:'luteal',from:start,to:end}]}};
 const config=chartPlotConfig(card);assert.equal(config.data.datasets[0].data[1].y,null);assert.equal(config.options.spanGaps,false);assert.equal(config.data.datasets[1].yAxisID,'right');assert.equal(config.data.datasets[2].stepped,true);assert.equal(config.data.datasets[2].data.length,2);assert.equal(config.options.plugins.nourishingFasting.regions[0].to-start,25*3600000);assert.equal(cyclePlotOptions(card).sourceCount,2);assert.deepEqual(cyclePlotOptions(card).regions.map(r=>r.lane),[0,1]);
 assert.throws(()=>validateChartView({calendar:{},cards:[{...card,cycleOverlayEnabled:false}]}),/cycle data/);
});

test('daily bars stay inside their own day and do not shift the selected date range',()=>{
 const dates=['2026-11-19','2026-11-20'],card={id:'energy',range:{from:dates[0],to:dates[1]},settings:{},plot:'stacked-bars',
  series:[{id:'protein',name:'Protein',unit:'kcal',points:dates.map((date,i)=>({date,value:i?null:0}))}]};
 const chart=chartPlotConfig(card),x=chart.options.scales.x;
 assert.deepEqual(chart.data.datasets[0].data.map(({x,y})=>[new Date(x).toISOString(),y]),[['2026-11-19T12:00:00.000Z',0],['2026-11-20T12:00:00.000Z',null]]);
 assert.equal(x.min,Date.parse('2026-11-19T00:00:00Z'));assert.equal(x.max,Date.parse('2026-11-20T23:59:59Z'));
 const scale={};x.afterBuildTicks(scale);assert.deepEqual(scale.ticks.map(t=>x.ticks.callback(t.value)),['Nov 19','Nov 20']);
});
