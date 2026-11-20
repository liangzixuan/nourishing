import {lockCurrentOffline} from './offline-session.js';
import {requestErrorMessage} from './request-error.js';
import {coreText} from './core-cloud-messages.js';
import {cacheableRead,cachedRead} from './device-requests.js';
import {readDeviceCache,invalidateDeviceCache,invalidateDeviceCachePaths} from './device-cache.js';

let pending=null;
export const clearPending=()=>{pending=null;};

const DIARY_PREFIXES=['/api/diary','/api/dashboard','/api/charts','/api/nutrition-report','/api/food-insights/'];
const DISPLAY_PREFIXES=['/api/display','/api/pause-life','/api/diary','/api/dashboard','/api/charts'];
const TARGET_PREFIXES=['/api/profile-settings','/api/targets','/api/target-policies','/api/nutrient-targets','/api/diary','/api/dashboard','/api/nutrition-report','/api/food-insights/'];
const LIBRARY_PREFIXES=['/api/library','/api/food-search','/api/food-insights/','/api/diary','/api/dashboard'];
const FASTING_PREFIXES=['/api/fasting','/api/diary','/api/dashboard'];
const REMINDER_PREFIXES=['/api/reminders'];
const REPEAT_PREFIXES=['/api/repeats','/api/diary'];
const SNAPSHOT_PREFIXES=['/api/snapshots','/api/diary','/api/dashboard'];

function invalidationPrefixes(path,body){
 if(path.startsWith('/api/backup/')||path.startsWith('/api/imports/')||path.startsWith('/api/cycle/'))return null;
 if(path==='/api/photos/save'||path==='/api/barcode/save'||path==='/api/diary/tools/save'||path==='/api/diary/ingredients/save'||path==='/api/note-photos/save')return DIARY_PREFIXES;
 if(path.startsWith('/api/library/'))return LIBRARY_PREFIXES;
 if(path.startsWith('/api/reminders')||path.startsWith('/api/push/'))return REMINDER_PREFIXES;
 if(path.startsWith('/api/snapshots'))return SNAPSHOT_PREFIXES;
 if(path==='/api/workspace/command'&&typeof body?.type==='string'){
  const type=body.type;
  if(/^(?:entry|note|biometric|water|day|records|photo|barcode)\./.test(type))return DIARY_PREFIXES;
  if(/^(?:display|pause-life)\./.test(type))return DISPLAY_PREFIXES;
  if(/^(?:profile|target|targets|nutrient-target|energy|weight-goal|macro)\./.test(type))return TARGET_PREFIXES;
  if(/^(?:fast|fasting)\./.test(type))return FASTING_PREFIXES;
  if(/^(?:food|recipe|meal|favorite|library)\./.test(type))return LIBRARY_PREFIXES;
  if(/^repeat\./.test(type))return REPEAT_PREFIXES;
  if(/^snapshot\./.test(type))return SNAPSHOT_PREFIXES;
 }
 return null;
}

async function invalidateForWrite(ticket,path,body){
 if(!ticket)return;
 const prefixes=invalidationPrefixes(path,body);
 if(!prefixes)await invalidateDeviceCache(ticket).catch(()=>{});
 else await invalidateDeviceCachePaths(key=>prefixes.some(prefix=>key===prefix||key.startsWith(prefix+'?')||key.startsWith(prefix)),ticket).catch(()=>{});
}

async function network(path,body,signal){
 const captured=(await readDeviceCache('/api/diary').catch(()=>({}))).ticket;
 let response;try{response=await fetch(path,{method:body?'POST':'GET',credentials:'same-origin',cache:'no-store',signal,headers:body?{'Content-Type':'application/json'}:{},...(body?{body:JSON.stringify(body)}:{})});}catch(error){if(error.name==='AbortError')throw error;throw Error(coreText('request.unavailable'),{cause:error});}
 if(response.status===401){
  const current=(await readDeviceCache('/api/diary').catch(()=>({}))).ticket;
  if(captured&&(!current||captured.ownerId!==current.ownerId||captured.epoch!==current.epoch))throw new DOMException('Account changed.','AbortError');
  await lockCurrentOffline(captured);pending=null;document.querySelector('#page')?.replaceChildren();document.querySelector('#sheet-content')?.replaceChildren();location.replace('/login');throw Error(coreText('auth.required'));
 }
 const result=await response.json().catch(()=>{throw Error(coreText('request.unavailable'));});if(!response.ok)throw Object.assign(Error(requestErrorMessage(result,response.status)),{status:response.status,errorCode:result.errorCode});return result;
}
export async function request(path,body,signal,options){
 if(!body&&cacheableRead(path))return cachedRead(path,currentSignal=>network(path,body,currentSignal),signal,options);
 // Read-only POST operations never invalidate saved screens or store their
 // transient review tokens. A lost mutation reply still invalidates affected views.
 const changes=body&&!/\/(?:analyze|prepare|preview|edit-preview|ingredient-preview|template-preview|parse|answer|search|lookup|resolve|suggestions|oracle|review|export|inspect|test|verification)$/.test(path);
 const ticket=changes?(await readDeviceCache('/api/diary').catch(()=>({}))).ticket:null;
 if(ticket)await invalidateForWrite(ticket,path,body);
 try{return await network(path,body,signal);}finally{
  if(ticket){await invalidateForWrite(ticket,path,body);window.dispatchEvent(new Event('nourishing-data-changed'));}
 }
}
export async function command(revision,type,payload){
 const signature=JSON.stringify({revision,type,payload});if(pending?.signature!==signature)pending={signature,body:{revision,type,payload,requestId:crypto.randomUUID()}};
 const path=['cycle.import','cycle.remove'].includes(type)?'/api/cycle/'+type.split('.')[1]:type==='share.import'?'/api/library/share/import':['records.copy','records.clear-amounts','records.move-group','records.set-time','records.delete','selection.meal','diary.order','group.order'].includes(type)?'/api/diary/tools/save':type==='barcode.log'?'/api/barcode/save':type==='library.retirement'?'/api/library/command':type==='entry.ingredients.adjust'?'/api/diary/ingredients/save':'/api/workspace/command';
 const result=await request(path,pending.body);pending=null;return result;
}

export function photoSaver(revision){
 let pendingPhoto=null;
 return async input=>{
  const signature=JSON.stringify(input);
  if(pendingPhoto?.signature!==signature)pendingPhoto={signature,body:{...input,revision:revision(),requestId:crypto.randomUUID()}};
  const result=await request('/api/photos/save',pendingPhoto.body);pendingPhoto=null;return result;
 };
}
