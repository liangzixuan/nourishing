import {request} from './diary-api.js';
import {resumeDeviceCache,hasCurrentDeviceCache} from './device-cache.js';
import {rememberOfflineAccount,lockCurrentOffline} from './offline-session.js';

export async function openDiarySession(){
 const context=document.querySelector('meta[name="nourishing-session"]')?.content;
 const ticket=await resumeDeviceCache(context).catch(()=>null);
 const verify=()=>request('/api/account',undefined,AbortSignal.timeout(15000));
 if(ticket){
  // Saved display data can render now. Every server operation still authenticates.
  void verify().then(async account=>{
   if(await hasCurrentDeviceCache(ticket)&&(account.id!==ticket.ownerId||account.sessionContext!==context)){
    await lockCurrentOffline(ticket);document.querySelector('#page')?.replaceChildren();document.querySelector('#sheet-content')?.replaceChildren();location.replace('/login');
   }
  }).catch(()=>{}); // A 401 already locks and clears through the request owner.
  return {id:ticket.ownerId};
 }
 const account=await verify();await rememberOfflineAccount(account);return account;
}
