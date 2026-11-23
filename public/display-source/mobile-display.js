import {t,uiLanguage,appLanguages} from '../app-language.js';
import {diaryQuickAddAction} from '../local-diary-projection.js';
import {coreText} from '../core-cloud-messages.js';
import {isStandardMobileNutrient,mobileNutrientName} from '../mobile-nutrient-groups.js';
import {formatMessage as targetMessage} from '../targets-source/message-format.js';
import {mobileDiarySettings,mobileQuickAddSettings} from './mobile-diary-settings.js';
import {visibleDiaryCalendarKinds} from '../snapshot-source/diary-calendar.mjs';
import {calendarMarker} from '../snapshot-source/mobile-diary-calendar.js';
import {escape as e} from '../html.js';
import {diaryGroupSlots} from '../local-group-rename.js';
import {waterText} from '../water-messages.js';
const icon='<img src="/more-source/icons/chevron-right.svg" alt="">';
const toggles=()=>[['showTimestamp',t('mobileDisplay.showTimestamp')],['showEnergy',t('mobileDisplay.showEnergy')],['showMacros',t('mobileDisplay.showMacros')],['showHighlights',t('mobileDisplay.showHighlights')],['showWater',t('mobileDisplay.showWater')]];
const listScreens=new Set(['energyUnit','summaryNutrient','groupSubtotals']);
const subtotalModes=()=>[['none',t('settings.none')],['calories',t('targetSetup.macro.calories')],['macros',t('settings.macroLabel')],['summary',coreText('display.sameSummary')]];
const themes=systemLabel=>[['light',t('settings.light')],['dark',t('settings.dark')],['system',systemLabel]];
const fontScaleNumber=scale=>Number(scale).toLocaleString(uiLanguage(),{minimumFractionDigits:2,maximumFractionDigits:2});
function fontScaleControl(settings){
 const scale=fontScaleNumber(settings.fontScale),factor=uiLanguage()==='en'?'x':'×';
 const minimum=0.75,maximum=2;
 return `<section class="mds-font"><p>${e(coreText('display.fontHelp'))}</p>
  <label for="mds-font" data-display-font-value>${e(t('mobileDisplay.customFont',{scale}))}</label>
  <div class="mds-font-control">
   <div class="mds-font-track" aria-hidden="true"><progress max="${maximum-minimum}" value="${settings.fontScale-minimum}"></progress><span class="mds-font-ticks">${'<i></i>'.repeat(6)}</span></div>
   <input id="mds-font" type="range" data-display-font aria-label="${e(coreText('display.customFont'))}" aria-valuetext="${e(coreText('display.scaleValue',{scale}))}" min="${minimum}" max="${maximum}" step="0.05" value="${settings.fontScale}" ${settings.matchDeviceFontSize?'disabled':''}>
  </div><div class="mds-font-limits"><span>${fontScaleNumber(minimum)+factor}</span><span>${fontScaleNumber(maximum)+factor}</span></div></section>`;
}
/** Saved MobileDisplay rows and modal choices, bounded to working cloud consumers. */
export class MobileDisplay {
 constructor({root,settings,summaryNutrients,quickAddActions,navigation,onTitle,onSave,onReload,onDestination}){Object.assign(this,{root,settings,summaryNutrients,quickAddActions,navigation,onTitle,onSave,onReload,onDestination});this.alive=true;this.saving=false;this.pending=null;this.events=new AbortController();const {signal}=this.events;
  root.addEventListener('click',event=>{const key=event.target.closest('[data-display-open]')?.dataset.displayOpen;if(key)this.open(key);},{signal});
  root.addEventListener('input',event=>{
   const input=event.target;if(!input.matches('[data-display-font]'))return;
   const scale=fontScaleNumber(input.value);
   root.querySelector('[data-display-font-value]').textContent=t('mobileDisplay.customFont',{scale});
   root.querySelector('.mds-font-track progress').value=input.valueAsNumber-Number(input.min);
   input.setAttribute('aria-valuetext',coreText('display.scaleValue',{scale}));
  },{signal});
  root.addEventListener('focusout',event=>{
   const row=event.target.closest('[data-group-slot]');
   if(!row||row.contains(event.relatedTarget))return;
   this.editGroup(row);
  },{signal});
  root.addEventListener('keydown',event=>{
   if(!event.target.matches('[data-group-name]')||event.isComposing)return;
   if(event.key==='Escape'){event.preventDefault();event.target.value=event.target.defaultValue;event.target.blur();}
   if(event.key==='Enter'){event.preventDefault();event.target.blur();}
  },{signal});
  root.addEventListener('change',event=>{if(event.target.matches('[data-group-enabled]')){this.editGroup(event.target.closest('[data-group-slot]'));return;}if(event.target.matches('[data-display-font]')){const restoreFocus=document.activeElement===event.target;
    void this.save({fontScale:Number(event.target.value)}).then(()=>{
     if(restoreFocus&&this.alive&&document.activeElement===document.body)this.root.querySelector('[data-display-font]:enabled')?.focus({preventScroll:true});
    });return;}const key=event.target.dataset.displayToggle;if(!key)return;void this.save(key==='showGroups'?{diaryGroups:{...this.settings.diaryGroups,showGroups:event.target.checked}}:key.startsWith('calendar:')?{diaryCalendar:{...this.settings.diaryCalendar,[key.slice(9)]:event.target.checked}}:key==='showHighlights'?{diaryDisplay:{...this.settings.diaryDisplay,showHighlights:event.target.checked}}:{[key]:event.target.checked});},{signal});root.addEventListener('toggle',event=>{if(event.target.matches('[data-display-groups]'))this.groupsOpen=event.target.open;},{signal,capture:true});this.render();
 }
 toggle(key,label,value){return `<label class="mds-row"><strong>${e(label)}</strong><input type="checkbox" role="switch" class="dc-switch" data-display-toggle="${e(key)}" ${value?'checked':''}></label>`;}
 editGroup(row){
  if(this.saving||this.pending||!this.alive)return;
  const slot=Number(row.dataset.groupSlot),from=diaryGroupSlots(this.settings)[slot-1];
  const input=row.querySelector('[data-group-name]'),enabled=row.querySelector('[data-group-enabled]').checked;
  const entered=input.value.trim();
  if(from===null&&!enabled&&!entered)return;
  const name=from===null&&!entered?input.placeholder:entered;
  if(name===from&&enabled===!this.settings.diaryGroups.hiddenGroups.includes(from))return;
  void this.save({slot,from,name,enabled},null,'group.editSlot');
 }
 row(key,label,value=''){return `<button type="button" class="mds-row" data-display-open="${e(key)}"><strong>${e(label)}</strong>${value?`<span class="mds-value">${e(value)}</span>`:''}${icon}</button>`;}
 summaryLabel(id){
  if(id==='none')return t('settings.none');
  if(id==='calories')return coreText('display.energyConsumed');
  return mobileNutrientName(this.summaryNutrients.find(row=>row.id===id),uiLanguage());
 }
 renderList(key){
  const current=key==='energyUnit'?this.settings.energyUnit:this.settings.diaryTable[key];
  const currentLanguage=uiLanguage(),additional=[];
  let rows;
  if(key==='energyUnit')rows=[['kcal',t('mobileDisplay.kcal')],['kJ',t('mobileDisplay.kJ')]];
  else if(key==='groupSubtotals')rows=subtotalModes();
  else{
   rows=[['calories',this.summaryLabel('calories')],['none',this.summaryLabel('none')]];
   const nutrients=this.summaryNutrients.filter(row=>row.id!=='calories').map(row=>[row.id,mobileNutrientName(row,currentLanguage)]);
   nutrients.sort((a,b)=>a[1].localeCompare(b[1],currentLanguage));
   for(const choice of nutrients){
    const id=choice[0];
    const group=isStandardMobileNutrient(id)||id==='netCarbohydrate'||id===current?rows:additional;
    group.push(choice);
   }
  }
  const choices=items=>items.map(([id,label])=>`<button type="button" class="mds-row" data-display-choice="${e(id)}" aria-pressed="${id===current}"><span>${e(label)}</span>${id===current?'<span class="mds-check" aria-hidden="true">✓</span>':''}</button>`).join('');
  const extra=additional.length?`<details class="mds-additional"><summary>${e(targetMessage(currentLanguage,'mobileNutrientTargets.additional'))}</summary>${choices(additional)}</details>`:'';
  this.onTitle(coreText({energyUnit:'display.updateUnit',summaryNutrient:'display.selectNutrient',groupSubtotals:'display.subtotals'}[key]));
  this.root.innerHTML=`<div data-display-root aria-busy="${this.saving}"><section class="mds-group mds-choice-list">${choices(rows)}${extra}</section><p class="mds-status" role="status"></p></div>`;
  for(const button of this.root.querySelectorAll('[data-display-choice]'))button.onclick=()=>{
   if(this.saving||this.pending)return;
   const value=button.dataset.displayChoice;
   if(value===current){this.back();return;}
   const patch=key==='energyUnit'?{energyUnit:value}:{diaryTable:{...this.settings.diaryTable,[key]:value}};
   void this.save(patch);
  };
  this.lock();
 }
 renderCalendar(){
  this.onTitle(t('mobileDisplay.calendar'));
  const rows=visibleDiaryCalendarKinds.map(kind=>{
   const label=e(t('mobileDisplay.kind.'+kind));
   const checked=this.settings.diaryCalendar[kind]?' checked':'';
   return `<label class="mds-row">${calendarMarker(kind)}<strong>${label}</strong><input type="checkbox" role="switch" class="dc-switch" data-display-toggle="calendar:${kind}"${checked}></label>`;
  }).join('');
  this.root.innerHTML=`<div class="mds-calendar-settings" data-display-root aria-busy="${this.saving}">
   <section class="mds-group">${rows}</section><p class="mds-calendar-help">${e(coreText('display.calendarHelp'))}</p>
   <p class="mds-status" role="status" aria-live="polite"></p></div>`;
  this.lock();
 }
 overview(){
  const settings=this.settings;
  const [timestamp,...sections]=toggles();
  const toggle=([key,label])=>this.toggle(key,label,key==='showHighlights'?settings.diaryDisplay.showHighlights:settings[key]);
  const rows=[
   this.row('energyUnit',t('mobileDisplay.units'),settings.energyUnit==='kJ'?t('mobileDisplay.kJ'):t('mobileDisplay.kcal')),
   toggle(timestamp),
   this.row('summaryNutrient',t('mobileDisplay.summaryNutrient'),this.summaryLabel(settings.diaryTable.summaryNutrient)),
   ...sections.map(toggle),
   this.row('pauseLife',t('mobileDisplay.pauseLife'),''),
   this.row('dashboard',t('discover.title.dashboard-settings'),''),
   this.row('diary',t('mobileDisplay.diary'),''),
   this.row('calendar',t('mobileDisplay.calendar'),''),
   this.row('theme',t('mobileDisplay.theme')),
   this.row('fontScale',t('mobileDisplay.fontScale')),
   this.row('appLanguage',t('mobileDisplay.appLanguage'))
  ];
  return `<section class="mds-group mds-overview">${rows.join('')}</section><section class="mds-group mds-overview">${this.row('water',waterText('settings'),'')}</section>`;
 }
 render(){
  const screen=this.navigation.screen;
  if(screen==='calendar'){this.renderCalendar();return;}
  if(listScreens.has(screen)){this.renderList(screen);return;}
  const settings=this.settings,child={settings,row:this.row.bind(this),toggle:this.toggle.bind(this),groupsOpen:this.groupsOpen};
  let body,title;
  switch(screen){
   case 'fontScale':
    title=t('mobileDisplay.fontScale');
    body=`<section class="mds-group mds-font-mode">${this.toggle('matchDeviceFontSize',coreText('display.browserSize'),settings.matchDeviceFontSize)}</section>${fontScaleControl(settings)}`;
    break;
   case 'diary': title=t('mobileDisplay.diary');body=mobileDiarySettings(child);break;
   case 'quickAdd': title=t('mobileDisplay.quickAdd');body=mobileQuickAddSettings(child);break;
   default: title=t('mobileDisplay.title');body=this.overview();
  }
  this.onTitle(title);
  this.root.innerHTML=`<div data-display-root aria-busy="${this.saving}">${body}<p class="mds-status" role="status" aria-live="polite"></p></div>`;
  this.lock();
 }

