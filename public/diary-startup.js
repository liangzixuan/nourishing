import {applyAppLanguage,resolveBrowserLanguage} from './app-language.js';
import {request} from './diary-api.js';
import {resumeDeviceCache,resumeOfflineDeviceCache,bindDeviceCacheSession,hasCurrentDeviceCache,readDeviceCache} from './device-cache.js';
import {rememberOfflineAccount,lockCurrentOffline} from './offline-session.js';
import {accountDisplayKey,cacheAccountDisplay} from './account-display.js';

export async function openDiarySession({onAccount=()=>{}}={}){
 const offlineShell=document.querySelector('meta[name="nourishing-offline-shell"]');
 if(offlineShell){
  applyAppLanguage(resolveBrowserLanguage());
  const ticket=await resumeOfflineDeviceCache();
  if(!ticket)throw Error('Sign in online to open the diary on this device.');
  const cached=await readDeviceCache(accountDisplayKey);
  // The worker serves this shell after a failed navigation, even when Wi-Fi
  // reports onLine=true. Reconnect verifies the owner without replacing drafts.
  let running=false,stopped=false;
  const stop=()=>{stopped=true;window.removeEventListener('online',verify);document.removeEventListener('visibilitychange',visible);};
  const visible=()=>{if(!document.hidden)void verify();};
  async function verify(){
   if(running||stopped)return;running=true;
   try{
    const account=await request('/api/account',undefined,AbortSignal.timeout(15000));
    const current=(await readDeviceCache(accountDisplayKey)).ticket;
    if(stopped||!current||current.ownerId!==ticket.ownerId||current.epoch!==ticket.epoch){stop();return;}
    if(account.id!==ticket.ownerId){
     await lockCurrentOffline(current);stop();document.querySelector('#page')?.replaceChildren();document.querySelector('#sheet-content')?.replaceChildren();location.replace('/login');return;
    }
    const bound=await bindDeviceCacheSession(account.sessionContext,current);if(!bound||stopped)return;
    await cacheAccountDisplay(account,bound);
    const latest=(await readDeviceCache(accountDisplayKey)).ticket;
    if(!stopped&&latest?.ownerId===bound.ownerId&&latest.epoch===bound.epoch){onAccount(account);offlineShell.remove();stop();}
   }catch{/* Network failures leave the draft open; the request owner handles 401. */}
   finally{running=false;}
  }
  window.addEventListener('online',verify);document.addEventListener('visibilitychange',visible);window.addEventListener('pagehide',stop,{once:true});void verify();
  return cached.value?.id===ticket.ownerId?cached.value:{id:ticket.ownerId};
 }
 const signal=AbortSignal.timeout(15000);
 let context=document.querySelector('meta[name="nourishing-session"]')?.content;
 if(!context){
  // External PWA launches omit Strict cookies until the first same-origin fetch.
  try{context=(await request('/api/account/session-context',undefined,signal)).sessionContext;}catch{/* Fall through to the ordinary sign-in check. */}
 }
 const ticket=await resumeDeviceCache(context).catch(()=>null);
 const verify=()=>request('/api/account',undefined,signal);
 if(ticket){
  // Saved display data can render now. Every server operation still authenticates.
  const cached=await readDeviceCache(accountDisplayKey);
  void verify().then(async account=>{
   if(!await hasCurrentDeviceCache(ticket))return;
   if(account.id!==ticket.ownerId||account.sessionContext!==context){
    await lockCurrentOffline(ticket);document.querySelector('#page')?.replaceChildren();document.querySelector('#sheet-content')?.replaceChildren();location.replace('/login');
    return;
   }
   await cacheAccountDisplay(account,ticket);
   if(await hasCurrentDeviceCache(ticket))onAccount(account);
  }).catch(()=>{}); // A 401 already locks and clears through the request owner.
  return cached.value?.id===ticket.ownerId?cached.value:{id:ticket.ownerId};
 }
 const account=await verify();await rememberOfflineAccount(account);return account;
}
