import {onBackgroundWriteStatus} from './background-writes.js';
import {localWorkspaceState} from './local-engine.js';
import {renameDiaryGroup} from './local-group-rename.js';
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
/** Owns the Display projection; durable writes use the shared background queue. */
export function mountDisplay({root,headerRoot,onChange=async()=>{},date=()=>new Date().toLocaleDateString('en-CA')}){
 let disposed=false,view,controller,child;const navigation={screen:'home'};const abort=new AbortController();
 const alive=()=>!disposed&&root.isConnected;
 const stopStatus=onBackgroundWriteStatus(event=>{if(event.saved&&alive()&&view)view={...view,revision:event.result.revision??view.revision};});
 async function load(){child?.dispose();child=null;controller?.dispose();controller=null;root.textContent=coreText('loading');try{view=await request('/api/display',undefined,abort.signal);if(!alive())return;applyAppLanguage(view.settings.appLanguage);applyFontPreferences(view.settings);controller=new MobileDisplay({root,settings:view.settings,summaryNutrients:view.summaryNutrients,quickAddActions:view.quickAddActions,navigation,onTitle:title=>{if(headerRoot)headerRoot.innerHTML=moreBackHeader(title);},onSave:save,onReload:load,onDestination:destination});}catch(error){if(!alive())return;root.replaceChildren();const status=document.createElement('p');status.className='mds-status';status.setAttribute('role','status');status.textContent=error.message;const retry=document.createElement('button');retry.className='mds-row';retry.textContent=coreText('retry');retry.onclick=load;root.append(status,retry);}}
 function destination(id){if(!['pauseLife','dashboard'].includes(id))return;controller?.dispose();controller=null;if(id==='dashboard'){openDashboardSettings();return;}if(headerRoot)headerRoot.innerHTML=moreBackHeader(t('mobileDisplay.pauseLife'));child=mountPauseLife({root,onChange});}
 function openDashboardSettings(){
  let active=true,dashboard,screen='settings',saving=Promise.resolve();const path='/api/dashboard?'+new URLSearchParams({date:date()});
  child={dispose(){active=false;},back(){if(screen==='streak'){screen='settings';render();return true;}return false;}};
  const current=()=>active&&alive();
  function change(type,payload){const work=saving.then(async()=>{
   const next=structuredClone(dashboard);
   if(type==='dashboard.widgets')Object.assign(next.dashboard.widgets,payload.patch);
   if(type==='dashboard.preferences')Object.assign(next.preferences,payload.patch);
   if(type==='dashboard.streakReset'){next.streaks={...next.streaks,current:payload.count};next.capture.cards.streaks={...next.capture.cards.streaks,current:payload.count};}
   await queueCommand(dashboard.revision,type,payload,{projection:{responses:{[path]:next}}});dashboard=next;void onChange();
  });saving=work.catch(()=>{});return work;}
  function render(){if(!current())return;if(headerRoot)headerRoot.innerHTML=moreBackHeader(t(screen==='streak'?'discover.title.streak-settings':'discover.title.dashboard-settings'));root.innerHTML='<div class="dashboard-panel"></div>';const host=root.firstElementChild;
   if(screen==='settings')renderDashboardSettings({host,data:dashboard,onSave:change,onStreak:()=>{screen='streak';render();}});
   else{host.innerHTML=streakSettingsMarkup(dashboard.streaks,dashboard.dashboard.widgets.streaks,uiLanguage())+'<p role="alert"></p>';host.querySelector('[data-widget]').onchange=event=>void change('dashboard.widgets',{patch:{streaks:event.target.checked}}).catch(error=>host.querySelector('[role=alert]').textContent=error.message);host.querySelector('form').onsubmit=event=>event.preventDefault();host.querySelector('[data-discover=reset-streak]').onclick=async()=>{const form=host.querySelector('form');if(!form.reportValidity())return;try{await change('dashboard.streakReset',{count:Number(form.elements.count.value)});if(current())render();}catch(error){if(current())host.querySelector('[role=alert]').textContent=error.message;}};}
  }
  root.textContent=coreText('loading');void request(path,undefined,abort.signal).then(value=>{dashboard=value;render();}).catch(error=>{if(current())root.textContent=error.message;});
 }
 async function save(patch,type='display.save'){
  let settings={...view.settings,...structuredClone(patch)};
  if(type==='group.rename'){
   const state=structuredClone(await localWorkspaceState()??{entries:[],biometrics:[],notes:[],repeats:[],settings:view.settings});
   state.settings={...state.settings,...view.settings};renameDiaryGroup(state,patch);settings=state.settings;
  }
  const next={...view,settings};
  await queueCommand(view.revision,type,patch,{projection:{responses:{'/api/display':next}}});view=next;
  applyTheme(settings.theme);applyFontPreferences(settings);applyAppLanguage(settings.appLanguage);void onChange();return settings;
 }
 void load();return {back(){if(child){if(child.back?.())return true;void load();return true;}return controller?.back()??false;},dispose(){disposed=true;stopStatus();abort.abort();child?.dispose();controller?.dispose();}};
}
