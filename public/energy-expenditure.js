import {dc} from './discover-cloud-messages.js';
import {request,queueCommand} from './diary-api.js';
import {readDeviceCache,writeDeviceCache} from './device-cache.js';
import {isBackgroundWritesRunning} from './background-writes.js';
import {localTargetPolicyView,localPreviewTargetPolicy,localAccountClock} from './local-engine.js';
import {parseEnergyExpenditure} from './report-source/server/energy-policy.mjs';
import {validateExpenditureBreakdown} from './report-source/server/expenditure-breakdown.mjs';
const digest=/^[a-f0-9]{64}$/;
function capture(value,date){
 if(!value||value.date!==date||!digest.test(value.revision)||!['kcal','kJ'].includes(value.energyUnit)||!value.effective?.energy)throw Error(dc('expenditureLoad'));
 const energy=value.effective.energy,policy=value.energyPolicy;
 const expenditure=policy===null?null:parseEnergyExpenditure({resting:policy.resting,baseline:policy.baseline,activity:policy.activity,thermicEffect:policy.thermicEffect});
 if(expenditure&&expenditure.activity.mode!=='manual')throw Error(dc('recordedExercise'));
 validateExpenditureBreakdown(value.expenditureBreakdown,{eligibleDays:1,knownDays:energy.expenditure===null?0:1,mean:energy.expenditure});
 return {revision:value.revision,energyUnit:value.energyUnit,controls:{expenditure},energy,expenditureBreakdown:value.expenditureBreakdown};
}
/** Source expenditure presentation uses cloud-owned previews and workspace receipts. */
export class TargetControlScreen{
 capture(value){return capture(value,this.date);}
 action(change){return {type:'targetPolicy.expenditure',payload:{expenditure:change.expenditure}};}
 async previewChange(change,signal){
  const action=this.action(change);
  if(isBackgroundWritesRunning()){
   const {ticket}=await readDeviceCache('/api/diary').catch(()=>({}));
   if(ticket){
    const local=await localPreviewTargetPolicy({date:this.date,...action});
    if(local){
     const view=this.capture(local.view);
     return {...view,baseRevision:this.saved.revision,action,_rawView:local.view,_ticket:ticket};
    }
   }
  }
  const value=await request('/api/target-policies/preview',{date:this.date,...action},signal);const view=this.capture(value.view);
  if(value.revision!==this.saved.revision)throw Object.assign(Error(dc('targetsChanged')),{status:409});return {...view,baseRevision:value.revision,action};
 }
 async commitReviewed(view){
  if(this.disposed||this.session.pending)return;if(view.baseRevision!==this.saved.revision)throw Object.assign(Error(dc('targetsChanged')),{status:409});
  if(view._ticket&&isBackgroundWritesRunning()){
   const path='/api/target-policies?'+new URLSearchParams({date:this.date});
   const {baseRevision,action,_rawView,_ticket,...captured}=view;
   const clock=await localAccountClock();
   this.saved=captured;this.energyUnit=captured.energyUnit;this.busy=false;this.error='';this.reset();this.render();
   await queueCommand(baseRevision,action.type,action.payload,{ticket:_ticket,projection:{today:clock.today,responses:_rawView?{[path]:_rawView}:{}}});
   if(_rawView)void writeDeviceCache(path,_rawView,_ticket).catch(()=>false);
   Promise.resolve().then(()=>this.onSaved?.()).catch(()=>{});
   if(this.disposed)this.session.listener?.('saved');
   return;
  }
  this.session.pending={phase:'saving',body:{requestId:crypto.randomUUID(),revision:view.baseRevision,...structuredClone(view.action)}};await this.commit();
 }
 async load(){
  this.readController?.abort();const controller=new AbortController();this.readController=controller;this.busy=true;this.error='';this.render();
  const path='/api/target-policies?'+new URLSearchParams({date:this.date});
  let hadLocal=false;
  try{
   if(!this.saved){
    const cached=await readDeviceCache(path).catch(()=>({}));
    if(cached.ticket&&cached.value===undefined){
     const local=await localTargetPolicyView(this.date);
     if(local&&!this.disposed&&!controller.signal.aborted){
      this.saved=this.capture(local);this.energyUnit=this.saved.energyUnit;this.busy=false;this.reset();this.render();hadLocal=true;
     }
    }
   }
   const raw=await request(path,undefined,controller.signal,{onRefresh:value=>this.refreshCapture?.(value)});
   if(this.disposed||controller.signal.aborted)return;
   if(hadLocal){
    if(this.refreshCapture)this.refreshCapture(raw);
    else if(!this.busy&&!this.session.pending&&!document.querySelector('dialog[open]')){this.saved=this.capture(raw);this.energyUnit=this.saved.energyUnit;this.render();}
   }else{
    const value=this.capture(raw);this.saved=value;this.energyUnit=value.energyUnit;this.reset();
   }
  }
  catch(error){if(!this.disposed&&!controller.signal.aborted&&!hadLocal)this.error=error.message;}
  finally{if(!this.disposed&&this.readController===controller){this.busy=false;this.render();}}
 }
 async perform(change,popup){
  if(this.busy||this.session.pending)return;this.calcController?.abort();const controller=new AbortController();this.calcController=controller;this.busy=true;this.error='';this.render();
  // Closing an editor cancels its preview before any command is submitted.
  popup?.controller.signal.addEventListener('abort',()=>controller.abort(),{once:true});
  popup?.root.querySelectorAll('input,select,button[type=submit]').forEach(el=>el.disabled=true);
  try{
   const preview=await this.previewChange(change,controller.signal);if(this.disposed||controller.signal.aborted)return;
   popup?.close();await this.commitReviewed(preview);
  }catch(error){if(!this.disposed&&!controller.signal.aborted){this.error=error.message;if(popup&&!popup.closed)popup.error(error);}}
  finally{if(!this.disposed){this.busy=false;this.render();if(popup&&!popup.closed){popup.root.querySelectorAll('button[type=submit]').forEach(el=>el.disabled=false);popup.restoreInputs?.();}}}
 }
 async commit(retry=false){
  const pending=this.session.pending;if(!pending||retry&&pending.phase!=='unknown')return;pending.phase='saving';this.busy=true;this.error='';if(!this.disposed)this.render();
  let saved=false;
  try{const result=await request('/api/workspace/command',pending.body);if(result?.ok!==true||!digest.test(result.revision))throw Error(dc('saveConfirm'));this.session.pending=null;saved=true;}
  catch(error){if(error.status>=400&&error.status<500){this.session.pending=null;this.error=error.message;}else{pending.phase='unknown';this.error=dc('saveConfirm');}}
  finally{this.busy=false;}
  if(saved){try{await this.onSaved?.();}catch{/* A refresh failure does not turn a confirmed save into an uncertain write. */}if(this.disposed)this.session.listener?.('saved');else await this.load();}else if(this.disposed)this.session.listener?.(this.session.pending?'unknown':'rejected');else this.render();
 }
}
