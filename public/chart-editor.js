import {cgmRangeControls,bindCgmRangeControls} from './cgm-controls.js';
import {openGlucose} from './health-controls.js';
import {escape as e} from './html.js';
import {request,command} from './diary-api.js';
const field=(label,control)=>`<label class="field-row"><span>${label}</span>${control}</label>`;
const toggle=(name,label,value)=>field(label,`<input type="checkbox" name="${name}" ${value?'checked':''}>`);
const select=(name,label,value,choices)=>field(label,`<select name="${name}" aria-label="${label}">${choices.map(([id,text])=>`<option value="${e(id)}" ${String(value)===String(id)?'selected':''}>${e(text)}</option>`).join('')}</select>`);
const dates=(name,label,value)=>field(label,`<input type="date" name="${name}" aria-label="${label}" value="${e(value)}">`);
const metricSelect=(name,label,metric,options,none=false)=>{
 const choices=[...(none?[['','None']]:[]),...options.map(o=>[JSON.stringify(o.metric),o.name+(o.unit?' · '+o.unit:'')])],value=metric?JSON.stringify(metric):'';
 if(value&&!choices.some(([id])=>id===value))choices.push([value,metric.type??metric.id??metric.kind]);
 return select(name,label,value,choices);
};
function bindSave({form,revision,onChange,close,afterSave}){
 return async(type,payload)=>{form.querySelectorAll('button').forEach(b=>b.disabled=true);try{await command(revision,type,payload);if(form.isConnected)close();await onChange?.();await afterSave?.();}catch(error){if(form.isConnected)form.querySelector('[role=status]').textContent=error.message;}finally{form.querySelectorAll('button').forEach(b=>b.disabled=false);}};
}
export function openChartDefinition(chart,data,ui){
 const {show,header,content}=ui;
 show(`${header(chart?'Edit Chart':'Create Chart')}<form class="entry-form"><label class="field-row"><span>Name</span><input name="name" aria-label="Chart name" required maxlength="200" value="${e(chart?.name??'')}"></label>${metricSelect('primary','Primary metric',chart?.primary??{kind:'nutrient',id:'calories'},data.options)}${metricSelect('secondary','Secondary metric',chart?.secondary,data.options,true)}${field('Days',`<input type="number" name="days" aria-label="Chart days" min="1" max="366" value="${chart?.days??28}" required>`)}${toggle('visible','Show in Charts',chart?.visible!==false)}${toggle('cycleOverlay','Show cycle',chart?.cycleOverlay===true)}<p class="sheet-message" role="status"></p><footer class="entry-actions">${chart?'<button type="button" class="danger" data-delete>Delete</button>':''}<button class="primary">Save</button></footer></form>`);
 const form=content.querySelector('form'),save=bindSave({form,revision:data.revision,...ui});
 form.onsubmit=event=>{event.preventDefault();const values=Object.fromEntries(new FormData(form));save('chart.save',{version:2,...(chart?{id:chart.id}:{}),name:values.name,primary:JSON.parse(values.primary),secondary:values.secondary?JSON.parse(values.secondary):null,days:Number(values.days),visible:form.elements.visible.checked,cycleOverlay:form.elements.cycleOverlay.checked});};
 if(chart)form.querySelector('[data-delete]').onclick=()=>save('chart.delete',{id:chart.id});
}
export async function openChartSettings(id,data,ui){
 const {show,header,content}=ui;
 let card=data.cards.find(row=>row.id===id);
 if(!card){show(`${header('Chart')}<p class="empty" role="status">Loading chart…</p>`);const pending=content.querySelector('[role=status]');try{data=await request('/api/charts?'+new URLSearchParams({to:data.to,card:id}));if(!pending.isConnected)return;card=data.cards[0];}catch(error){if(pending.isConnected)pending.textContent=error.message;return;}}
 const s=card.settings,cgm=card.id==='cgm',custom=card.kind==='custom',ranges=[['7','Last 7 days'],['14','Last 2 weeks'],['21','Last 3 weeks'],['28','Last 4 weeks'],['56','Last 8 weeks'],['90','Last 3 months'],['180','Last 6 months'],['365','Last year'],['all','All time'],['custom','Custom dates']];if(!ranges.some(([id])=>id===s.range))ranges.unshift([s.range,`${s.range} days`]);
 const filterOptions=axis=>data.options.filter(row=>row.metric.kind===(['metric','weight-fat','weight-waist'].includes(card.id)?'biometric':card.id==='score'?'score':'nutrient')&&(!card.id.startsWith('weight-')||row.metric.type===(axis==='primary'?'weight':card.id==='weight-fat'?'body fat':'waist size')));
 const axes=['metric','nutrient','score','weight-fat','weight-waist'].includes(card.id)?['primary',...(['weight-fat','weight-waist'].includes(card.id)?['secondary']:[])]:[];
 const unitFields=['primary','secondary'].filter(axis=>card.unitChoices?.[axis]?.length>1).map(axis=>select(axis+'Unit',axis==='primary'?'Primary unit':'Secondary unit',s[axis+'Unit']??card.axisUnits?.find(row=>row.key===axis+'Unit')?.unit??card.series.find(series=>series.id===axis)?.unit??card.series.find(series=>series.axis===(axis==='primary'?'left':'right'))?.unit??card.unitChoices[axis][0],card.unitChoices[axis].map(unit=>[unit,unit]))).join('');
 show(`${header(card.name)}<form class="entry-form">${custom?'<button type="button" data-definition>Edit name and metrics</button>':''}${toggle('showOnDashboard','Pin to Dashboard',s.showOnDashboard)}${custom?'':toggle('visible','Show in Charts',s.visible)}${cgm?select('hours','Hours',s.hours,[3,24,48,72].map(n=>[n,n+' hours'])):select('range','Date range',s.range,ranges)+`<div data-custom-dates ${s.range==='custom'?'':'hidden'}>${dates('from','From',s.from??card.range.from)}${dates('to','To',s.to??card.range.to)}</div>`+select('dayFilter','Days',s.dayFilter,[['all','All days'],['nonempty','Non-empty days'],['complete','Completed days']])+toggle('includeToday','Include today',s.includeToday)+toggle('zoom','Zoom to data',s.zoom)+toggle('targetLine','Show target',s.targetLine)}${axes.map(axis=>metricSelect(axis,axis==='primary'?'Primary metric':'Secondary metric',s[axis]??card.series.find(series=>series.id===axis)?.metric,filterOptions(axis))).join('')}${unitFields}${card.id==='nutrient'?select('grouping','Group by',s.grouping,[['day','Day'],['hour','Hour'],['minute','Minute']]):''}${toggle('showFasting','Show fasting',s.showFasting)}${custom?'':toggle('showCycle','Show cycle',s.showCycle)}${cgm?'<button type="button" data-glucose-source>Glucose &amp; insulin sources</button>'+cgmRangeControls(card)+metricSelect('compare','Comparison',s.compare,card.capture.comparisonOptions,true)+toggle('showInsulin','Show insulin',s.showInsulin)+toggle('showCompare','Show comparison',s.showCompare):''}<p class="sheet-message" role="status"></p><footer class="entry-actions"><button class="primary">Save</button></footer></form>`);
 const form=content.querySelector('form'),save=bindSave({form,revision:data.revision,...ui}),readCgmRange=cgm?bindCgmRangeControls(form,card):null;
 if(cgm)form.querySelector('[data-glucose-source]').onclick=()=>openGlucose({...ui,date:()=>data.to});
 if(custom)form.querySelector('[data-definition]').onclick=()=>openChartDefinition(card.definition,data,ui);
 if(form.elements.range)form.elements.range.onchange=()=>{form.querySelector('[data-custom-dates]').hidden=form.elements.range.value!=='custom';};
 // Changing a metric must not submit the old source's unit override.
 for(const axis of axes)form.elements[axis].onchange=()=>{const units=form.elements[axis+'Unit'];if(units)units.disabled=true;};
 form.onsubmit=event=>{event.preventDefault();const patch={};for(const element of form.elements){if(!element.name||element.disabled||element.name.startsWith('cgm'))continue;patch[element.name]=element.type==='checkbox'?element.checked:['primary','secondary','compare'].includes(element.name)?(element.value?JSON.parse(element.value):null):element.name==='hours'?Number(element.value):element.value;}if(readCgmRange)patch.targetRange=readCgmRange();if(patch.range!=='custom'){delete patch.from;delete patch.to;}save('chart.display',{id:card.id,patch});};
}
