import {dc} from './discover-cloud-messages.js';
import {TargetControlScreen as CloudTargetScreen} from './energy-expenditure.js';
import {parseWeightGoal} from './report-source/server/weight-goal.mjs';
import {validateWeightGoalCapture} from './weight-goal-source/weight-goal-capture.js';
/** Weight-goal source controller consumes the server's plan and exact measurement choice. */
export class TargetControlScreen extends CloudTargetScreen{
 capture(value){
  const invalid=()=>{throw Error(dc('weightGoalLoad'));};
  if(!value||value.date!==this.date||!/^[a-f0-9]{64}$/.test(value.revision)||!['kcal','kJ'].includes(value.energyUnit)||!value.weightGoal)invalid();
  const {plan,projection,reading,entry,energy}=value.weightGoal;
  if(plan!==null){const goal=parseWeightGoal(plan?.goal);if(!goal||typeof plan.applyToEnergy!=='boolean'||!projection||Object.keys(goal).some(k=>goal[k]!==projection[k]))invalid();}else if(projection!==null)invalid();
  validateWeightGoalCapture(projection,this.date,this.language);
  if(!reading||!['unselected','empty','invalid','known'].includes(reading.status)||!(reading.kilograms===null||Number.isFinite(reading.kilograms)&&reading.kilograms>0)||reading.status==='known'&&(!reading.reading||!reading.metric||reading.kilograms===null)||reading.status!=='known'&&(reading.kilograms!==null||reading.reading!==null))invalid();
  if(entry!==null&&(!entry||entry.unit!==reading.metric?.unit||!(entry.selection?.kind==='catalog'&&typeof entry.selection.id==='string'||entry.selection?.kind==='metric'&&entry.selection.type===reading.metric?.type&&entry.selection.unit===entry.unit)))invalid();
  if(!energy||!(energy.target===null||Number.isFinite(energy.target)))invalid();
  return {revision:value.revision,energyUnit:value.energyUnit,controls:{weightGoal:plan,energy:{configured:value.energyPolicy!==null,custom:value.energyPolicy===null||value.energyPolicy.target.mode==='fixed'}},weightGoal:projection,weightReading:reading,weightEntry:entry,energy};
 }
 action(change){return {type:'targetPolicy.weightGoal',payload:{goal:change.goal,applyToEnergy:change.applyToEnergy}};}
}
