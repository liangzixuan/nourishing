import {request} from './diary-api.js';
import {resumeDeviceCache,hasCurrentDeviceCache,readDeviceCache} from './device-cache.js';
import {rememberOfflineAccount,lockCurrentOffline} from './offline-session.js';
import {accountDisplayKey,cacheAccountDisplay} from './account-display.js';

export async function openDiarySession({onAccount=()=>{}}={}){
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
