import {request} from './diary-api.js';
import {readDeviceCache} from './device-cache.js';
import {saveOfflineSnapshot,onOfflineChange} from './offline-store.js';
import {warmLocalCatalogIndex} from './local-search.js';

let started=false,timer,running=false,again=false;
let warmedDate,warmTimer,warmGeneration=0;
function shiftDate(date,delta){
 const d=new Date(date+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+delta);return d.toISOString().slice(0,10);
}
export function warmAdjacentDays(date){
 if(!date)return;
 const paths=['/api/diary?date='+shiftDate(date,-1),'/api/diary?date='+shiftDate(date,1)];
 setTimeout(()=>{for(const path of paths)void request(path).catch(()=>{});},250);
}
export function warmDeviceViews(date,{delay=500,force=false}={}){
 if(!force&&warmedDate===date)return;warmedDate=date;
 const generation=++warmGeneration;
 clearTimeout(warmTimer);
 const from=new Date(date+'T12:00:00Z');from.setUTCDate(from.getUTCDate()-6);
 const paths=[
  '/api/diary?date='+shiftDate(date,-1),
  '/api/diary?date='+shiftDate(date,1),
  '/api/display',
  '/api/library',
  '/api/library/favorites',
  '/api/records/options?'+new URLSearchParams({date}),
  '/api/records/exercise-catalog',
  '/api/dashboard?'+new URLSearchParams({date}),
  '/api/profile-settings?'+new URLSearchParams({date}),
  '/api/targets?'+new URLSearchParams({date}),
  '/api/fasting?'+new URLSearchParams({date}),
  '/api/reminders',
  '/api/repeats?'+new URLSearchParams({date}),
  '/api/charts?'+new URLSearchParams({to:date}),
  '/api/snapshots',
  '/api/nutrition-report?'+new URLSearchParams({from:from.toISOString().slice(0,10),to:date,dayFilter:'nonempty',includeToday:true,includeSupplements:true}),
 ];
 // Two background reads at a time keep menus instant without starving foreground requests.
 const warm=async()=>{while(paths.length&&generation===warmGeneration){const path=paths.shift();await request(path).catch(()=>{});}};
 warmTimer=setTimeout(()=>{if(generation!==warmGeneration)return;void warmLocalCatalogIndex();void warm();void warm();},delay);
}
export function startDeviceSync(ownerId){
 if(started||!globalThis.indexedDB)return;started=true;
 const schedule=()=>{clearTimeout(timer);timer=setTimeout(()=>void save(),1500);};
 const rewarm=()=>{if(warmedDate)warmDeviceViews(warmedDate,{delay:1200,force:true});};
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
 window.addEventListener('nourishing-data-changed',()=>{schedule();rewarm();});
 window.addEventListener('online',schedule);
 window.addEventListener('pagehide',()=>{clearTimeout(timer);clearTimeout(warmTimer);});schedule();
}
