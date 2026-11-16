import {escape as e} from './html.js';
import {request,command} from './diary-api.js';
import {renderGlucoseTimelineView,bindGlucoseTimelineInteractions} from './health-source/public/glucose-timeline.js';
const field=(label,input)=>`<label class="field-row"><span>${label}</span>${input}</label>`;
const select=(name,label,value,options)=>field(label,`<select name="${name}" aria-label="${label}">${options.map(([id,text])=>`<option value="${e(id)}" ${id===value?'selected':''}>${e(text)}</option>`).join('')}</select>`);
const number=value=>Number.isFinite(value)?value.toLocaleString(undefined,{maximumFractionDigits:2}):'—';
const start=to=>{const date=new Date(to+'T12:00:00Z');date.setUTCDate(date.getUTCDate()-13);return date.toISOString().slice(0,10);};
const dates=range=>field('From',`<input type="date" name="from" required value="${e(range.from)}">`)+field('To',`<input type="date" name="to" required value="${e(range.to)}">`);
const status=()=>'<p class="sheet-message" role="status"></p>';

export async function openGlucose(ui,range={from:start(ui.date()),to:ui.date()}){
 const {show,header,content,onChange}=ui;
 show(`${header('Glucose Timeline')}<section class="health-controls"><p role="status">Loading…</p></section>`);
 const host=content.querySelector('.health-controls');let capture;
 try{capture=await request('/api/glucose-timeline?'+new URLSearchParams({...range,...(range.compare?{compare:JSON.stringify(range.compare)}:{})}));if(!host.isConnected)return;}catch(error){if(host.isConnected)host.querySelector('[role=status]').textContent=error.message;return;}
 const view=capture.view;
 host.innerHTML=`<form class="health-range">${dates(range)}${select('compare','Compare',range.compare?JSON.stringify(range.compare):'',[['','None'],...view.comparisonOptions.map(row=>[JSON.stringify(row.metric),row.name+(row.unit?' · '+row.unit:'')])])}<button class="primary">Show</button></form><button type="button" data-sources>Glucose &amp; insulin sources</button><div data-timeline>${renderGlucoseTimelineView(view,{compact:true,energyUnit:capture.energyUnit,language:capture.language})}</div>`;
 bindGlucoseTimelineInteractions(host);
 host.querySelector('form').onsubmit=event=>{event.preventDefault();const values=Object.fromEntries(new FormData(event.target));openGlucose(ui,{from:values.from,to:values.to,...(values.compare?{compare:JSON.parse(values.compare)}:{})});};
 host.querySelector('[data-sources]').onclick=()=>{
  const policy=view.policy,choices=(unit,current)=>{const options=view.options.filter(row=>row.units.some(u=>unit.includes(u))).map(row=>[row.type,row.type]);if(current&&!options.some(([id])=>id===current))options.push([current,current]);return [['','None'],...options];};
  show(`${header('Glucose Sources')}<form class="entry-form">${select('glucose','Glucose source',policy?.glucose.type??'',choices(['mg/dL','mmol/L'],policy?.glucose.type))}${select('insulin','Insulin source',policy?.insulin?.type??'',choices(['U'],policy?.insulin?.type))}${select('unit','Display unit',policy?.displayUnit??'mg/dL',[['mg/dL','mg/dL'],['mmol/L','mmol/L']])}<details><summary>Display band (optional)</summary>${field('Lower',`<input type="number" name="low" step="any" min="0" value="${policy?.range?.low??''}">`)}${field('Upper',`<input type="number" name="high" step="any" min="0" value="${policy?.range?.high??''}">`)}</details>${status()}<footer class="entry-actions"><button class="primary">Save</button></footer></form>`);
  const form=content.querySelector('form');
  form.elements.unit.onchange=()=>{form.elements.low.value='';form.elements.high.value='';};
  form.onsubmit=async event=>{event.preventDefault();const values=Object.fromEntries(new FormData(form)),band=values.low!==''||values.high!=='';
   if(band&&(values.low===''||values.high==='')){form.querySelector('[role=status]').textContent='Enter both band limits.';return;}
   const policy=values.glucose?{version:1,glucose:{type:values.glucose},insulin:values.insulin?{type:values.insulin,unit:'U'}:null,displayUnit:values.unit,range:band?{low:Number(values.low),high:Number(values.high)}:null}:null;
   await save(form,()=>command(capture.revision,'glucose.settings',{policy}),async()=>{await onChange?.();if(form.isConnected)await openGlucose(ui,range);});
  };
 };
}

const metricName={cycleDay:'Cycle day',phase:'Phase',temperatureVariation:'Temperature variation'};
function cycleRows(rows,selectable=false){return rows.map(row=>`<li>${selectable?`<input type="checkbox" aria-label="Select ${e(row.date+' '+metricName[row.metric])}" value="${e(row.id)}">`:''}<div><strong>${e(row.date)} · ${e(metricName[row.metric])}</strong><span>${e(row.value===null?'Unknown':row.metric==='temperatureVariation'?number(row.value)+' °C':row.value)}</span><small>${e(row.source.name)}</small></div></li>`).join('');}
async function save(form,work,done){const buttons=[...form.querySelectorAll('button')];buttons.forEach(b=>b.disabled=true);try{await work();await done();}catch(error){if(form.isConnected)form.querySelector('[role=status]').textContent=error.message;}finally{buttons.forEach(b=>b.disabled=false);}}

