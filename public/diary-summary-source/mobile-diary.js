import {formatMessage} from './message-format.js';
import {escape as e} from '../html.js';
import {chartLibrary,chartColor} from '../dashboard-source/chart-library.js';
import {displayValue,displayUnit} from '../dashboard-source/energy-display.js';

// View-only state survives diary mutations and tab changes; no health data is stored here.
export const mobileDiarySession={page:0,groups:new Map()};
const number=(v,language,digits=1)=>Number.isFinite(v)?v.toLocaleString(language,{maximumFractionDigits:digits}):'—';
const button=(label,action,extra='')=>`<button type="button" data-action="${action}" ${extra}>${label}</button>`;
export const diarySymbol=name=>`<span class="md-symbol" aria-hidden="true">${e(name)}</span>`;

export function mobileDiaryHeader({date,today,complete,icons,menu,labels,language}){
 const label=date===today?labels.today:new Date(date+'T12:00:00').toLocaleDateString(language,{month:'short',day:'numeric'});
 return `<div class="md-date-bar">${button(icons.check,'complete-day',`class="md-complete ${complete?'is-complete':''}" data-completed="${!complete}" aria-label="${e(complete?labels.reopen:labels.complete)}"`)}<div class="md-date-controls">${button(icons.back,'prev-day',`aria-label="${e(labels.previous)}"`)}<button type="button" class="md-date-label" data-md-calendar aria-label="${e(labels.date)}">${e(label)}</button>${button(icons.chevron,'next-day',`aria-label="${e(labels.next)}"`)}</div>${menu.replace('>•••</summary>','>'+icons.more+'</summary>')}</div>`;
}

export function mobileDiaryGroups({groups,configuredGroups=groups,records,renderRow,selectBox,icons,labels,showGroups=true,subtotal=()=>''}){
 if(!showGroups)return `<section class="md-group"><table class="diary-table md-records"><tbody>${records.map(renderRow).join('')}</tbody></table></section>`;
 return groups.map(group=>{
  const rows=records.filter(row=>row.group===group),open=mobileDiarySession.groups.get(group)??rows.length>0,configured=configuredGroups.includes(group);
  return `<details class="md-group" data-md-group="${e(group)}" ${configured?`data-diary-drop-group="${e(group)}"`:''} ${open?'open':''}><summary>${button(icons.plus,configured?'group-quick-add':'add-food',`class="md-group-add" ${configured?`data-group="${e(group)}"`:''} aria-label="${e(labels.add)}: ${e(group)}"`)}${configured?selectBox(group):''}<strong>${e(group)}</strong>${subtotal(group)}<span class="md-group-chevron">${icons.chevron}</span></summary><table class="diary-table md-records"><tbody>${rows.map(renderRow).join('')}</tbody></table></details>`;
 }).join('');
}

export function mobileDiaryRecord({id,collection,name,meta,amount,icon,selectBox,action,extra=''}){
 return `<tr data-diary-record data-collection="${e(collection)}" data-id="${e(id)}"><td><div class="md-record">${selectBox}<button type="button" class="md-record-menu" data-md-context aria-label="${e(name)}: actions">${icon}</button><div class="md-record-text">${button(`<span class="food-name">${e(name)}</span>`,action,`class="entry-name" data-id="${e(id)}"`)}<div class="food-meta">${meta}</div>${extra}</div></div></td><td ${collection==='entries'?`data-diary-summary-entry="${e(id)}"`:''}>${amount}</td></tr>`;
}

