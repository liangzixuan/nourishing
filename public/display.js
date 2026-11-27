import {onBackgroundWriteStatus} from './background-writes.js';
import {localWorkspaceState,localDisplayView,localDashboardView,localDashboardPatch} from './local-engine.js';
import {readDeviceCache} from './device-cache.js';
import {editDiaryGroupSlot} from './local-group-rename.js';
import {renderDashboardSettings} from './dashboard-settings.js';
import {streakSettingsMarkup} from './dashboard-source/discover-settings-ui.js';
import {uiLanguage} from './app-language.js';
import {applyAppLanguage,t} from './app-language.js';
import {coreText} from './core-cloud-messages.js';
import {mountPauseLife} from './pause-life.js';
import {applyFontPreferences} from './font-presentation.js';
import {request,queueCommand} from './diary-api.js';
import {applyTheme} from './appearance.js';
import {moreBackHeader} from './more-source/menu-view.js';
import {MobileDisplay} from './display-source/mobile-display.js';
import {mountWaterSettings} from './water.js';
import {waterText} from './water-messages.js';
/** Owns the Display projection; durable writes use the shared background queue. */
export function mountDisplay({root,headerRoot,initialSetting,onChange=async()=>{},date=()=>new Date().toLocaleDateString('en-CA')}){
 let disposed=false,view,controller,child;const navigation={screen:'home'};const abort=new AbortController();
 const alive=()=>!disposed&&root.isConnected;
 const stopStatus=onBackgroundWriteStatus(event=>{if(event.saved&&alive()&&view)view={...view,revision:event.result.revision??view.revision};});
 async function load(){child?.dispose();child=null;controller?.dispose();controller=null;root.textContent=coreText('loading');
  const mount=value=>{
   view=value;applyAppLanguage(view.settings.appLanguage);applyFontPreferences(view.settings);
   controller=new MobileDisplay({root,settings:view.settings,summaryNutrients:view.summaryNutrients,quickAddActions:view.quickAddActions,navigation,onTitle:title=>{if(headerRoot)headerRoot.innerHTML=moreBackHeader(title);},onSave:save,onReload:load,onDestination:destination});
   if(initialSetting){
    const {screen,control,section}=initialSetting;initialSetting=null;
    if(screen==='dashboard'){destination(screen,{control,section});return;}
    if(screen)controller.open(screen);
    if(control==='groups'){
     const groups=root.querySelector('[data-display-groups]');
     if(groups){groups.open=true;groups.querySelector('summary').focus();}
    }else if(control){
     root.querySelector('[data-display-toggle="'+CSS.escape(control)+'"]')?.focus();
    }
   }
  };
  let hadLocal=false;
  try{
   const cached=await readDeviceCache('/api/display').catch(()=>({}));
   if(cached.ticket&&cached.value===undefined){
    const local=await localDisplayView();
    if(local&&alive()){mount(local);hadLocal=true;}
   }
   const next=await request('/api/display',undefined,abort.signal);
   if(!alive())return;
   if(hadLocal){if(view&&next?.revision)view={...view,revision:next.revision};return;}
   mount(next);
  }catch(error){if(!alive()||hadLocal)return;root.replaceChildren();const status=document.createElement('p');status.className='mds-status';status.setAttribute('role','status');status.textContent=error.message;const retry=document.createElement('button');retry.className='mds-row';retry.textContent=coreText('retry');retry.onclick=load;root.append(status,retry);}}
 function destination(id,option){if(!['pauseLife','dashboard','water'].includes(id))return;controller?.dispose();controller=null;if(id==='dashboard'){openDashboardSettings(option);return;}if(id==='water'){if(headerRoot)headerRoot.innerHTML=moreBackHeader(waterText('settings'));child=mountWaterSettings({root,settings:view.settings,groups:view.settings.groups,onSave:save});return;}if(headerRoot)headerRoot.innerHTML=moreBackHeader(t('mobileDisplay.pauseLife'));child=mountPauseLife({root,onChange});}
 function openDashboardSettings({control,section}={}){
  let active=true,dashboard,screen=section??'settings',saving=Promise.resolve();const path='/api/dashboard?'+new URLSearchParams({date:date()});
  child={dispose(){active=false;},back(){if(screen==='streak'){screen='settings';render();return true;}return false;}};
  const current=()=>active&&alive();
  function change(type,payload){const work=saving.then(async()=>{
   const needsProject=type==='dashboard.widgets'&&Object.values(payload.patch??{}).some(Boolean);
   const projected=needsProject?await localDashboardPatch(date(),type,payload,dashboard).catch(()=>null):null;
   const next=projected??structuredClone(dashboard);
   if(!projected){
    if(type==='dashboard.widgets')Object.assign(next.dashboard.widgets,payload.patch);
    if(type==='dashboard.preferences')Object.assign(next.preferences,payload.patch);
    if(type==='dashboard.streakReset'){next.streaks={...next.streaks,current:payload.count};next.capture.cards.streaks={...next.capture.cards.streaks,current:payload.count};}
   }
   await queueCommand(dashboard.revision,type,payload,{projection:{responses:{[path]:next}}});dashboard=next;void onChange();
  });saving=work.catch(()=>{});return work;}
  function render(){if(!current())return;if(headerRoot)headerRoot.innerHTML=moreBackHeader(t(screen==='streak'?'discover.title.streak-settings':'discover.title.dashboard-settings'));root.innerHTML='<div class="dashboard-panel"></div>';const host=root.firstElementChild;
   if(screen==='settings')renderDashboardSettings({host,data:dashboard,onSave:change,onStreak:()=>{screen='streak';render();}});
   else{host.innerHTML=streakSettingsMarkup(dashboard.streaks,dashboard.dashboard.widgets.streaks,uiLanguage())+'<p role="alert"></p>';host.querySelector('[data-widget]').onchange=event=>void change('dashboard.widgets',{patch:{streaks:event.target.checked}}).catch(error=>host.querySelector('[role=alert]').textContent=error.message);host.querySelector('form').onsubmit=event=>event.preventDefault();host.querySelector('[data-discover=reset-streak]').onclick=async()=>{const form=host.querySelector('form');if(!form.reportValidity())return;try{await change('dashboard.streakReset',{count:Number(form.elements.count.value)});if(current())render();}catch(error){if(current())host.querySelector('[role=alert]').textContent=error.message;}};}
  }
  root.textContent=coreText('loading');
  (async()=>{
   let hadLocal=false;
   const applyDashboard=value=>{
    if(!current())return;
    dashboard=value;render();
    if(control){const key=CSS.escape(control);root.querySelector('[data-widget="'+key+'"],[data-pref="'+key+'"]')?.focus();}
   };
   try{
    const cached=await readDeviceCache(path).catch(()=>({}));
    if(cached.ticket&&cached.value===undefined){
     const local=await localDashboardView(date());
     if(local&&current()){applyDashboard(local);hadLocal=true;}
    }
    const next=await request(path,undefined,abort.signal);
    if(!current())return;
    if(hadLocal){if(dashboard&&next?.revision)dashboard.revision=next.revision;return;}
    applyDashboard(next);
   }catch(error){if(current()&&!hadLocal)root.textContent=error.message;}
  })();
 }
 async function save(patch,type='display.save'){
  let settings={...view.settings,...structuredClone(patch)};
  if(type==='group.editSlot'){
   const state=structuredClone(await localWorkspaceState()??{entries:[],biometrics:[],notes:[],repeats:[],settings:view.settings});
   state.settings={...state.settings,...view.settings};editDiaryGroupSlot(state,patch);settings={...view.settings,groups:state.settings.groups,diaryGroups:state.settings.diaryGroups,diaryQuickAdd:state.settings.diaryQuickAdd,waterSettings:state.settings.waterSettings};
  }
  const next={...view,settings};
  await queueCommand(view.revision,type,patch,{projection:{responses:{'/api/display':next}}});view=next;
  applyTheme(settings.theme);applyFontPreferences(settings);applyAppLanguage(settings.appLanguage);void onChange();return settings;
 }
 void load();return {back(){if(child){if(child.back?.())return true;void load();return true;}return controller?.back()??false;},dispose(){disposed=true;stopStatus();abort.abort();child?.dispose();controller?.dispose();}};
}
