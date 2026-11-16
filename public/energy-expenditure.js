import {request} from './diary-api.js';
import {parseEnergyExpenditure} from './report-source/server/energy-policy.mjs';
import {validateExpenditureBreakdown} from './report-source/server/expenditure-breakdown.mjs';
const digest=/^[a-f0-9]{64}$/;
function capture(value,date){
 if(!value||value.date!==date||!digest.test(value.revision)||!['kcal','kJ'].includes(value.energyUnit)||!value.effective?.energy)throw Error('Unable to load expenditure. Try again.');
 const energy=value.effective.energy,policy=value.energyPolicy;
 const expenditure=policy===null?null:parseEnergyExpenditure({resting:policy.resting,baseline:policy.baseline,activity:policy.activity,thermicEffect:policy.thermicEffect});
 if(expenditure&&expenditure.activity.mode!=='manual')throw Error('Choose recorded exercise in energy settings.');
 validateExpenditureBreakdown(value.expenditureBreakdown,{eligibleDays:1,knownDays:energy.expenditure===null?0:1,mean:energy.expenditure});
 return {revision:value.revision,energyUnit:value.energyUnit,controls:{expenditure},energy,expenditureBreakdown:value.expenditureBreakdown};
}
/** Source expenditure presentation uses cloud-owned previews and workspace receipts. */
export class TargetControlScreen{
 async load(){
  this.readController?.abort();const controller=new AbortController();this.readController=controller;this.busy=true;this.error='';this.render();
  try{const value=capture(await request('/api/target-policies?'+new URLSearchParams({date:this.date}),undefined,controller.signal),this.date);if(this.disposed||controller.signal.aborted)return;this.saved=value;this.energyUnit=value.energyUnit;this.reset();}
  catch(error){if(!this.disposed&&!controller.signal.aborted)this.error=error.message;}
  finally{if(!this.disposed&&this.readController===controller){this.busy=false;this.render();}}
 }
 async perform(change,popup){
  if(this.busy||this.session.pending)return;this.calcController?.abort();const controller=new AbortController();this.calcController=controller;this.busy=true;this.error='';this.render();
  const body={date:this.date,type:'targetPolicy.expenditure',payload:{expenditure:change.expenditure}};
  // Closing an editor cancels its preview before any command is submitted.
  popup?.controller.signal.addEventListener('abort',()=>controller.abort(),{once:true});
  popup?.root.querySelectorAll('input,select,button[type=submit]').forEach(el=>el.disabled=true);
  try{
   const preview=await request('/api/target-policies/preview',body,controller.signal);if(this.disposed||controller.signal.aborted)return;
   capture(preview.view,this.date);if(preview.revision!==this.saved.revision)throw Object.assign(Error('Targets changed. Reload to continue.'),{status:409});
   this.session.pending={phase:'saving',body:{requestId:crypto.randomUUID(),revision:preview.revision,type:body.type,payload:structuredClone(body.payload)}};
   popup?.close();await this.commit();
  }catch(error){if(!this.disposed&&!controller.signal.aborted){this.error=error.message;if(popup&&!popup.closed)popup.error(error);}}
  finally{if(!this.disposed){this.busy=false;this.render();if(popup&&!popup.closed){popup.root.querySelectorAll('button[type=submit]').forEach(el=>el.disabled=false);popup.restoreInputs?.();}}}
 }
 async commit(retry=false){
  const pending=this.session.pending;if(!pending||retry&&pending.phase!=='unknown')return;pending.phase='saving';this.busy=true;this.error='';if(!this.disposed)this.render();
  let saved=false;
  try{const result=await request('/api/workspace/command',pending.body);if(result?.ok!==true||!digest.test(result.revision))throw Error('Save not confirmed. Retry to check.');this.session.pending=null;saved=true;}
  catch(error){if(error.status>=400&&error.status<500){this.session.pending=null;this.error=error.message;}else{pending.phase='unknown';this.error='Save not confirmed. Retry to check.';}}
  finally{this.busy=false;}
  if(saved){try{await this.onSaved?.();}catch{/* A refresh failure does not turn a confirmed save into an uncertain write. */}if(this.disposed)this.session.listener?.('saved');else await this.load();}else if(this.disposed)this.session.listener?.(this.session.pending?'unknown':'rejected');else this.render();
 }
}
