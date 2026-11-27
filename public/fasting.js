import {dc} from './discover-cloud-messages.js';
import {uiLanguage,t} from './app-language.js';
import {offlineCopy,currentPrivateResponseTicket} from './offline-store.js';
import {offlineEffectiveState} from './offline-model.js';
import {fastingView} from './local-diary-projection.js';
import {request,queueCommand} from './diary-api.js';
import {readDeviceCache} from './device-cache.js';
import {onBackgroundWriteStatus} from './background-writes.js';
import {prepareFastingWrite} from './fasting-source/device.js';
import {fastingScreenMarkup,fastingHistoryMarkup,fastingHelpLink} from './fasting-source/discover-fasting.js';
import {escape as e,symbol,button as b} from './fasting-source/ui.js';
import {WheelColumn} from './fasting-source/mobile-datetime-picker.js';
import {openActiveFastTime} from './fasting-source/active-time.js';
import {openFastingEditor} from './fasting-source/editor.js';
import {MobileFastingDeleteDialog} from './fasting-source/mobile-fasting-delete-dialog.js';
import {fastingMutation} from './fasting-source/mutation.js';

// Diary and Dashboard keep their current screen underneath an action sheet.
export function openFastingAction({page,initialAction,activeId,onChange}) {
 const host=document.createElement('div');page.append(host);
 const dispose=()=>{surface.dispose();host.remove();};
 const surface=mountFasting({page:host,initialAction,activeId,onChange,onActionClose:dispose});
 return {dispose};
}
export function mountFasting({page,headerRoot,onBack,onChange=async()=>{},initialAction,initialSection,activeId,onActionClose}){
 let data,disposed=false,loading=false,sequence=0,controller,editor,deletion,deleteMutation,quick,quickWheel,quickMutation,settingMutation,loadedCount=25;
 const root=document.createElement('section');root.className='fasting-page dc-overlay';root.dataset.screen='fasting';if(onActionClose)root.hidden=true;page.replaceChildren(root);
 const selected=new Set(),expanded=new Set(initialSection?[initialSection]:[]),events=new AbortController();
 const alive=()=>!disposed&&root.isConnected;
 function status(message='',retry){let host=root.querySelector('[data-fasting-status]');if(!host){host=document.createElement('p');host.className='dc-error';host.dataset.fastingStatus='';host.setAttribute('role','status');root.append(host);}host.textContent=message;if(retry){const button=document.createElement('button');button.type='button';button.className='dc-button dc-link';button.textContent=dc('reloadLatest');button.onclick=()=>{button.disabled=true;void retry().catch(error=>status(error.message,retry));};host.append(button);}}
 async function readPage(query,signal){
  const copy=await offlineCopy();
  const local=()=>fastingView(offlineEffectiveState(copy),{now:new Date(),...copy.fastingContext},query,copy.snapshot.revision);
  if(copy?.fastingContext&&!copy.locked&&(navigator.onLine===false||query.offset&&copy.pending.some(row=>row.projection?.fastingChange)))return local();
  try{return await request('/api/fasting?'+new URLSearchParams(query),null,signal);}
  catch(error){if(signal.aborted||error.status||!copy?.fastingContext||copy.locked||!await currentPrivateResponseTicket(copy.ticket))throw error;return local();}
 }
 async function reload({more=false,silent=false,retry=()=>reload()}={}){
  controller?.abort();controller=new AbortController();const signal=controller.signal,id=++sequence;loading=true;
  if(data&&!more&&!silent)root.querySelector('fieldset.dc-dialog-body')?.setAttribute('disabled','');
  if(!data)root.innerHTML=`<p class="empty" role="status">${t('mobileNutrientDetail.loading')}</p>`;else root.querySelector('[data-fh-list-more]')?.setAttribute('disabled','');
  try{
   if(more){const next=await readPage({offset:data.history.rows.length,limit:25,revision:data.history.revision},signal);if(!alive()||id!==sequence)return false;data={...next,history:{...next.history,rows:[...data.history.rows,...next.history.rows]}};loadedCount=data.history.rows.length;}
   else{const next=await readPage({limit:Math.min(100,loadedCount)},signal);while(next.history.rows.length<Math.min(loadedCount,next.history.total)){const extra=await readPage({offset:next.history.rows.length,limit:Math.min(100,loadedCount-next.history.rows.length),revision:next.history.revision},signal);next.history.rows.push(...extra.history.rows);}if(!alive()||id!==sequence)return false;data=next;for(const key of selected)if(!data.history.rows.some(row=>row.id===key))selected.delete(key);}
   loading=false;if(!onActionClose)render();if(initialAction){const action=initialAction;initialAction=null;if(action==='new'||action==='quick')openQuick();else if(action==='end')confirmEnd();else if(action==='edit-fast-start'||action==='edit-fast-goal'){const active=data.active;if(!active||!activeId||active.id!==activeId||action==='edit-fast-goal'&&active.goalHours===null){await changed();return true;}editor=openActiveFastTime({active,field:action==='edit-fast-start'?'start':'goal',context:()=>data,onClose:onActionClose,onSaved:changed});}else if(action==='edit-active-fast'){if(!data.active||activeId&&data.active.id!==activeId){onActionClose?.();return true;}const active=data.history.rows.find(row=>row.id===data.active.id)??data.active;openEditor('history',active);}else if(action==='start-now')startNow(data.schedules.filter(row=>row.enabled&&row.nextStart).sort((a,b)=>a.nextStart.localeCompare(b.nextStart))[0]);}return true;
  }catch(error){if(!alive()||id!==sequence||error.name==='AbortError')return false;loading=false;root.hidden=false;status(error.message,retry);return false;}finally{if(alive()&&id===sequence){loading=false;root.querySelector('[data-fh-list-more]')?.removeAttribute('disabled');}}
 }
 function renderHeader(){if(headerRoot){headerRoot.classList.add('fasting-heading');headerRoot.innerHTML=`<header class="dc-dialog-header"><button type="button" class="dc-button dc-icon" data-fasting-back aria-label="${t('discover.back')}">${symbol('arrow_back')}</button><h1>${t('capabilities.fasting.name')}</h1>${fastingHelpLink(uiLanguage())}</header>`;headerRoot.querySelector('[data-fasting-back]').onclick=()=>onBack?.();}}
 function render(){
  for(const detail of root.querySelectorAll('[data-fast-section]'))detail.open?expanded.add(detail.dataset.fastSection):expanded.delete(detail.dataset.fastSection);
  renderHeader();
  root.innerHTML='<fieldset class="dc-dialog-body">'+fastingScreenMarkup({preferences:{fastingEnabled:data.settings.enabled,timerDirection:data.settings.timerDirection},widgets:{fasting:data.settings.showDashboard},askToStopFast:data.settings.askToStopFast,history:data.history,schedules:data.schedules,language:uiLanguage(),timeZone:data.timeZone})+'</fieldset>';
  for(const detail of root.querySelectorAll('[data-fast-section]'))detail.open=expanded.has(detail.dataset.fastSection);
  renderHistory();const scheduled=root.querySelector('[data-fast-section=scheduled]>div');for(const item of data.schedules.filter(row=>row.enabled&&row.nextStart&&!data.active)){const row=scheduled.querySelector('[data-id="'+CSS.escape(item.id)+'"]')?.closest('.dc-scheduled-item');row?.insertAdjacentHTML('beforeend',b(t('discover.fasting.startNow'),'start-scheduled','dc-link',`data-id="${e(item.id)}"`));}
  if(!data.schedulerReady&&data.schedules.some(row=>row.enabled))scheduled.insertAdjacentHTML('beforeend',`<p class="dc-description">${dc('fastSetup')}</p>`);
 }
 function renderHistory(){const host=root.querySelector('[data-fast-section=history]>div');host.innerHTML=fastingHistoryMarkup(data.history,uiLanguage(),{selected,loading,timeZone:data.timeZone})+b(dc('pastFast'),'past-fast','dc-link fasting-past');const all=host.querySelector('[data-fh-list-all]');if(all&&!all.checked)all.indeterminate=data.history.rows.some(row=>selected.has(row.id));}
 async function changed(){if(onActionClose){onActionClose();await onChange();return;}if(!await reload({retry:changed}))return;try{await onChange();}catch(error){if(alive())status(error.message,changed);}}
 function openEditor(mode='schedule',record,initialField){editor?.dispose();editor=openFastingEditor({mode,record,initialField,context:()=>data,refresh:async()=>{if(!await reload())throw Error(dc('fastRefresh'));},onSaved:()=>{editor=null;return changed();},onClose:()=>{editor=null;onActionClose?.();}});}
 function closeDelete(){if(deleteMutation?.busy)return;deleteMutation?.dispose();deleteMutation=null;deletion?.close();deletion=null;}
 function deleteRecords(ids){if(!ids.length||ids.length>100){status(dc('fastSelection'));return;}deletion=new MobileFastingDeleteDialog({language:uiLanguage(),count:ids.length,onCancel:closeDelete,onConfirm:()=>deleteMutation.run('fasting.deleteMany',{ids})});deleteMutation=fastingMutation({revision:()=>data.revision,context:()=>data,host:deletion.element,onSaved:async()=>{deleteMutation?.dispose();deletion?.close();deletion=null;deleteMutation=null;selected.clear();await changed();},onReload:async()=>{deleteMutation?.dispose();deletion?.close();deletion=null;deleteMutation=null;await reload();}});}
 function closeQuick(){if(quickMutation?.busy)return;quickWheel?.dispose();quickWheel=null;quickMutation?.dispose();quickMutation=null;quick?.close();quick?.remove();quick=null;}
 function quickDialog(title,markup,cls='dc-confirm',headerAction=''){
  closeQuick();
  const dialog=document.createElement('dialog');
  quick=dialog;dialog.className='dc-overlay '+cls+' fasting-quick';dialog.setAttribute('aria-label',title);
  const closeButton=headerAction?'':`<button class="dc-button dc-icon" type="button" data-close-fast aria-label="${t('common.close')}">${symbol('close')}</button>`;
  dialog.innerHTML=`<header class="dc-dialog-header">${closeButton}<h2>${e(title)}</h2>${headerAction||'<span></span>'}</header><div class="dc-dialog-body">${markup}</div>`;
  const dismiss=()=>{if(quickMutation?.busy)return;closeQuick();onActionClose?.();};
  dialog.querySelector('[data-close-fast]')?.addEventListener('click',dismiss);
  dialog.addEventListener('cancel',event=>{event.preventDefault();dismiss();});
  dialog.addEventListener('click',event=>{
   if(event.target!==dialog)return;
   const r=dialog.getBoundingClientRect();
   if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)dismiss();
  });
  document.body.append(dialog);dialog.showModal();return dialog;
 }
 function bindQuick(type,payload){const dialog=quick;quickMutation=fastingMutation({revision:()=>data.revision,context:()=>data,host:dialog.querySelector('.dc-dialog-body'),onSaved:async()=>{closeQuick();await changed();},onReload:async()=>{quickMutation?.dispose();quickMutation=null;closeQuick();await reload();}});dialog.querySelector('[data-confirm-fast]').onclick=()=>quickMutation.run(type,typeof payload==='function'?payload():payload);}
 function openQuick(){
  if(data.active){confirmEnd();return;}
  const schedule=`<button type="button" class="dc-button dc-link" data-quick-schedule>${t('discover.fasting.schedule')} ${symbol('chevron_right')}</button>`;
  const duration=t('discover.fasting.durationHours');
  const dialog=quickDialog(t('discover.fasting.new'),`<div class="dc-fast-picker mdtp-wheels"><div data-duration-wheel></div><span>${t('measurementLog.hours')}</span></div><label class="dc-row"><span>${t('discover.fasting.open')}</span><input type="checkbox" class="dc-switch" role="switch" aria-label="${t('discover.fasting.open')}"></label><button class="dc-button dc-pill" type="button" data-confirm-fast>${t('discover.fasting.start')}</button>`,'dc-sheet dc-new-fast',schedule);
  const root=dialog.querySelector('[data-duration-wheel]'),open=dialog.querySelector('input');
  quickWheel=new WheelColumn({root,key:'duration',label:duration,items:Array.from({length:168},(_,i)=>({value:i+1,label:String(i+1)})),value:16});
  open.onchange=()=>{root.inert=open.checked;root.setAttribute('aria-disabled',String(open.checked));};
  dialog.querySelector('[data-quick-schedule]').onclick=()=>{if(!quickMutation.blocked){closeQuick();openEditor();}};
  bindQuick('fast.start',()=>({goalHours:open.checked?null:quickWheel.read()}));
 }
 function confirmAction(title,description,confirm,kind){
  const dialog=quickDialog(title,'','dc-fast-delete-dialog');dialog.className='dc-fast-delete-dialog fasting-quick';dialog.dataset.fastConfirm=kind;
  const dismiss=dialog.querySelector('[data-close-fast]').onclick;
  dialog.innerHTML=`<h2>${e(title)}</h2><p>${e(description)}</p><div class="dc-dialog-body"><button type="button" class="dc-button" data-close-fast>${t('fastingHistory.cancel')}</button><button type="button" class="dc-button" data-confirm-fast>${e(confirm)}</button></div>`;
  dialog.querySelector('[data-close-fast]').onclick=dismiss;
 }
 function confirmEnd(){if(!data.active){onActionClose?.();return;}confirmAction(dc('endFastQuestion'),dc('endFastConfirm'),dc('stopFast'),'stop');bindQuick('fast.end',{id:data.active.id});}
 function startNow(item){if(!item||data.active){onActionClose?.();return;}confirmAction(dc('startFastQuestion'),item.goalHours===null?dc('startOpenFast'):dc('startFastConfirm',{hours:item.goalHours}),dc('startAction'),'start');bindQuick('fasting.schedule.startNow',{id:item.id,revision:item.revision,start:item.nextStart});}
 root.addEventListener('click',event=>{if(!data||settingMutation?.blocked)return;const button=event.target.closest('button');if(!button)return;const action=button.dataset.discover;
  if(action==='schedule-fast')openEditor();else if(action==='past-fast')openEditor('past');else if(action==='edit-schedule')openEditor('schedule',data.schedules.find(row=>row.id===button.dataset.id),button.dataset.scheduleField);else if(action?.startsWith('history-'))openEditor('history',data.history.rows.find(row=>row.id===button.dataset.id),button.dataset.historyField);else if(action==='start-scheduled')startNow(data.schedules.find(row=>row.id===button.dataset.id));else if(action?.startsWith('timer-'))changeSetting({timerDirection:action.slice(6)});else if(button.hasAttribute('data-fh-list-more')){if(!loading)void reload({more:true});}else if(button.hasAttribute('data-fh-list-delete'))deleteRecords([button.dataset.fhListDelete]);else if(button.hasAttribute('data-fh-list-delete-selected'))deleteRecords([...selected]);},{signal:events.signal});
 root.addEventListener('change',event=>{if(!data||settingMutation?.blocked)return;const node=event.target;if(node.dataset.pref){const map={fastingEnabled:'enabled',fasting:'showDashboard',askToStopFast:'askToStopFast'};changeSetting({[map[node.dataset.pref]]:node.checked});return;}if(node.matches('[data-fh-list-all]')){if(node.checked&&data.history.rows.length>100){node.checked=false;status(dc('fastSelectionLimit'));return;}data.history.rows.forEach(row=>node.checked?selected.add(row.id):selected.delete(row.id));}else if(node.dataset.fhListSelect){if(node.checked&&selected.size===100){node.checked=false;status(dc('fastSelectionLimit'));return;}node.checked?selected.add(node.dataset.fhListSelect):selected.delete(node.dataset.fhListSelect);}else return;renderHistory();},{signal:events.signal});
 const ownerTicket=readDeviceCache('/api/diary').then(cached=>cached.ticket).catch(()=>null);
 let settingQueue=Promise.resolve();
 function changeSetting(payload){
  const previous=structuredClone(data.settings);
  void ownerTicket.then(ticket=>{
   if(!alive()||!data)return;
   if(ticket){
    Object.assign(data.settings,payload);
    render();
    settingQueue=settingQueue.then(async()=>{
     try{
      const body={revision:data.revision,type:'fasting.settings',payload:structuredClone(payload),requestId:crypto.randomUUID()};
      const fastingChange=prepareFastingWrite(data,body);
      await queueCommand(data.revision,'fasting.settings',body.payload,{ticket,requestId:body.requestId,projection:{fastingChange,fastingContext:{timeZone:data.timeZone,schedulerReady:data.schedulerReady}}});
      void onChange();
     }catch(error){
      if(alive()){data.settings=previous;render();status(error.message);}
     }
    });
    return;
   }
   settingMutation?.dispose();settingMutation=fastingMutation({revision:()=>data.revision,context:()=>data,host:root,onSaved:async()=>{settingMutation.dispose();settingMutation=null;await changed();},onReload:async()=>{settingMutation.dispose();settingMutation=null;await reload();}});void settingMutation.run('fasting.settings',payload);
  });
 }
 function back(event){if(!alive())return;event.preventDefault();event.stopImmediatePropagation();if(editor){editor.back();return;}if(deletion){closeDelete();return;}if(quick){if(!quickMutation?.busy){closeQuick();onActionClose?.();}return;}(onActionClose??onBack)?.();}
 const stopStatus=onBackgroundWriteStatus(event=>{if(!alive())return;if(event.saved&&event.result?.revision&&data)data.revision=event.result.revision;if(event.result?.fastingSchedule||event.discarded||(event.result?.fastingChange&&!event.result.fastingChange.settings))void reload({silent:true});});
 window.addEventListener('nourishing-back',back,{capture:true,signal:events.signal});renderHeader();void reload();
 return {reload,dispose(){disposed=true;stopStatus();sequence++;controller?.abort();events.abort();editor?.dispose();deleteMutation?.dispose();deletion?.close();quickWheel?.dispose();quickMutation?.dispose();quick?.close();quick?.remove();settingMutation?.dispose();headerRoot?.classList.remove('fasting-heading');}};
}