 lock(){for(const node of [...this.root.querySelectorAll('input,button:not([data-display-retry]):not([data-display-reload])'),...this.dialog?.querySelectorAll('input,[data-display-apply]')??[]])node.disabled=this.saving||!!this.pending||node.hasAttribute('data-display-font')&&this.settings.matchDeviceFontSize;this.root.querySelector('[data-display-root]')?.setAttribute('aria-busy',String(this.saving));}
 open(key){if(this.saving||this.pending)return;if(['pauseLife','dashboard','water'].includes(key)){this.onDestination?.(key);return;}if(listScreens.has(key)||['diary','calendar','quickAdd','fontScale'].includes(key)){this.navigation.screen=key;this.render();window.scrollTo(0,0);return;}const options=key==='appLanguage'?appLanguages.map(({id,name})=>[id,name]):key.startsWith('quickAdd:')?this.quickAddActions.map(({id})=>[id,t('shortcut.'+id)]):key==='theme'?themes(coreText('display.systemTheme')):null;if(!options)return;this.closeDialog();const dialog=document.createElement('dialog');this.dialog=dialog;this.returnFocus=document.activeElement;dialog.className=key==='theme'?'mds-dialog mds-theme-dialog settings-compact-dialog':'mds-dialog';dialog.setAttribute('aria-label',key.startsWith('quickAdd:')?key.slice(9):({appLanguage:t('mobileDisplay.appLanguage'),theme:t('mobileDisplay.changeTheme')})[key]);
  const selected=key.startsWith('quickAdd:')?diaryQuickAddAction(this.settings.diaryQuickAdd,key.slice(9)):this.settings[key];
  dialog.innerHTML=`<form><h2>${e(dialog.getAttribute('aria-label'))}</h2><div class="mds-choices">${options.map(([value,label])=>`<label><input type="radio" name="choice" value="${e(value)}" ${value===selected?'checked':''}><span>${e(label)}</span></label>`).join('')}</div><p role="status" aria-live="polite"></p><footer><button type="button" data-display-cancel>${e(t('mobileDisplay.cancel'))}</button><button type="submit" data-display-apply>${e(t('mobileDisplay.ok'))}</button></footer></form>`;
 dialog.addEventListener('cancel',event=>{event.preventDefault();this.closeDialog();});dialog.addEventListener('click',event=>{if(event.target.closest('[data-display-cancel]'))this.closeDialog();if(event.target===dialog){const b=dialog.getBoundingClientRect();if(event.clientX<b.left||event.clientX>b.right||event.clientY<b.top||event.clientY>b.bottom)this.closeDialog();}});
 dialog.querySelector('form').addEventListener('submit',event=>{event.preventDefault();const value=new FormData(event.target).get('choice');if(value!==null)void this.save(key.startsWith('quickAdd:')?{diaryQuickAdd:{version:1,shortcuts:[...this.settings.diaryQuickAdd.shortcuts.filter(row=>row.group!==key.slice(9)),{group:key.slice(9),action:value}]}}:{[key]:value},dialog);});document.body.append(dialog);dialog.showModal();
 }
 status(message,{retry=false,reload=false}={}){const target=this.dialog?.querySelector('[role=status]')??this.root.querySelector('[role=status]');target.replaceChildren(document.createTextNode(message));if(retry||reload){const button=document.createElement('button');button.type='button';button.textContent=retry?coreText('retry'):coreText('reload');button.dataset[retry?'displayRetry':'displayReload']='';button.onclick=()=>retry?void this.save(this.pending.patch,this.pending.dialog,this.pending.type):void this.onReload();target.append(button);}}
 async save(patch,dialog=null,type='display.save'){if(this.saving||!this.alive)return;this.saving=true;this.lock();this.status(t('mobileDisplay.saving'));try{const settings=await this.onSave(patch,type);if(!this.alive)return;this.settings=settings;this.pending=null;this.saving=false;if(this.dialog===dialog)this.closeDialog();if(listScreens.has(this.navigation.screen)){this.back();return;}this.render();}catch(error){if(!this.alive)return;this.saving=false;this.pending=error.pending?{patch,dialog,type}:null;this.render();this.status(error.message,{retry:!!this.pending,reload:error.status===409});this.lock();}}
 closeDialog(){if(!this.dialog)return;const dialog=this.dialog;dialog.close();dialog.remove();this.dialog=null;if(this.returnFocus?.isConnected)this.returnFocus.focus({preventScroll:true});this.returnFocus=null;if(this.pending)this.status(coreText('display.unconfirmed'),{retry:true});}
 back(){if(this.dialog){this.closeDialog();return true;}if(this.navigation.screen!=='home'){this.navigation.screen=['quickAdd','groupSubtotals'].includes(this.navigation.screen)?'diary':'home';this.render();window.scrollTo(0,0);return true;}return false;}
 dispose(){this.alive=false;this.events.abort();this.pending=null;this.closeDialog();}
}
