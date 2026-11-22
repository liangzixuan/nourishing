import {ensureDeviceSnapshot} from './device-sync.js';
import {request} from './diary-api.js';
import {readDeviceCache} from './device-cache.js';
import {currentPrivateResponseTicket,readWriteCopy} from './offline-store.js';
import {offlineEffectiveState} from './offline-model.js';
import {saveNutrientTarget} from './nutrient-target-command.js';

export function reportNutrientSession(input,capture){
 const owner=readDeviceCache('/api/diary').then(value=>value.ticket);
 const aborted=()=>new DOMException('Account changed or screen closed.','AbortError');
 let revision;
 async function verify(ticket,signal){
  if(signal.aborted||ticket&&!await currentPrivateResponseTicket(ticket))throw aborted();
 }
 async function read(signal){
  const ticket=await owner;
  await verify(ticket,signal);
  const copy=ticket?await readWriteCopy():null;
  const available=copy?.snapshot?.state&&!copy.locked&&copy.ownerId===ticket?.ownerId&&copy.ticket.epoch===ticket.epoch;
  async function localDetail(){
   if(!available)return null;
   const {createReportNutrientDetail}=await import('./local-diary-projection.js');
   const calendar=capture.report.calendar,clock={now:new Date(calendar.asOf),timeZone:calendar.timeZone};
   const result=createReportNutrientDetail(offlineEffectiveState(copy),input,clock);
   await verify(ticket,signal);
   return {...result,revision:copy.snapshot.revision,energyUnit:capture.energyUnit};
  }
  function reproducesIntake(local){
   const previous=input.nutrient==='netCarbohydrate'?capture.report.carbohydrates.net.summary:capture.report.nutrients.find(row=>row.id===input.nutrient);
   return local&&previous.knownDays===local.detail.denominator&&previous.mean===local.detail.summary.mean;
  }
  let local;
  if(available&&(navigator.onLine===false||copy.pending.some(row=>row.command.type.startsWith('nutrientTarget.')))){
   local=await localDetail();
   if(reproducesIntake(local)){revision=local.revision;return local;}
  }
  let result;
  try{result=await request('/api/nutrition-report/nutrient',input,signal);}
  catch(error){
   // A network failure may precede the browser's offline event.
   if(error.cause instanceof TypeError&&local===undefined){
    local=await localDetail();
    if(reproducesIntake(local)){revision=local.revision;return local;}
   }
   throw error;
  }
  await verify(ticket,signal);
  revision=result.revision;
  // Preserve server intake if an older device copy cannot reproduce it. The
  // queued account policy still owns the dated switch until acknowledgement.
  if(local)result.detail.controls=local.detail.controls;
  return result;
 }
 async function save(custom){
  const ticket=await owner;
  if(ticket)await ensureDeviceSnapshot({ownerId:ticket.ownerId});
  return saveNutrientTarget(owner,revision,'nutrientTarget.setCustom',{date:input.options.to,id:input.nutrient,custom});
 }
 return {read,save};
}