export function mobileDiarySummary({summary,facts,settings,unit,language,labels,icons,macroMode,scores,nutrientName,scoreName}){
 const pages=[],energy=summary.energy??{},selected=facts?.scope==='selection',consumed=selected?facts.totals?.calories:energy.consumed;
 const ring=(id,label,value)=>button(`<span class="md-ring"><canvas data-md-ring="${id}" role="img" aria-label="${e(label)}"></canvas><span><strong>${number(displayValue(value??0,'kcal',unit),language,0)}</strong><small>${e(unit)}</small></span></span><strong>${e(label)}</strong>`,'mobile-diary-energy',`class="md-energy-item" data-kind="${id}"`);
 if(settings.showEnergy!==false)pages.push({id:'energy',title:labels.energy,body:`<div class="md-summary-heading">${button(e(labels.energy)+icons.chevron,'mobile-diary-energy')} ${button(e(labels.target),'edit-day-targets')}</div><div class="md-energy-rings">${ring('consumed',labels.consumed,consumed)}${ring('expenditure',labels.expenditure,energy.expenditure)}${ring('remaining',labels.remaining,selected&&Number.isFinite(consumed)?energy.target-consumed:energy.remaining)}</div>`});
 const targetRow=(row,kind)=>{
  const value=macroMode==='remaining'&&kind==='macros'?row.remaining:row.value,amount=displayValue(value,row.unit,unit),target=displayValue(row.target,row.unit,unit),empty=row.coverage?.total===0;
  const shown=Number.isFinite(amount)?amount:empty&&row.active?kind==='macros'&&macroMode==='remaining'?target:0:null,pct=Number.isFinite(shown)&&target>0?shown/target*100:null;
  return button(`<span><strong>${e(nutrientName(row))}</strong>${kind==='macros'?` - ${number(shown,language)} / ${number(target,language)} ${e(displayUnit(row.unit,unit))}`:''}</span><small>${pct===null?'—':number(pct,language,0)+'%'}</small><progress max="100" value="${Math.min(100,Math.max(0,pct??0))}" aria-label="${e(nutrientName(row))}"></progress>`,'nutrient-contributors',`class="md-target md-target-${e(row.id)}" data-id="${e(row.id)}"`);
 };
 if(settings.pauseLife?.enabled){
  const title=formatMessage(language,'mobileDisplay.pauseLife'),caption=formatMessage(language,'mobileDisplay.macrosConsumed');
  pages.unshift({id:'pauseLife',title,body:`<div class="md-pause-life" data-program="${e(settings.pauseLife.program)}"><div class="md-pause-brand"><div class="md-pause-name" aria-label="The Pause Life"><span>THE</span><strong>&#8216;PAUSE</strong><span>LIFE</span></div><span class="md-ring"><canvas data-md-ring="consumed" data-pause-ring role="img" aria-label="${e(caption)}"></canvas><span><small>${e(caption)}</small></span></span></div><div class="md-macros">${(facts.diaryDisplay?.macros??[]).map(row=>targetRow(row,'pauseLife')).join('')}</div></div>`});
 }
 if(settings.showMacros!==false)pages.push({id:'macros',title:labels.macros,body:`<div class="md-summary-heading">${button(e(labels.macros)+icons.chevron,'edit-day-targets')}${button(e(macroMode==='remaining'?labels.remaining:labels.consumed),'toggle-macro-display')}</div><div class="md-macros">${(facts.diaryDisplay?.macros??[]).map(row=>targetRow(row,'macros')).join('')}</div>`});
 if(facts.diaryDisplay?.policy.showHighlights!==false)pages.push({id:'highlights',title:labels.highlights,body:`<div class="md-summary-heading">${button(e(labels.highlights)+icons.chevron,'configure-diary-display')}${button(icons.more,'all-nutrients',`aria-label="${e(labels.report)}"`)}</div><div class="md-highlights" data-md-rows="${Math.max(1,Math.ceil((facts.diaryDisplay?.highlights?.length??0)/2))}">${(facts.diaryDisplay?.highlights??[]).map(row=>targetRow(row,'highlights')).join('')}</div>`});
 if(settings.showScores!==false)pages.push({id:'scores',title:labels.scores,body:`<div class="md-summary-heading">${button(e(labels.scores)+icons.chevron,'choose-scores')}</div><div class="md-highlights" data-md-rows="${Math.max(1,Math.ceil(scores.length/2))}">${scores.map(row=>button(`<span><strong>${e(scoreName(row))}</strong></span><small>${row.value===null?'—':number(row.value,language,0)+'%'}</small><progress value="${row.value??0}" max="100" aria-label="${e(scoreName(row))}"></progress>`,'score-details',`class="md-target md-score" data-id="${e(row.id)}"`)).join('')}</div>`});
 if(!pages.length)return '';
 const index=Math.min(mobileDiarySession.page,pages.length-1);
 return `<section class="md-summary" data-md-summary aria-label="${e(labels.summary)}">${selected?`<div class="md-scope">${e(labels.selected)}</div>`:''}<div class="md-summary-track">${pages.map((page,i)=>`<div class="md-summary-page" data-md-page="${i}" data-md-page-id="${page.id}" ${i!==index?'hidden':''}>${page.body}</div>`).join('')}</div><div class="md-pagination"><button type="button" data-md-step="-1" aria-label="${e(labels.previous)}">${icons.back}</button>${pages.map((page,i)=>`<button type="button" data-md-dot="${i}" aria-label="${e(page.title)}" aria-pressed="${i===index}"><span></span></button>`).join('')}<button type="button" data-md-step="1" aria-label="${e(labels.next)}">${icons.chevron}</button></div><p class="md-chart-error" role="status"></p></section>`;
}

