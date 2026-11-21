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
const icon=filled=>`<img src="/record-source/biometric-icons/cup-${filled?'water':'outline'}.svg" alt="">`;
export function newestWaterEntry(diary){return [...(diary.biometrics??[])].reverse().find(row=>isLoggedWater(row)&&loggedWaterMilliliters(row)!==null);}
export function waterWidgetMarkup(diary,{expanded=false}={}){
 if(diary.presentation?.settings.showWater===false)return '';
 const policy=waterPolicy(diary),logged=diary.summary.hydration.logged,filled=Math.max(0,Math.ceil(Number((logged/policy.containerMl).toFixed(5)))),goal=Math.ceil(policy.goalMl/policy.containerMl);
 // A compact window keeps tiny custom containers from producing millions of nodes.
 const count=Math.min(32,Math.max(goal,filled+1)),offset=Math.max(0,filled-count+2),last=newestWaterEntry(diary);
 const glasses=Array.from({length:count},(_,i)=>{const index=offset+i,full=index<filled,action=index===filled?'water':index===filled-1&&last?'water-remove':null;return action?`<button type="button" class="water-glass ${full?'is-full':''}" data-action="${action}" ${full?`data-id="${e(last.id)}"`:`data-amount="${policy.containerMl}"`} aria-label="${e(m(full?'remove':'addGlass'))}" ${diary.completed?'disabled':''}>${icon(full)}<span aria-hidden="true">${full?'−':'+'}</span></button>`:`<span class="water-glass ${full?'is-full':''}" aria-hidden="true">${icon(full)}</span>`;}).join('');
 const total=diary.summary.totals.water,target=diary.summary.hydration.target,percent=target>0&&typeof total==='number'?Math.round(total/target*100):0;
 return `<details class="md-water" ${expanded?'open':''}><summary><button type="button" data-action="water-menu" class="md-group-add" aria-label="${e(m('addGlass'))}">+</button><span class="water-heading"><strong>${e(m('water'))}</strong><small>${number(waterFromMilliliters(logged,policy.unit))} / ${number(waterFromMilliliters(policy.goalMl,policy.unit))} ${e(policy.unit)}</small></span><span class="md-group-chevron" aria-hidden="true">⌄</span></summary><div class="water-glasses">${glasses}</div>${offset||Math.max(goal,filled+1)>count?`<small class="water-glass-count">${e(m('glasses',{count:number(logged/policy.containerMl)}))}</small>`:''}${policy.showTotal?`<button type="button" data-action="water-target" class="water-total"><span>${e(m('total'))}</span><span>${typeof total==='number'?number(waterFromMilliliters(total,policy.unit),1):'0'}${target>0?' / '+number(waterFromMilliliters(target,policy.unit),1):''} ${e(policy.unit)}</span><strong>${percent}%</strong><progress max="100" value="${Math.min(100,percent)}"></progress></button>`:''}</details>`;
}
export function openWaterMenu(anchor,onChoose,{completed=false}={}){
 return new AnchoredMenu({anchor,origin:anchor,label:m('settings'),className:'water-menu',items:[{id:'water',label:m('addGlass'),icon:'/record-source/biometric-icons/cup-water.svg',disabled:completed},{id:'water-custom',label:m('custom'),icon:'/shell-source/navigation/plus.svg',disabled:completed},{id:'water-settings',label:m('settings'),icon:'/record-source/biometric-icons/cog-outline.svg'}],onChoose});
}
export function openWaterAmount({policy,onAdd,onAdded}){
 const dialog=document.createElement('dialog');dialog.className='mdtp-dialog water-amount';dialog.setAttribute('aria-label',m('custom'));
 dialog.innerHTML=`<form><header><h2>${e(m('custom'))}</h2><button type="button" data-water-close aria-label="${e(m('close'))}">×</button></header><label class="water-amount-row"><strong>${e(m('amount'))}</strong><input name="amount" type="number" min="0.01" step="any" required value="${Number(waterFromMilliliters(policy.containerMl,policy.unit).toFixed(8))}" aria-label="${e(m('amount'))}"><span>${e(policy.unit)}</span></label><p role="status"></p><button class="dc-button dc-pill" type="submit">${e(m('add'))}</button></form>`;
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
  return amounts.map(value=>({value,label:`${number(waterFromMilliliters(value,s.unit))} ${s.unit} / ${m('glasses',{count:number(value/s.containerMl)})}`}));
 }
 function settleGoal(){
  if(!wheel)return;const goalMl=wheel.read();
  if(goalMl!==current.waterSettings.goalMl)void persist({waterSettings:{...current.waterSettings,goalMl}});
  if(wheel.index<7||wheel.index>=wheel.items.length-7){const items=goalItems();if(items[0].value!==wheel.items[0].value)wheel.setItems(items,goalMl);}
 }
 function render(){
  wheel?.dispose();const s=current.waterSettings,amount=waterFromMilliliters(s.containerMl,s.unit);
  const toggle=(key,label,checked)=>`<label class="mds-row"><strong>${e(label)}</strong><input type="checkbox" role="switch" class="dc-switch" data-water-toggle="${key}" ${checked?'checked':''}></label>`;
  root.innerHTML=`<div class="water-settings"><section class="mds-group">${toggle('showWater',m('showWidget'),current.showWater!==false)}${toggle('showEntries',m('showEntries'),s.showEntries)}<button class="mds-row water-group" type="button" data-water-group><strong>${e(m('group'))}</strong><span>${e(s.group??m('current'))}</span><span aria-hidden="true">⌄</span></button>${toggle('showTotal',m('showTotal'),s.showTotal)}<div class="mds-row"><strong>${e(m('units'))}</strong><div class="water-units" role="group" aria-label="${e(m('units'))}">${units.map(unit=>`<button type="button" data-water-unit="${e(unit)}" aria-pressed="${s.unit===unit}">${e(unit==='mL'?'ml':unit)}</button>`).join('')}</div></div></section><h2>${e(m('goal'))}</h2><section class="mds-group water-goal"><div class="mdtp-wheels"><div data-water-wheel></div></div><h2>${e(m('container'))}</h2><label class="water-container">${icon(true)}<strong>${e(m('glass'))}</strong><input type="number" min="0.01" step="any" required data-water-container aria-label="${e(m('container'))}" value="${Number(amount.toFixed(8))}"><span>${e(s.unit)}</span></label></section><p role="status" aria-live="polite"></p></div>`;
  wheel=new WheelColumn({root:root.querySelector('[data-water-wheel]'),key:'water-goal',label:m('goal'),items:goalItems(),value:s.goalMl,onChange:()=>{},onSettled:settleGoal});
 }
 root.addEventListener('change',event=>{const key=event.target.dataset.waterToggle;if(key){void persist(key==='showWater'?{showWater:event.target.checked}:{waterSettings:{...current.waterSettings,[key]:event.target.checked}});return;}if(event.target.matches('[data-water-container]')){const input=event.target;if(!input.reportValidity())return;try{void persist({waterSettings:{...current.waterSettings,containerMl:waterToMilliliters(Number(input.value),current.waterSettings.unit)}},{renderAfter:true});}catch(error){root.querySelector('[role=status]').textContent=error.message;}}},{signal:events.signal});
 root.addEventListener('click',event=>{const button=event.target.closest('button');if(!button)return;if(button.dataset.waterUnit){settleGoal();void persist({waterSettings:{...current.waterSettings,unit:button.dataset.waterUnit}},{renderAfter:true});}else if(button.hasAttribute('data-water-group')){menu?.close();menu=new AnchoredMenu({anchor:button,origin:button,label:m('group'),className:'water-group-menu',items:[{id:'',label:m('current'),selected:current.waterSettings.group===null},...groups.map(group=>({id:group,label:group,selected:group===current.waterSettings.group}))],onChoose:group=>void persist({waterSettings:{...current.waterSettings,group:group||null}},{renderAfter:true})});}},{signal:events.signal});
 render();return {back(){if(menu&&!menu.closed){menu.close();return true;}return false;},dispose(){settleGoal();disposed=true;wheel?.dispose();menu?.close(false);events.abort();}};
}
