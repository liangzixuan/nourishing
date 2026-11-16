import {request} from './diary-api.js';
import {applyTheme} from './appearance.js';
import {moreBackHeader} from './more-source/menu-view.js';
import {MobileDisplay} from './display-source/mobile-display.js';
/** Owns the account projection and one immutable settings command until acknowledged. */
export function mountDisplay({root,headerRoot,onChange=async()=>{}}){
 let disposed=false,view,controller,pending=null;const navigation={screen:'home'};const abort=new AbortController();
 const alive=()=>!disposed&&root.isConnected;
 async function load(){controller?.dispose();controller=null;root.textContent='Loading…';try{view=await request('/api/display',undefined,abort.signal);if(!alive())return;pending=null;controller=new MobileDisplay({root,settings:view.settings,summaryNutrients:view.summaryNutrients,navigation,onTitle:title=>{if(headerRoot)headerRoot.innerHTML=moreBackHeader(title);},onSave:save,onReload:load});}catch(error){if(!alive())return;root.replaceChildren();const status=document.createElement('p');status.className='mds-status';status.setAttribute('role','status');status.textContent=error.message;const retry=document.createElement('button');retry.className='mds-row';retry.textContent='Try again';retry.onclick=load;root.append(status,retry);}}
 async function save(patch){
  pending??={body:{requestId:crypto.randomUUID(),revision:view.revision,type:'display.save',payload:structuredClone(patch)},result:null};
  try{pending.result??=await request('/api/workspace/command',pending.body);const next=await request('/api/display',undefined,abort.signal);if(!alive())return next.settings;view=next;applyTheme(view.settings.theme);await onChange();pending=null;return view.settings;}
  catch(error){if(error.status>=400&&error.status<500)pending=null;else error.pending=true;throw error;}
 }
 void load();return {back:()=>controller?.back()??false,dispose(){disposed=true;abort.abort();controller?.dispose();}};
}