export class MobileDiary {
 constructor({root,header,summary,context,onSummary,onDatePicker}){
  Object.assign(this,{root,header,context,onSummary,onDatePicker});this.charts=[];this.generation=0;this.abort=new AbortController();const options={signal:this.abort.signal};
  root.addEventListener('click',event=>{
   const dot=event.target.closest('[data-md-dot]'),step=event.target.closest('[data-md-step]');
   if(dot||step)this.showPage(dot?Number(dot.dataset.mdDot):mobileDiarySession.page+Number(step.dataset.mdStep));
   if(event.target.closest('[data-md-context]'))context(event);
   if(event.target.closest('.md-group summary button,.md-water summary button'))event.preventDefault();
  },options);
  root.addEventListener('toggle',event=>{if(event.target.matches('[data-md-group]'))mobileDiarySession.groups.set(event.target.dataset.mdGroup,event.target.open);},{...options,capture:true});
  let start=null;
  root.addEventListener('pointerdown',event=>{start=event.target.closest('[data-md-summary]')?{x:event.clientX,y:event.clientY}:null;},options);
  root.addEventListener('pointerup',event=>{if(start&&Math.abs(event.clientX-start.x)>55&&Math.abs(event.clientY-start.y)<40)this.showPage(mobileDiarySession.page+(event.clientX<start.x?1:-1));start=null;},options);
  document.addEventListener('pointerdown',event=>{const menu=header.querySelector('details[open]');if(menu&&!menu.contains(event.target))menu.open=false;},options);
  header.addEventListener('click',event=>{if(event.target.closest('[data-md-calendar]')){header.querySelectorAll('details[open]').forEach(el=>el.open=false);onDatePicker();}if(event.target.closest('[data-action]'))header.querySelectorAll('details[open]').forEach(el=>el.open=false);},options);
  window.addEventListener('nourishing-back',event=>{const menu=header.querySelector('details[open]');if(menu){menu.open=false;event.preventDefault();event.stopImmediatePropagation();}},{...options,capture:true});
  void this.draw(summary);
 }
 showPage(index){const pages=[...this.root.querySelectorAll('[data-md-page]')];if(!pages.length)return;index=(index+pages.length)%pages.length;mobileDiarySession.page=index;pages.forEach((page,i)=>page.hidden=i!==index);this.root.querySelectorAll('[data-md-dot]').forEach((dot,i)=>dot.setAttribute('aria-pressed',String(i===index)));this.charts.forEach(chart=>chart.resize());}
 update(html,summary){const old=this.root.querySelector('[data-md-summary]');if(old)old.outerHTML=html;void this.draw(summary);}
 async draw(summary){
  const generation=++this.generation;this.charts.forEach(c=>c.destroy());this.charts=[];
  let Chart;try{Chart=await chartLibrary();}catch(error){if(generation===this.generation){const status=this.root.querySelector('.md-chart-error');if(status)status.textContent=error.message;}return;}
  if(generation!==this.generation||!this.root.isConnected)return;
  const energy=summary.energy??{},consumed=summary.consumedEnergy?.values,expenditure=summary.expenditureBreakdown?.components;
  const slices={consumed:consumed?['fat','protein','carbohydrate','alcohol','unattributed'].map(id=>consumed[id]):[],expenditure:expenditure?.map(row=>row.mean)??[],remaining:[Math.max(0,energy.consumed??0),Math.max(0,energy.remaining??0)]};
  const colors={consumed:['#be78ce','#61ce91','#41c8d4','#e5b965','#73798c'],expenditure:['#f7d4f0','#db80ca','#eaa66d','#65baad','#e0ce70'],remaining:['#ff8050','#414456']};
  for(const canvas of this.root.querySelectorAll('[data-md-ring]')){
   const kind=canvas.dataset.mdRing,rows=slices[kind],known=rows.length&&rows.every(v=>Number.isFinite(v)&&v>=0)&&rows.some(v=>v>0);
   this.charts.push(new Chart(canvas,{type:'doughnut',data:{datasets:[{data:known?rows:[1],backgroundColor:context=>!known||kind==='remaining'&&context.dataIndex===1?chartColor('pale')():colors[kind][context.dataIndex],borderWidth:kind==='consumed'?1:0,borderColor:chartColor('paper')}]},options:{responsive:true,maintainAspectRatio:false,cutout:'84%',animation:false,events:[],plugins:{legend:{display:false},tooltip:{enabled:false}}}}));
  }
 }
 dispose(){this.generation++;this.abort.abort();this.charts.forEach(chart=>chart.destroy());this.charts=[];}
}
