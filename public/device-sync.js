import {request} from './diary-api.js';
import {readDeviceCache} from './device-cache.js';
import {saveOfflineSnapshot,onOfflineChange} from './offline-store.js';

let started=false,timer,running=false,again=false;
let warmedDate;
export function warmDeviceViews(date){
 if(warmedDate===date)return;warmedDate=date;
 const from=new Date(date+'T12:00:00Z');from.setUTCDate(from.getUTCDate()-6);
 const paths=['/api/dashboard?'+new URLSearchParams({date}),'/api/charts?'+new URLSearchParams({to:date}),'/api/library','/api/snapshots','/api/nutrition-report?'+new URLSearchParams({from:from.toISOString().slice(0,10),to:date,dayFilter:'nonempty',includeToday:true,includeSupplements:true})];
 // Two background reads at a time keep initial navigation responsive without
 // opening every view or serializing the full set of server round trips.
 const warm=async()=>{while(paths.length){const path=paths.shift();await request(path).catch(()=>{});}};
 setTimeout(()=>{void warm();void warm();},500);
}
export function startDeviceSync(ownerId){
 if(started||!globalThis.indexedDB)return;started=true;
 const schedule=()=>{clearTimeout(timer);timer=setTimeout(()=>void save(),1500);};
 async function save(){
  if(running){again=true;return;}running=true;
  try{
   const cached=await readDeviceCache('/api/diary');if(cached.ticket?.ownerId!==ownerId)return;
   // The full workspace copy preserves the existing offline command queue.
   const ticket={ownerId,epoch:cached.ticket.epoch};
   const snapshot=await request('/api/offline');await saveOfflineSnapshot(snapshot,ticket);
  }catch{/* Online use still works if device storage is full or unavailable. */}
  finally{running=false;if(again){again=false;schedule();}}
 }
 onOfflineChange(async()=>{
  const cached=await readDeviceCache('/api/diary').catch(()=>({}));
  if(!cached.ticket){document.querySelector('#page')?.replaceChildren();document.querySelector('#sheet-content')?.replaceChildren();location.replace('/login');}
 });
 window.addEventListener('nourishing-data-changed',schedule);
 window.addEventListener('online',schedule);
 window.addEventListener('pagehide',()=>clearTimeout(timer));schedule();
}
