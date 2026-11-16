import {applyAppLanguage,t} from './app-language.js';
import {coreText} from './core-cloud-messages.js';
import {mountPauseLife} from './pause-life.js';
import {applyFontPreferences} from './font-presentation.js';
import {request} from './diary-api.js';
import {applyTheme} from './appearance.js';
import {moreBackHeader} from './more-source/menu-view.js';
import {MobileDisplay} from './display-source/mobile-display.js';
/** Owns the account projection and one immutable settings command until acknowledged. */
export function mountDisplay({root,headerRoot,onChange=async()=>{}}){
 let disposed=false,view,controller,child,pending=null;const navigation={screen:'home'};const abort=new AbortController();
 const alive=()=>!disposed&&root.isConnected;
 async function load(){child?.dispose();child=null;controller?.dispose();controller=null;root.textContent=coreText('loading');try{view=await request('/api/display',undefined,abort.signal);if(!alive())return;pending=null;applyAppLanguage(view.settings.appLanguage);applyFontPreferences(view.settings);controller=new MobileDisplay({root,settings:view.settings,summaryNutrients:view.summaryNutrients,quickAddActions:view.quickAddActions,navigation,onTitle:title=>{if(headerRoot)headerRoot.innerHTML=moreBackHeader(title);},onSave:save,onReload:load,onDestination:destination});}catch(error){if(!alive())return;root.replaceChildren();const status=document.createElement('p');status.className='mds-status';status.setAttribute('role','status');status.textContent=error.message;const retry=document.createElement('button');retry.className='mds-row';retry.textContent=coreText('retry');retry.onclick=load;root.append(status,retry);}}
 function destination(id){if(id!=='pauseLife')return;controller?.dispose();controller=null;if(headerRoot)headerRoot.innerHTML=moreBackHeader(t('mobileDisplay.pauseLife'));child=mountPauseLife({root,onChange});}
 async function save(patch,type='display.save'){
  pending??={body:{requestId:crypto.randomUUID(),revision:view.revision,type,payload:structuredClone(patch)},result:null};
  try{pending.result??=await request('/api/workspace/command',pending.body);const next=await request('/api/display',undefined,abort.signal);if(!alive())return next.settings;view=next;applyTheme(view.settings.theme);applyFontPreferences(view.settings);await onChange();applyAppLanguage(view.settings.appLanguage);pending=null;return view.settings;}
  catch(error){if(error.status>=400&&error.status<500)pending=null;else error.pending=true;throw error;}
 }
 void load();return {back(){if(child){if(child.back?.())return true;void load();return true;}return controller?.back()??false;},dispose(){disposed=true;abort.abort();child?.dispose();controller?.dispose();}};
}