export async function openCycle(ui,range={from:start(ui.date()),to:ui.date()}){
 const {show,header,content,onChange}=ui;
 show(`${header('Cycle Tracking')}<section class="health-controls"><p role="status">Loading…</p></section>`);const host=content.querySelector('.health-controls');let capture;
 try{capture=await request('/api/cycle?'+new URLSearchParams(range));if(!host.isConnected)return;}catch(error){if(host.isConnected)host.querySelector('[role=status]').textContent=error.message;return;}
 const rows=capture.view.records;let page=0;const selected=new Set();
 host.innerHTML=`<form class="health-range">${dates(range)}<button class="primary">Show</button></form><label class="field-row"><span>Show in diary</span><input type="checkbox" data-diary ${capture.display.showDiary?'checked':''}></label><label class="health-file">Import cycle file<input type="file" accept="application/json,.json" data-import></label><details><summary>File format</summary><p>Nourishing cycle-data JSON, version 1.</p><button type="button" data-example>Download example</button></details><ul class="health-observations"></ul><nav class="health-pages"><button type="button" data-prev>Previous</button><span data-count></span><button type="button" data-next>Next</button></nav><button type="button" class="danger" data-remove disabled>Remove selected</button>${status()}`;
 const message=host.querySelector('[role=status]');
 function render(){host.querySelector('.health-observations').innerHTML=rows.length?cycleRows(rows.slice(page*50,page*50+50),true):'<li>No observations in this date range</li>';for(const checkbox of host.querySelectorAll('.health-observations input')){checkbox.checked=selected.has(checkbox.value);checkbox.onchange=()=>{checkbox.checked?selected.add(checkbox.value):selected.delete(checkbox.value);host.querySelector('[data-remove]').disabled=!selected.size;};}host.querySelector('[data-prev]').disabled=page===0;host.querySelector('[data-next]').disabled=(page+1)*50>=rows.length;host.querySelector('[data-count]').textContent=rows.length?`${page*50+1}–${Math.min((page+1)*50,rows.length)} / ${rows.length}`:'';host.querySelector('.health-pages').hidden=rows.length<=50;}
 render();host.querySelector('[data-prev]').onclick=()=>{page--;render();};host.querySelector('[data-next]').onclick=()=>{page++;render();};
 host.querySelector('form').onsubmit=event=>{event.preventDefault();openCycle(ui,Object.fromEntries(new FormData(event.target)));};
 host.querySelector('[data-diary]').onchange=async event=>{const input=event.target;input.disabled=true;try{const result=await command(capture.revision,'cycle.display',{policy:{version:1,showDiary:input.checked}});capture.revision=result.revision;await onChange?.();}catch(error){if(host.isConnected){message.textContent=error.message;input.checked=!input.checked;}}finally{input.disabled=false;}};
 host.querySelector('[data-example]').onclick=()=>{const example={format:'nourish-cycle-data',version:1,source:{id:'personal',name:'My observations'},exportedAt:new Date().toISOString(),records:[{id:'observation-1',date:range.to,metric:'phase',value:'unknown',observedAt:null}]},url=URL.createObjectURL(new Blob([JSON.stringify(example,null,2)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download='nourishing-cycle-example.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
 async function review(kind,data){
  try{const result=await request(kind==='import'?'/api/cycle/preview':'/api/cycle/removal-preview',data);if(!host.isConnected)return;
   const records=kind==='import'?result.records.map(row=>row.after):result.records;
   show(`${header(kind==='import'?'Review Import':'Remove Observations')}<section class="health-controls"><p>${kind==='import'?`${result.counts.added} new · ${result.counts.updated} updated · ${result.counts.unchanged} unchanged · ${result.counts.older} older skipped`:`Remove ${result.count} observations?`}</p><ul class="health-observations">${cycleRows(records.slice(0,50))}</ul>${records.length>50?`<p>${records.length-50} more observations</p>`:''}${status()}<footer class="entry-actions"><button type="button" data-cancel>Cancel</button><button type="button" class="primary" data-confirm>${kind==='import'?'Import':'Remove'}</button></footer></section>`);
   const panel=content.querySelector('.health-controls');panel.querySelector('[data-cancel]').onclick=()=>openCycle(ui,range);panel.querySelector('[data-confirm]').onclick=()=>save(panel,()=>command(result.revision,'cycle.'+kind,{...(kind==='import'?{data}:{ids:data.ids}),reviewToken:result.reviewToken,confirmed:true}),async()=>{await onChange?.();if(panel.isConnected)await openCycle(ui,range);});
  }catch(error){if(host.isConnected)message.textContent=error.message;}
 }
 host.querySelector('[data-import]').onchange=async event=>{const file=event.target.files?.[0];if(!file)return;try{if(file.size>19_900_000)throw Error('Choose a file smaller than 20 MB.');const data=JSON.parse(await file.text());if(host.isConnected)await review('import',data);}catch(error){if(host.isConnected)message.textContent=error instanceof SyntaxError?'Choose a valid JSON file.':error.message;}finally{event.target.value='';}};
 host.querySelector('[data-remove]').onclick=()=>review('remove',{ids:[...selected]});
}
