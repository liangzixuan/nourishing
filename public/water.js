import {resolveWaterSettings,parseWaterSettings,waterToMilliliters,waterFromMilliliters,isLoggedWater,loggedWaterMilliliters} from './local-diary-projection.js';
import {WheelColumn} from './fasting-source/mobile-datetime-picker.js';
import {AnchoredMenu} from './targets-source/anchored-menu.js';
import {pushBackHandler} from './back-history.js';
import {escape as e} from './html.js';
import {uiLanguage} from './app-language.js';
import {waterText as m} from './water-messages.js';

export const waterPolicy=diary=>resolveWaterSettings({...diary.presentation?.settings,groups:diary.groups});
export function waterRecordAmount(diary,row){const amount=loggedWaterMilliliters(row);if(amount===null)return null;const policy=waterPolicy(diary);return `${number(waterFromMilliliters(amount,policy.unit))} ${policy.unit}`;}
const number=(value,digits=2)=>value.toLocaleString(uiLanguage(),{maximumFractionDigits:digits});
const units=['mL','fl oz','cup'];
const inputVolume=value=>value.toLocaleString('en-US',{useGrouping:false,minimumFractionDigits:2,maximumFractionDigits:8});
export function newestWaterEntry(diary){return [...(diary.biometrics??[])].reverse().find(row=>isLoggedWater(row)&&loggedWaterMilliliters(row)!==null);}
const hintKey = ownerId => 'nourishing.waterHintDismissed.' + ownerId;
export function dismissWaterHint(button,ownerId){
 button.closest('.water-hint')?.remove();
 try{if(ownerId)localStorage.setItem(hintKey(ownerId),'1');}catch{/* The current view still dismisses the tip when storage is unavailable. */}
}
const waterFill=id=>`<svg width="0" height="0" aria-hidden="true" class="water-fill"><defs><linearGradient id="${id}" x2="0" y2="1"><stop stop-color="#1ec4cb"/><stop offset="1" stop-color="#007781"/></linearGradient></defs></svg>`;
function glassMarkup(full,mark,level="water-level"){
 return `<svg class="water-cup" viewBox="0 0 39 52" aria-hidden="true"><path class="water-cup-outline" d="M3 1h33q2 0 1.8 2L34 48q-.2 3-3 3H8q-2.8 0-3-3L1.2 3Q1 1 3 1Z"/>${full?`<path fill="url(#${level})" d="M2.6 6h33.8L33 45H6Z"/>`:''}<path class="water-cup-base" d="M6 46h27"/></svg>${mark?`<span aria-hidden="true">${mark}</span>`:''}`;
}
export function waterWidgetMarkup(diary,{expanded=false,ownerId}={}){
 if(diary.presentation?.settings.showWater===false)return '';
 const policy=waterPolicy(diary),logged=diary.summary.hydration.logged,filled=Math.max(0,Math.ceil(Number((logged/policy.containerMl).toFixed(5)))),goal=Math.ceil(policy.goalMl/policy.containerMl);
 // A compact window keeps tiny custom containers from producing millions of nodes.
 const count=Math.min(32,Math.max(goal,filled+1)),offset=Math.max(0,filled+1-count),last=newestWaterEntry(diary);
 const glasses=Array.from({length:count},(_,i)=>{
  const index=offset+i,full=index<filled,remove=full&&index===filled-1&&last;
  const content=glassMarkup(full,remove?'−':index===filled?'+':'');
  if(full&&!remove)return `<span class="water-glass" aria-hidden="true">${content}</span>`;
  return `<button type="button" class="water-glass" data-action="${remove?'water-remove':'water'}" ${remove?`data-id="${e(last.id)}"`:`data-amount="${policy.containerMl}"`} aria-label="${e(m(remove?'remove':'addGlass'))}" ${diary.completed?'disabled':''}>${content}</button>`;
 }).join('');
 const total=diary.summary.totals.water,target=diary.summary.hydration.target,hasData=typeof total==='number'&&diary.summary.nutrientCoverage.water.known>0,percent=target>0&&hasData?Math.round(total/target*100):0;
 const volume=value=>waterFromMilliliters(value,policy.unit).toLocaleString(uiLanguage(),{minimumFractionDigits:1,maximumFractionDigits:1});
 const amount=hasData?`${volume(total)}${target>0?' / '+volume(target):''} ${policy.unit}`:m('noData');
 let showHint=true;
 try{showHint=!ownerId||!localStorage.getItem(hintKey(ownerId));}catch{/* Storage is optional for this tip. */}
 const heading=`<summary>
  <button type="button" data-action="water-menu" class="md-group-add" aria-label="${e(m('addGlass'))}">+</button>
  <span class="water-heading"><strong>${e(m('water'))}</strong><small>${number(waterFromMilliliters(logged,policy.unit))} / ${number(waterFromMilliliters(policy.goalMl,policy.unit))} ${e(policy.unit)}</small></span>
  <span class="md-group-chevron" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="m9 6 6 6-6 6"/></svg></span>
 </summary>`;
 const more=offset||Math.max(goal,filled+1)>count?`<small class="water-glass-count">${e(m('glasses',{count:number(logged/policy.containerMl)}))}</small>`:'';
 const hint=showHint?`<div class="water-hint"><span>${e(m('hint'))}</span><button type="button" data-action="water-hint-close" aria-label="${e(m('close'))}">×</button></div>`:'';
 const targetBar=policy.showTotal?`<button type="button" data-action="water-target" class="water-total${hasData?'':' water-no-data'}">
  <span><b>${e(m('total'))}</b> - ${e(amount)}</span><span>${percent}%</span>
  <progress aria-label="${e(m('total'))}" max="100" value="${Math.min(100,percent)}"></progress>
 </button>`:'';
 return `<details class="md-water" ${expanded?'open':''}>${heading}${waterFill('water-level')}<div class="water-glasses">${glasses}</div>${more}${hint}${targetBar}</details>`;
}
export function openWaterMenu(anchor,onChoose,{completed=false}={}){
 return new AnchoredMenu({anchor,origin:anchor,modal:true,label:m('settings'),className:'water-menu',items:[{id:'water',label:m('addGlass'),icon:'/record-source/biometric-icons/cup-water.svg',disabled:completed},{id:'water-custom',label:m('custom'),icon:'/shell-source/navigation/plus.svg',disabled:completed},{id:'water-settings',label:m('settings'),icon:'/record-source/biometric-icons/cog-outline.svg'}],onChoose});
}
export function openWaterAmount({policy,onAdd,onAdded}){
 const dialog=document.createElement('dialog');dialog.className='mdtp-dialog water-amount';dialog.setAttribute('aria-label',m('custom'));
 dialog.innerHTML=`<form><header><h2>${e(m('custom'))}</h2><button type="button" data-water-close aria-label="${e(m('close'))}">×</button></header><label class="water-amount-row"><strong>${e(m('amount'))}</strong><input name="amount" type="number" min="0.01" step="any" required value="${inputVolume(waterFromMilliliters(policy.containerMl,policy.unit))}" aria-label="${e(m('amount'))}"><span>${e(policy.unit)}</span></label><p role="status"></p><button class="dc-button dc-pill" type="submit">${e(m('add'))}</button></form>`;
 let busy=false,closed=false,back;const form=dialog.querySelector('form'),origin=document.activeElement;
 const close=()=>{if(closed)return;closed=true;back?.release();dialog.close();dialog.remove();if(origin?.isConnected)origin.focus({preventScroll:true});};
 dialog.addEventListener('cancel',event=>{event.preventDefault();close();});dialog.addEventListener('click',event=>{if(event.target.closest('[data-water-close]'))close();if(event.target===dialog){const box=dialog.getBoundingClientRect();if(event.clientX<box.left||event.clientX>box.right||event.clientY<box.top||event.clientY>box.bottom)close();}});
 form.onsubmit=async event=>{event.preventDefault();if(busy)return;busy=true;form.querySelector('[type=submit]').disabled=true;try{const amount=waterToMilliliters(Number(form.elements.amount.value),policy.unit);parseWaterSettings({...policy,containerMl:amount},policy.group?[policy.group]:[]);await onAdd(amount);close();void onAdded?.();}catch(error){if(closed)return;form.querySelector('[role=status]').textContent=error.message||m('failed');busy=false;form.querySelector('[type=submit]').disabled=false;}};
 document.body.append(dialog);dialog.showModal();back=pushBackHandler(close);return {close};
}

