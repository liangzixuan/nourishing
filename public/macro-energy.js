import {dc} from './discover-cloud-messages.js';
import {TargetControlScreen as CloudTargetScreen} from './energy-expenditure.js';
import {parseTemplateSettings} from './report-source/server/macro-templates.mjs';
import {parseCarbohydratePolicy} from './report-source/server/carbohydrate-policy.mjs';
import {parseEnergyTarget} from './report-source/server/energy-policy.mjs';
import {validateMacroTargets} from './macro-energy-source/macro-capture.js';
export class TargetControlScreen extends CloudTargetScreen{
 capture(value){
  const fail=()=>{throw Error(dc('macroLoad'));};
  if(!value||value.date!==this.date||!/^[a-f0-9]{64}$/.test(value.revision)||!['kcal','kJ'].includes(value.energyUnit)||!value.defaults)fail();
  const {controls,energy,macroTargets}=value.defaults;
  parseTemplateSettings({macro:controls?.macro,energy:{mode:'inherit'}});parseCarbohydratePolicy(controls?.carbohydrate);validateMacroTargets(macroTargets,this.language);if(controls?.energy?.inactiveTarget!==null&&parseEnergyTarget(controls?.energy?.inactiveTarget).mode==='fixed')fail();
  if(!controls.energy||['custom','configured','includeAboveBaseline'].some(k=>typeof controls.energy[k]!=='boolean')||!(controls.energy.kcal===null||Number.isFinite(controls.energy.kcal)&&controls.energy.kcal>=0)||!energy||!(energy.target===null||Number.isFinite(energy.target)))fail();
  return {revision:value.revision,energyUnit:value.energyUnit,controls,energy,macroTargets};
 }
 action(change){switch(change.kind){
  case 'macro':return {type:'targetPolicy.macros',payload:{macro:change.macro}};
  case 'carbohydrate':return {type:'targetPolicy.carbohydrate',payload:{policy:change.policy}};
  case 'energy-custom':return {type:'targetPolicy.customEnergy',payload:{enabled:change.enabled,kcal:change.kcal}};
  case 'energy-above':return {type:'targetPolicy.aboveBaseline',payload:{enabled:change.enabled}};
  case 'restore-defaults':return {type:'targetPolicy.restoreDefaults',payload:{section:change.section}};
  default:throw Error(dc('targetChange'));
 }}
}
