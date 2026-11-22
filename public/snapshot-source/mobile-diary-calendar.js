import {pushBackHandler} from '../back-history.js';
import {escape as e} from '../html.js';
import {formatMessage} from './message-format.js';
import {diaryCalendarKinds} from './diary-calendar.mjs';
const icon=name=>`<img src="/snapshot-source/${name}.svg" alt="">`;
export const calendarMarker=kind=>`<i class="mdc-marker mdc-${kind}" aria-hidden="true"></i>`;
export class MobileDiaryCalendar {
 constructor({loadMonth,date,language,onChoose,onClose,showDiaryMarkers=true,label,className}){
  Object.assign(this,{loadMonth,showDiaryMarkers,selected:date,month:date.slice(0,7),language,onChoose,onClose});this.focus=document.activeElement;this.dialog=document.createElement('dialog');this.dialog.className='mdc-dialog';if(className)this.dialog.classList.add(className);this.dialog.setAttribute('aria-label',label??formatMessage(language,'mobileDisplay.calendar'));
  this.text=(key,values)=>formatMessage(language,'mobileDisplay.'+key,values);this.dialog.addEventListener('cancel',event=>{event.preventDefault();this.back()});
  this.dialog.addEventListener('click',event=>{const button=event.target.closest('button');if(button?.dataset.mdcDate){this.selected=button.dataset.mdcDate;this.render();this.dialog.querySelector(`[data-mdc-date="${this.selected}"]`)?.focus({preventScroll:true})}if(button?.dataset.mdcMonth){const d=new Date(this.month+'-01T12:00:00Z');d.setUTCMonth(d.getUTCMonth()+Number(button.dataset.mdcMonth));if(d.getUTCFullYear()>=1&&d.getUTCFullYear()<=9999){this.month=d.toISOString().slice(0,7);this.render();void this.refreshMonth()}}if(button?.hasAttribute('data-mdc-retry'))void this.refreshMonth();if(button?.hasAttribute('data-mdc-legend'))this.openLegend();if(button?.hasAttribute('data-mdc-back'))this.back();if(button?.hasAttribute('data-mdc-cancel'))this.close();if(button?.hasAttribute('data-mdc-apply')){const chosen=this.selected;this.close();void this.onChoose(chosen)}if(event.target===this.dialog){const b=this.dialog.getBoundingClientRect();if(event.clientX<b.left||event.clientX>b.right||event.clientY<b.top||event.clientY>b.bottom)this.back()}});
  this.dialog.addEventListener('change',event=>{if(event.target.matches('[data-mdc-jump]')&&/^\d{4}-\d{2}$/.test(event.target.value)){this.month=event.target.value;this.render();void this.refreshMonth()}});
  document.body.append(this.dialog);this.render();this.dialog.showModal();
  if(showDiaryMarkers)this.backHandle=pushBackHandler(()=>{if(this.legendDialog){this.closeLegend();return 'keep';}this.close();});
  void this.refreshMonth();
 }
 openLegend(){
  if(this.legendDialog)return;
  const t=this.text,legend=document.createElement('dialog');legend.className='mdc-legend';legend.setAttribute('aria-label',t('legend'));
  legend.innerHTML=`<h2 tabindex="-1" autofocus>${e(t('legend'))}</h2>${diaryCalendarKinds.map(kind=>`<p>${calendarMarker(kind)}${e(t('kind.'+kind))}</p>`).join('')}${['today','selected','logged','complete'].map(state=>`<p><i class="mdc-state is-${state}" aria-hidden="true"></i>${e(t('state.'+state))}</p>`).join('')}<button data-mdc-back type="button">${e(t('back'))}</button>`;
  legend.addEventListener('cancel',event=>{event.preventDefault();event.stopPropagation();this.closeLegend()});
  legend.addEventListener('click',event=>{event.stopPropagation();const rect=legend.getBoundingClientRect();if(event.target.closest('[data-mdc-back]')||event.target===legend&&(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom))this.closeLegend()});
  this.legendDialog=legend;this.dialog.append(legend);legend.showModal();
 }
 closeLegend(){
  if(!this.legendDialog)return;this.legendDialog.close();this.legendDialog.remove();this.legendDialog=null;this.render();
  this.dialog.querySelector('[data-mdc-legend]')?.focus({preventScroll:true});
 }
 render(){
  if(this.legendDialog)return;const t=this.text;
  const start=new Date(this.month+'-01T12:00:00Z'),end=new Date(start);end.setUTCMonth(end.getUTCMonth()+1);end.setUTCDate(0);const projection=this.showDiaryMarkers&&this.projection?.month===this.month?this.projection:null,markers=projection?.markers??{},selected=new Date(this.selected+'T12:00:00Z'),format=(d,options)=>d.toLocaleDateString(this.language,{timeZone:'UTC',...options});
  this.dialog.innerHTML=`<header><span>${e(format(selected,{year:'numeric'}))}</span><h2>${e(format(selected,{weekday:'short',month:'short',day:'numeric'}))}</h2></header><div class="mdc-month"><button type="button" data-mdc-month="-1" aria-label="${e(t('previousMonth'))}">${icon('chevron-left')}</button><label><span>${e(format(start,{month:'long',year:'numeric'}))}</span><input type="month" data-mdc-jump value="${this.month}" aria-label="${e(t('month'))}"></label><button type="button" data-mdc-month="1" aria-label="${e(t('nextMonth'))}">${icon('chevron-right')}</button></div><div class="mdc-days"><div class="mdc-weekdays">${Array.from({length:7},(_,i)=>`<span>${e(format(new Date(Date.UTC(2026,10,1+i)),{weekday:'narrow'}))}</span>`).join('')}</div><div class="mdc-grid">${'<span></span>'.repeat(start.getUTCDay())}${Array.from({length:end.getUTCDate()},(_,i)=>{const day=this.month+'-'+String(i+1).padStart(2,'0'),kinds=markers[day]??[],complete=projection?.completedDays.includes(day),logged=projection?.loggedDays?.includes(day)??kinds.some(kind=>kind!=='fast'),today=projection?.calendar.today===day;const states=[...(today?['today']:[]),...(complete?['complete']:logged?['logged']:[])];const labels=[day,...states.map(key=>t('state.'+key)),...kinds.map(kind=>t('kind.'+kind))];return `<button type="button" data-mdc-date="${day}" aria-pressed="${day===this.selected}" aria-label="${e(labels.join(', '))}" ${today?'aria-current="date"':''} class="${states.map(key=>'is-'+key).join(' ')}"><span>${i+1}</span><small>${kinds.map(calendarMarker).join('')}</small></button>`}).join('')}</div></div>${this.showDiaryMarkers?`<p class="mdc-status" role="status">${this.loading?'Loading…':this.error?e(this.error)+' <button type="button" data-mdc-retry>Try again</button>':''}</p>`:''}<footer>${this.showDiaryMarkers?`<button type="button" data-mdc-legend>${e(t('legend'))}</button>`:''}<span></span><button type="button" data-mdc-cancel>${e(t('cancel'))}</button><button type="button" data-mdc-apply>${e(t('ok'))}</button></footer>`;
 }
 async refreshMonth(){
  if(!this.showDiaryMarkers||this.closed)return;this.fetchAbort?.abort();const abort=new AbortController();this.fetchAbort=abort;const month=this.month;this.loading=true;this.error=null;this.render();
  try{const projection=await this.loadMonth(month,abort.signal);if(this.closed||this.fetchAbort!==abort)return;this.projection=projection;}
  catch(error){if(this.closed||this.fetchAbort!==abort)return;this.error=error.message;}
  finally{if(!this.closed&&this.fetchAbort===abort){this.loading=false;this.render();}}
 }
 back(){if(this.legendDialog){this.closeLegend();return true}this.close();return true}
 close(){if(this.closed)return;this.closed=true;this.fetchAbort?.abort();this.backHandle?.release();this.legendDialog?.close();this.dialog.close();this.dialog.remove();if(this.focus?.isConnected)this.focus.focus({preventScroll:true});this.onClose?.()}
}
