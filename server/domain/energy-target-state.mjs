import {parseEnergyTarget} from './energy-policy.mjs';
const fail=message=>{throw Object.assign(Error(message),{status:400});};
export function parseInactiveEnergyTarget(value){
 if(value===undefined||value===null)return null;
 const target=parseEnergyTarget(value);if(target.mode==='fixed')fail('An inactive energy target must be calculated or a weight goal.');return target;
}
/** This is a retained calculation choice, not an additional active target. */
export function reconcileInactiveEnergyTarget(previous,next,input){
 const explicit=Object.hasOwn(input,'inactiveEnergyTarget'),requested=explicit?parseInactiveEnergyTarget(input.inactiveEnergyTarget):null;
 if(Object.hasOwn(input,'energyPolicy')&&input.energyPolicy===null&&!explicit){delete next.inactiveEnergyTarget;return;}
 if(next.energyPolicy&&next.energyPolicy.target.mode!=='fixed'){
  if(requested)fail('An inactive energy target requires an active custom energy target.');
  delete next.inactiveEnergyTarget;return;
 }
 const target=explicit?requested:previous.energyPolicy&&previous.energyPolicy.target.mode!=='fixed'?parseInactiveEnergyTarget(previous.energyPolicy.target):parseInactiveEnergyTarget(previous.inactiveEnergyTarget);
 if(target)next.inactiveEnergyTarget=target;else delete next.inactiveEnergyTarget;
}

/** Own the active/retained plan choice; consumers never reinterpret target storage. */
export function resolveWeightGoalTarget(settings,{includeInactive=false}={}){
 const active=settings?.energyPolicy?.target;
 if(active?.mode==='weight-goal')return {goal:parseEnergyTarget(active).goal,applyToEnergy:true};
 const retained=includeInactive?parseInactiveEnergyTarget(settings?.inactiveEnergyTarget):null;
 return retained?.mode==='weight-goal'?{goal:retained.goal,applyToEnergy:false}:null;
}
