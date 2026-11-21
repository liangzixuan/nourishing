import {localWorkspaceView} from './local-engine.js';
import {remapWriteReferences} from './write-identities.js';
import {request} from './diary-api.js';

// Selection is a read, not a save prerequisite. Recompute from pending local
// edits and recover transient network failures without asking the user to act.
export function watchDiarySelection({selection,onChange}){
 const lifetime=new AbortController();let requestController,timer,serial=0,delay=1000;
 async function refresh(){
  if(lifetime.signal.aborted)return;
  const current=++serial;clearTimeout(timer);requestController?.abort();const reading=new AbortController();requestController=reading;
  try{
   const local=await localWorkspaceView();if(current!==serial||lifetime.signal.aborted)return;let result;
   if(local){
    const {state,recordIds}=local;
    const {diarySelectionNutrition}=await import('./local-diary-projection.js');
    const resolved=remapWriteReferences(structuredClone(selection),recordIds);
    // A row deleted while this view was opening no longer contributes.
    const currentSelection=resolved.scope==='selected'?{...resolved,records:resolved.records.filter(ref=>state[ref.collection]?.some(row=>row.id===ref.id&&row.date===resolved.date))}:resolved;
    result=diarySelectionNutrition(state,currentSelection);
   }else result=await request('/api/diary/tools/review',{operation:'nutrition',selection},reading.signal);
   if(current!==serial||lifetime.signal.aborted)return;
   await onChange(result);delay=1000;
  }catch(error){
   if(current!==serial||lifetime.signal.aborted||error.name==='AbortError')return;
   if(navigator.onLine!==false){timer=setTimeout(refresh,delay);delay=Math.min(delay*2,30000);}
  }
 }
 for(const event of ['online','nourishing-local-changed','nourishing-data-changed'])window.addEventListener(event,refresh,{signal:lifetime.signal});
 void refresh();
 return {dispose(){lifetime.abort();serial++;requestController?.abort();clearTimeout(timer);}};
}
