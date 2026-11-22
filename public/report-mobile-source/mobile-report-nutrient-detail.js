import {NutrientRangeChart} from './nutrient-range-chart.js';
import {nutrientEducation} from './nutrient-education.js';
import {mobileNutrientName} from '../mobile-nutrient-groups.js';
import {formatMessage} from './message-format.js';
import {displayValue,displayUnit} from '../dashboard-source/energy-display.js';
import {escape as e} from '../dashboard-source/discover-ui.js';
const known=v=>typeof v==='number'&&Number.isFinite(v),count=v=>Number.isSafeInteger(v)&&v>=0,round=v=>Math.round(v*10000)/10000;
/** Validate the detail against the same report accepted by its existing owner. */
export function validateReportNutrientDetail(value,report,nutrient){
 const d=value,summary=nutrient==='netCarbohydrate'?report.carbohydrates.net.summary:report.nutrients.find(row=>row.id===nutrient),dates=new Set(report.days.map(row=>row.date));
 const bad=()=>{throw Error('Invalid report nutrient capture')};
 if(d?.version!==1||d.nutrient!==nutrient||!summary||JSON.stringify(d.summary)!==JSON.stringify(summary)||d.denominator!==summary.knownDays||![d.denominator,d.measuredSources,d.unknownSources,d.omittedSources].every(count)||!Array.isArray(d.entries)||d.entries.length!==Math.min(10,d.measuredSources)||d.omittedSources!==Math.max(0,d.measuredSources-10))bad();
 if(d.denominator===0?(d.total!==null||d.targetTotal!==null||d.entries.length!==0):(!known(d.total)||round(d.total/d.denominator)!==summary.mean))bad();
 if(summary.meanTarget===null?d.targetTotal!==null:!known(d.targetTotal)||round(d.targetTotal/d.denominator)!==summary.meanTarget)bad();
 const seen=new Set();let previous=Infinity;
 for(const row of d.entries){const key=row.date+'|'+row.kind+'|'+row.id;if(!dates.has(row.date)||seen.has(key)||!['food','water'].includes(row.kind)||typeof row.name!=='string'||(row.kind==='food'?typeof row.id!=='string'||!row.id:row.id!==null)||!known(row.value)||row.value>previous||row.mean!==row.value/d.denominator||row.percentOfTarget!==(d.targetTotal>0?row.value/d.targetTotal*100:null))bad();if(row.kind==='food'&&(!row.coverage||!count(row.coverage.known)||!count(row.coverage.total)||row.coverage.known>row.coverage.total||typeof row.coverage.complete!=='boolean'))bad();seen.add(key);previous=row.value;}
 const controls=d.controls;
 if(d.targetDate!==report.options.to||controls?.id!==nutrient||controls.unit!==summary.unit||typeof controls.custom!=='boolean'||typeof controls.customEditable!=='boolean'||!controls.dailyTarget)bad();
 return d;
}
export class MobileReportNutrientDetail{
 constructor({dialog,nutrient,options,unit,language,session,accept,help}){Object.assign(this,{dialog,nutrient,options,unit,language,session,accept,help});this.root=dialog.querySelector('.dc-dialog-body');dialog.querySelector('.dc-dialog-header>[data-report-action=back]').innerHTML='<img class=mrnd-close src=/report-mobile-source/exercise-icons/close.svg alt="">';this.m=(key,v)=>formatMessage(language,'reportNutrientDetail.'+key,v);this.n=(key,v)=>formatMessage(language,'mobileNutrientDetail.'+key,v);this.chart=new NutrientRangeChart();this.events=new AbortController();this.root.addEventListener('click',event=>{if(event.target.closest('[data-mrnd-reload]'))void this.load();if(event.target.closest('[data-mrnd-help]')&&this.value)this.help(this.helpMarkup())},{signal:this.events.signal});this.root.addEventListener('change',event=>{
  if(event.target.matches('[data-mrnd-custom]'))void this.changeTarget(event.target);
 },{signal:this.events.signal});void this.load()}
 async changeTarget(input){
  if(this.saving)return;
  this.saving=true;input.disabled=true;
  try{await this.session.save(input.checked);if(!this.disposed)await this.load();}
  catch(error){if(!this.disposed){input.checked=this.value.detail.controls.custom;input.disabled=false;this.root.querySelector('[data-mrnd-error]').textContent=error.message;}}
  finally{this.saving=false;}
 }
 async load(){this.controller?.abort();const controller=this.controller=new AbortController();this.chart.clear();this.root.innerHTML='<p class="mnd-card" role="status">'+e(this.n('loading'))+'</p>';try{const bundle=await this.session.read(controller.signal);if(this.disposed||controller.signal.aborted)return;const accepted=this.accept(bundle);if(!accepted)return;this.value=accepted;this.render()}catch(error){if(this.disposed||controller.signal.aborted)return;this.root.innerHTML='<div class="mnd-card"><p role="alert">'+e(this.n('failed'))+'</p><button type="button" data-mrnd-reload>'+e(this.n('reload'))+'</button></div>'}}
 number(v){return v===null?'—':displayValue(v,this.value.detail.summary.unit,this.unit).toLocaleString(this.language,{maximumFractionDigits:3})}
 amount(v){return v===null?'—':this.number(v)+' '+displayUnit(this.value.detail.summary.unit,this.unit)}
 targetGauge(value,target,label){
  const position=value===null?null:Math.max(0,Math.min(100,value/target*85));
  return `<div class="mrnd-single-gauge" role="img" aria-label="${e(this.m('average')+' '+this.amount(value)+', '+label+' '+this.amount(target))}"><svg width="100%" height="28" aria-hidden="true"><rect x="0" y="14" width="100%" height="10" rx="4" fill="#bcebcf"/><rect x="0" y="14" width="85%" height="10" fill="#414456"/><path d="M0 12v14" stroke="currentColor"/><svg x="85%" overflow="visible"><path d="M0 12v14" stroke="currentColor"/></svg>${position===null?'':`<svg x="${position}%" data-mrnd-marker overflow="visible"><path d="M-5 7h10L0 16z" fill="currentColor"/></svg>`}</svg><span>0</span><span>${e(label)}</span></div>`;
 }
 render(){const {report,detail:d}=this.value,row=d.summary,education=nutrientEducation(d.nutrient,this.language),canChart=row.meanTarget>0&&row.maximum>row.meanTarget&&!row.maximumSources.some(source=>source.comparisonSupported===false);this.dialog.querySelector('h2').textContent=mobileNutrientName(row,this.language);
 const dates=report.options.from+' – '+report.options.to,controls=d.controls,daily=controls.dailyTarget,ref=daily.reference;
 const hasReference=controls.customEditable&&known(ref?.value)&&['RDA','AI'].includes(ref.kind);
 const usesReference=hasReference&&daily.mode==='reference'&&ref.selected;
 const label=usesReference?this.n(ref.kind.toLowerCase()):this.n('target');
 const singleGauge=hasReference&&!canChart&&daily.effective>0&&controls.maximum.effective===null;
 const showSources=d.entries.length||d.unknownSources||d.omittedSources||!hasReference;
 const explanation=usesReference?this.m('referenceComparison'):this.m('customComparison');
 const values=hasReference?`<div><dt>${e(label)}</dt><dd data-mrnd-daily data-value="${daily.effective??''}">${e(this.amount(daily.effective))}</dd></div>`:'';
 const averageTarget=!hasReference||row.meanTarget!==null&&row.meanTarget!==daily.effective?`<div><dt>${e(this.m('target'))}</dt><dd data-mrnd-target data-value="${row.meanTarget??''}">${e(this.amount(row.meanTarget))}</dd></div>`:'';
 const toggle=hasReference?`<label class="mnd-toggle"><span>${e(this.m('customSwitch'))}</span><input type="checkbox" class="dc-switch" data-mrnd-custom role="switch" ${controls.custom?'checked':''}></label><p data-mrnd-error role="alert"></p>`:'';
 this.dialog.classList.toggle('mrnd-reference',hasReference);
 this.root.innerHTML=`<section data-mrnd-ready data-from="${e(report.options.from)}" data-to="${e(report.options.to)}" data-nutrient="${e(d.nutrient)}">${hasReference?'':'<p class="mrnd-range">'+e(dates)+'</p>'}<section class="mnd-card"><h3>${e(this.n('targets'))}<button type="button" data-mrnd-help aria-label="${e(this.n('help'))}"><img src="/report-mobile-source/score-icons/help-circle-outline.svg" alt=""></button></h3>${hasReference?'<p class="mrnd-explanation">'+e(explanation)+'</p>':''}${singleGauge?this.targetGauge(row.mean,daily.effective,usesReference?ref.kind:this.m('chartTarget')):''}${canChart?'<div class="mnd-chart"><canvas data-mrnd-chart role="img" aria-label="'+e(this.m('average')+': '+this.amount(row.mean)+', '+this.m('target')+': '+this.amount(row.meanTarget))+'"></canvas></div>':''}<dl class="mnd-values"><div class="mnd-consumed"><dt>${e(this.m('average'))}</dt><dd data-mrnd-average data-value="${row.mean??''}">${e(this.amount(row.mean))}</dd></div>${values}${averageTarget}${row.maximum!==null?`<div><dt>${e(this.m('maximum'))}</dt><dd>${e(this.amount(row.maximum))}</dd></div>`:''}</dl><small class="mnd-coverage">${e(this.m('days',{known:row.knownDays,total:row.eligibleDays}))}${row.partialDays?' · '+e(this.m('partial',{count:row.partialDays})):''}</small>${toggle}</section>${showSources?`<h3 class="mnd-section">${e(this.n('sources'))}</h3><div class="mnd-sources">${d.entries.map(entry=>`<div class="mrnd-source" data-mrnd-source="${e(entry.id??'water')}" data-date="${e(entry.date)}"><div><strong>${e(entry.kind==='water'?this.n('water'):entry.name)}</strong><small>${e(entry.date)}</small></div><span data-mrnd-source-value data-value="${entry.mean}">${e(this.amount(entry.mean))}</span><span>${entry.percentOfTarget===null?'—':e(entry.percentOfTarget.toLocaleString(this.language,{maximumFractionDigits:0}))+'%'}</span></div>`).join('')||'<p class="mnd-card">'+e(this.n('empty'))+'</p>'}</div>${d.omittedSources||d.unknownSources?'<p class="mrnd-source-note">'+e([d.omittedSources?this.m('omitted',{count:d.omittedSources}):'',d.unknownSources?this.m('unmeasured',{count:d.unknownSources}):''].filter(Boolean).join(' · '))+'</p>':''}` : ''}${education?`<h3 class="mnd-section">${e(this.n('function'))}</h3><div class="mnd-card">${e(education.function)}</div><h3 class="mnd-section">${e(this.n('foods'))}</h3><div class="mnd-card">${e(education.sources)}<a class="mnd-education-source" href="${e(education.source.url)}" target="_blank" rel="noopener noreferrer">${e(education.source.label)}</a></div>`:''}</section>`;
 if(canChart)void this.chart.render(this.root.querySelector('[data-mrnd-chart]'),{value:row.mean,target:row.meanTarget,maximum:row.maximum,labels:{target:this.m('chartTarget'),maximum:this.m('chartMaximum')}});
 }
 helpMarkup(){const {report,detail:d}=this.value,o=report.options;return `<section data-mrnd-help-content><p>${e(o.from+' – '+o.to)}</p><p>${e(this.m('policyDate',{date:d.targetDate}))}</p><p>${e(this.m('method',{count:d.denominator}))}</p><dl class="mnd-values"><div><dt>${e(formatMessage(this.language,'mobileReport.days'))}</dt><dd>${e(formatMessage(this.language,'mobileReport.filter.'+o.dayFilter))}</dd></div>${['includeToday','includeSupplements'].map(key=>`<div><dt>${e(formatMessage(this.language,'mobileReport.'+(key==='includeToday'?'today':'supplements')))}</dt><dd>${e(this.m(o[key]?'yes':'no'))}</dd></div>`).join('')}</dl><p>${e(this.m('sourcesHelp'))}</p><p>${e(this.m('targetsHelp'))}</p>${d.summary.maximumRange&&d.summary.maximum===null?'<p>'+e(this.m('maximumRange',{from:this.amount(d.summary.maximumRange.minimum),to:this.amount(d.summary.maximumRange.maximum)}))+'</p>':''}<p>${e(this.n('range'))}</p></section>`}
 dispose(){this.disposed=true;this.controller?.abort();this.events.abort();this.chart.clear()}
}