/** The host owns navigation. Settings persist through its durable command queue. */
export function mountWaterSettings({root,settings,groups,onSave}){
 let current={...settings,waterSettings:resolveWaterSettings({...settings,groups})},wheel,disposed=false,chain=Promise.resolve(),menu;
 const events=new AbortController();
 function persist(patch,{renderAfter=false}={}){
  const previous=current,next={...current,...patch};if(patch.waterSettings)parseWaterSettings(patch.waterSettings,groups);current=next;
  const work=chain.then(()=>onSave(patch));chain=work.catch(()=>{});
  void work.then(()=>{if(!disposed&&renderAfter)render();}).catch(error=>{if(disposed)return;current=previous;render();root.querySelector('[role=status]').textContent=error.message||m('failed');});return work;
 }
 function goalItems(){
  const s=current.waterSettings,start=Math.max(1,Math.round(s.goalMl/s.containerMl)-30);
  const amounts=[...new Set([...Array.from({length:61},(_,i)=>Number((s.containerMl*(start+i)).toFixed(8))).filter(value=>value<=20000),s.goalMl])].sort((a,b)=>a-b);
  return amounts.map(value=>{
   const volume=waterFromMilliliters(value,s.unit).toLocaleString(uiLanguage(),{minimumFractionDigits:2,maximumFractionDigits:2});
   const count=number(value/s.containerMl),[prefix,suffix]=m('glasses',{count:'{count}'}).split('{count}');
   const parts=[{text:volume,strong:true},{text:' '+s.unit+' / '+prefix},{text:count,strong:true},{text:suffix}];
   return {value,label:parts.map(part=>part.text).join(''),parts};
  });
 }
 function settleGoal(){
  if(!wheel)return;const goalMl=wheel.read();
  if(goalMl!==current.waterSettings.goalMl)void persist({waterSettings:{...current.waterSettings,goalMl}});
  if(wheel.index<7||wheel.index>=wheel.items.length-7){const items=goalItems();if(items[0].value!==wheel.items[0].value)wheel.setItems(items,goalMl);}
 }
 function render(){
  wheel?.dispose();const s=current.waterSettings,amount=waterFromMilliliters(s.containerMl,s.unit);
  const toggle=(key,label,checked)=>`<label class="mds-row"><strong>${e(label)}</strong><input type="checkbox" role="switch" class="dc-switch" data-water-toggle="${key}" ${checked?'checked':''}></label>`;
  root.innerHTML=`<div class="water-settings"><section class="mds-group">${toggle('showWater',m('showWidget'),current.showWater!==false)}${toggle('showEntries',m('showEntries'),s.showEntries)}<button class="mds-row water-group" type="button" data-water-group><strong>${e(m('group'))}</strong><span>${e(s.group??m('current'))}</span><span class="water-group-chevron" aria-hidden="true"></span></button>${toggle('showTotal',m('showTotal'),s.showTotal)}<div class="mds-row"><strong>${e(m('units'))}</strong><div class="water-units" role="group" aria-label="${e(m('units'))}">${units.map(unit=>`<button type="button" data-water-unit="${e(unit)}" aria-pressed="${s.unit===unit}">${e(unit==='mL'?'ml':unit)}</button>`).join('')}</div></div></section><h2>${e(m('goal'))}</h2><section class="mds-group water-goal"><div class="mdtp-wheels"><div data-water-wheel></div></div><h2>${e(m('container'))}</h2><label class="water-container">${waterFill('water-container-level')}${glassMarkup(true,'','water-container-level')}<strong>${e(m('glass'))}</strong><input type="number" min="0.01" step="any" required data-water-container aria-label="${e(m('container'))}" value="${inputVolume(amount)}"><span>${e(s.unit)}</span></label></section><p class="water-help">${e(m('settingsHint'))}</p><p role="status" aria-live="polite"></p></div>`;
  wheel=new WheelColumn({root:root.querySelector('[data-water-wheel]'),key:'water-goal',label:m('goal'),items:goalItems(),value:s.goalMl,onChange:()=>{},onSettled:settleGoal});
 }
 root.addEventListener('change',event=>{const key=event.target.dataset.waterToggle;if(key){void persist(key==='showWater'?{showWater:event.target.checked}:{waterSettings:{...current.waterSettings,[key]:event.target.checked}});return;}if(event.target.matches('[data-water-container]')){const input=event.target;if(!input.reportValidity())return;try{void persist({waterSettings:{...current.waterSettings,containerMl:waterToMilliliters(Number(input.value),current.waterSettings.unit)}},{renderAfter:true});}catch(error){root.querySelector('[role=status]').textContent=error.message;}}},{signal:events.signal});
 root.addEventListener('click',event=>{const button=event.target.closest('button');if(!button)return;if(button.dataset.waterUnit){settleGoal();void persist({waterSettings:{...current.waterSettings,unit:button.dataset.waterUnit}},{renderAfter:true});}else if(button.hasAttribute('data-water-group')){menu?.close();menu=new AnchoredMenu({anchor:button,origin:button,label:m('group'),className:'water-group-menu',items:[{id:'',label:m('current'),selected:current.waterSettings.group===null},...groups.map(group=>({id:group,label:group,selected:group===current.waterSettings.group}))],onChoose:group=>void persist({waterSettings:{...current.waterSettings,group:group||null}},{renderAfter:true})});}},{signal:events.signal});
 render();return {back(){if(menu&&!menu.closed){menu.close();return true;}return false;},dispose(){settleGoal();disposed=true;wheel?.dispose();menu?.close(false);events.abort();}};
}
