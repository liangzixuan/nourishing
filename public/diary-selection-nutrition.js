import {withDiaryWorkspace} from './diary-preparation.js';
import {captureDeviceOwner} from './device-cache.js';
import {diarySelectionNutrition} from './local-diary-projection.js';
import {remapWriteReferences} from './write-identities.js';
import {request} from './diary-api.js';

// Selection is a read, not a save prerequisite. Recompute from pending local
// edits and recover transient network failures without asking the user to act.
export function watchDiarySelection({selection,onChange}){
 const lifetime=new AbortController(),ticket=captureDeviceOwner(),retryDelays=[1000,2000,4000];
 let requestController,timer,serial=0,retries=0;
 async function refresh(){
  if(lifetime.signal.aborted)return;
  const current=++serial;clearTimeout(timer);requestController?.abort();const reading=new AbortController();requestController=reading;
  try{
   const result=await withDiaryWorkspace(({state,recordIds})=>{
    const resolved=remapWriteReferences(structuredClone(selection),recordIds);
    // A row deleted while this view was opening no longer contributes.
    const currentSelection=resolved.scope==='selected'?{...resolved,records:resolved.records.filter(ref=>state[ref.collection]?.some(row=>row.id===ref.id&&row.date===resolved.date))}:resolved;
    return diarySelectionNutrition(state,currentSelection);
   },()=>request('/api/diary/tools/review',{operation:'nutrition',selection},reading.signal),{signal:reading.signal,ticket});
   if(current!==serial||lifetime.signal.aborted)return;
   await onChange(result);retries=0;
  }catch(error){
   if(current!==serial||lifetime.signal.aborted||error.name==='AbortError')return;
   const transient=!error.status||[408,409,429].includes(error.status)||error.status>=500;
   if(transient&&navigator.onLine!==false&&retries<retryDelays.length)timer=setTimeout(refresh,retryDelays[retries++]);
  }
 }
 const changed=()=>{retries=0;void refresh();};
 for(const event of ['online','nourishing-local-changed','nourishing-data-changed'])window.addEventListener(event,changed,{signal:lifetime.signal});
 void refresh();
 return {dispose(){lifetime.abort();serial++;requestController?.abort();clearTimeout(timer);}};
}
