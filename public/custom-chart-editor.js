import {dc,customChartText as cm} from './discover-cloud-messages.js';
import {uiLanguage,t} from './app-language.js';
import {request,queueCommand} from './diary-api.js';
import {localWorkspaceState} from './local-engine.js';
import {readDeviceCache} from './device-cache.js';
import {escape as e} from './html.js';
import {MobileChartEditor} from './custom-chart-source/mobile-chart-editor.js';

/** Cloud command/lifecycle adapter; the source editor owns the unsaved draft. */
export function mountCustomChartEditor(chart,data,ui){
 const {show,content,close}=ui;
 const owner=readDeviceCache('/api/diary').then(value=>value.ticket);
 const {_awaitingPlot,...definition}=chart??{};
 const draft=chart?definition:{version:2,name:'',primary:{kind:'biometric',type:"weight",unit:'kg'},secondary:null,days:7,visible:true,cycleOverlay:false};
 show(`<section class="mobile-chart-editor"><header class="sheet-header"><button type="button" class="icon-button" data-mce-back aria-label="${t('discover.back')}">‹</button><h2 id="sheet-title">${e(cm(chart?'edit':'create'))}</h2></header><p class="mce-intro">${dc('twoAxes')}</p><p data-mce-error role="alert"></p><button type="button" data-mce-reload hidden>${dc('reloadLatestChart')}</button><form></form></section>`);
 const root=content.querySelector('.mobile-chart-editor'),form=root.querySelector('form'),dialog=content.closest('dialog'),abort=new AbortController();
 const editor=new MobileChartEditor({form,chart:draft,options:data.options,language:uiLanguage()});
 let disposed=false,busy=false,pending=null,conflict=false;
 const alive=()=>!disposed&&root.isConnected;
 const error=root.querySelector('[data-mce-error]');
 function controls(){editor.setSaving(busy||!!pending||conflict);root.querySelector('[data-mce-back]').disabled=busy;root.querySelectorAll('[data-mce-nav]').forEach(button=>button.disabled=busy);const save=form.querySelector('[data-mce-save]');save.disabled=busy||conflict;save.textContent=busy?t('recipeImport.saving'):pending?t('mobileSuggest.retry'):cm('save');root.querySelector('[data-mce-reload]').hidden=!conflict;root.querySelector('[data-mce-reload]').disabled=busy;}
 function dispose(){if(disposed)return;disposed=true;editor.dispose();abort.abort();observer.disconnect();}
 function back(){if(editor.back())return;if(busy)return;dispose();(ui.onBack??close)();}
 // Reuse the live navigation actions and labels; do not create a second route owner.
 const navigation=document.querySelector('.app-shell > .app-nav');
 if(navigation){const clone=navigation.cloneNode(true);clone.querySelectorAll('[id]').forEach(node=>node.removeAttribute('id'));const originals=[...navigation.querySelectorAll('button')];clone.querySelectorAll('button').forEach((button,index)=>{button.dataset.mceNav='';button.addEventListener('click',()=>{if(busy)return;dispose();close();originals[index]?.click();},{signal:abort.signal});});root.append(clone);}
 async function save(event){
  event.preventDefault();if(busy||conflict)return;
  if(!pending){if(!form.reportValidity())return;pending={requestId:crypto.randomUUID(),revision:data.revision,type:'chart.save',payload:{...draft,id:draft.id??crypto.randomUUID(),name:form.elements.name.value,primary:JSON.parse(form.elements.primary.value),secondary:form.elements.secondary.value?JSON.parse(form.elements.secondary.value):null}};}
  busy=true;error.textContent='';controls();
  try{
   const ticket=await owner;
   let result;
   if(ticket){
    const state=await localWorkspaceState(),id='custom:'+pending.payload.id;
    let card;
    if(state){
     const {projectLocalChart}=await import('./local-chart-projection.js');
     const view=await projectLocalChart(state,pending,data,id);
     card=view.cards.find(item=>item.id===id);
    }
    result=await queueCommand(pending.revision,pending.type,pending.payload,{ticket,requestId:pending.requestId,projection:{chartCard:card,chartDate:data.to}});
   }else result=await request('/api/workspace/command',pending);
   if(result.ok!==true)throw Error(dc('saveConfirm'));pending=null;if(!alive())return;dispose();close();await ui.onChange?.();await ui.afterSave?.();}
  catch(failure){if(!alive())return;error.textContent=failure.message;if(failure.status>=400&&failure.status<500){pending=null;conflict=failure.status===409;}}
  finally{busy=false;if(alive())controls();}
 }
 async function reload(){
  if(busy)return;busy=true;controls();
  try{const next=await request('/api/charts?'+new URLSearchParams({to:data.to}));if(!alive())return;const current=chart?next.saved.find(row=>row.id===chart.id):null;if(chart&&!current){dispose();close();await ui.afterSave?.();return;}dispose();mountCustomChartEditor(current,next,ui);}
  catch(failure){if(alive())error.textContent=failure.message;}
  finally{busy=false;if(alive())controls();}
 }
 root.querySelector('[data-mce-back]').addEventListener('click',back,{signal:abort.signal});
 root.querySelector('[data-mce-reload]').addEventListener('click',reload,{signal:abort.signal});
 form.addEventListener('submit',save,{signal:abort.signal});
 const handleBack=event=>{if(!alive())return;event.preventDefault();event.stopImmediatePropagation();back();};
 dialog?.addEventListener('cancel',handleBack,{capture:true,signal:abort.signal});window.addEventListener('nourishing-back',handleBack,{capture:true,signal:abort.signal});
 const observer=new MutationObserver(()=>{if(!root.isConnected)dispose();});observer.observe(content,{childList:true});
 const controller={element:root,dispose};ui.onEditor?.(controller);controls();return controller;
}
