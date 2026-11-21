import {readDeviceCache,writeDeviceCache,hasCurrentDeviceCache} from './device-cache.js';

// Cache display reads only. Authentication, recovery exports and signed reviews
// remain network-only, as do every write and its exact-retry receipt.
const reads=new Set(['diary','diary/calendar','dashboard','charts','nutrition-report','snapshots','fasting','library','library/item','library/tools','library/favorites','library/food-copy','food-search','catalog/status','catalog/search','catalog/food','food-insights/options','food-insights/suggestions','food-insights/oracle','display','pause-life','profile-settings','nutrient-targets','targets','target-policies','records/options','records/item','records/exercise-catalog','records/exercise-estimate','repeats','coach/preferences','cycle','glucose-timeline','print-report/options','reminders']);
export function cacheableRead(path){const url=new URL(path,location.origin);return url.origin===location.origin&&reads.has(url.pathname.slice(5))&&url.pathname.startsWith('/api/');}
const pending=new Map(),FRESH_MS=30000;
const aborted=()=>new DOMException('Request cancelled.','AbortError');
function wait(promise,signal){
 if(!signal)return promise;if(signal.aborted)return Promise.reject(aborted());
 return new Promise((resolve,reject)=>{const cancel=()=>reject(aborted());signal.addEventListener('abort',cancel,{once:true});promise.then(resolve,reject).finally(()=>signal.removeEventListener('abort',cancel));});
}
export async function cachedRead(path,fetchValue,signal,{fresh=false,onRefresh,onCached}={}){
 const cached=await readDeviceCache(path).catch(()=>({}));if(signal?.aborted)throw aborted();
 if(!cached.ticket)return fetchValue(signal);
 const key=JSON.stringify([cached.ticket,path]);
 const refresh=()=>{
  if(!pending.has(key)){
   const work=(async()=>{const value=await fetchValue(AbortSignal.timeout(30000));
    if(!await hasCurrentDeviceCache(cached.ticket))throw aborted();
    await writeDeviceCache(path,value,cached.ticket).catch(()=>false);
    if(!await hasCurrentDeviceCache(cached.ticket))throw aborted();return value;
   })();pending.set(key,work);work.then(()=>pending.delete(key),()=>pending.delete(key));
  }
  return wait(pending.get(key),signal);
 };
 if(cached.value!==undefined&&!fresh){
  if(!await hasCurrentDeviceCache(cached.ticket))throw aborted();
  if(Date.now()-cached.savedAt>=FRESH_MS)void refresh().then(value=>{
   if(!signal?.aborted&&JSON.stringify(value)!==JSON.stringify(cached.value))onRefresh?.(value);
  }).catch(()=>{});
  onCached?.(cached);return cached.value;
 }
 return refresh();
}
