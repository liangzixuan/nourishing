import {readDeviceCache,writeDeviceCache,hasCurrentDeviceCache} from './device-cache.js';
import {escape as e} from './html.js';
import {lockCurrentOffline} from './offline-session.js';

export const privateImageAttributes=src=>src?.startsWith('/api/media?')?`data-private-src="${e(src)}"`:`src="${e(src)}"`;
let started=false;
export function startPrivateImages(){
 if(started)return;started=true;
 const images=new Map();
 async function load(img,path){
  const state={path,url:null};images.set(img,state);
  try{
   const cached=await readDeviceCache(path).catch(()=>({}));let blob=cached.value;
   if(!(blob instanceof Blob)){
    const response=await fetch(path,{credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(30000)});
    if(response.status===401&&cached.ticket&&await hasCurrentDeviceCache(cached.ticket)){await lockCurrentOffline(cached.ticket);location.replace('/login');return;}
    if(!response.ok)throw Error('Photo unavailable');blob=await response.blob();
    if(cached.ticket){if(!await hasCurrentDeviceCache(cached.ticket))return;await writeDeviceCache(path,blob,cached.ticket).catch(()=>false);}
   }
   if(cached.ticket&&!await hasCurrentDeviceCache(cached.ticket))return;
   if(!img.isConnected||images.get(img)!==state)return;
   state.url=URL.createObjectURL(blob);img.src=state.url;
  }catch{if(img.isConnected&&images.get(img)===state)img.dispatchEvent(new Event('error'));}
 }
 function update(){
  for(const [img,state]of images)if(!img.isConnected||img.dataset.privateSrc!==state.path){if(state.url)URL.revokeObjectURL(state.url);images.delete(img);}
  for(const img of document.querySelectorAll('img[data-private-src]'))if(!images.has(img))void load(img,img.dataset.privateSrc);
 }
 const observer=new MutationObserver(update);observer.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['data-private-src']});update();
 window.addEventListener('pagehide',()=>{for(const state of images.values())if(state.url)URL.revokeObjectURL(state.url);images.clear();});
 window.addEventListener('pageshow',update);
}
if(typeof document!=='undefined'&&document.body)startPrivateImages();
