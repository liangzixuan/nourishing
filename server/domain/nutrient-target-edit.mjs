import {parseNutrientTargetModes} from './nutrient-target-modes.mjs';
import {date as calendarDate} from './calendar.mjs';
import {nutrientDisplayOptions,parseNutrientDisplayPolicy,resolveHiddenNutrients} from './nutrient-display.mjs';
import {resolveTargetSettings} from './nutrition.mjs';
import {initialWorkspaceTargets} from './nutrient-catalog.mjs';
import {defaultDiaryDisplayPolicy} from './diary-display.mjs';

const ids=new Set(nutrientDisplayOptions.map(row=>row.id));
const own=(value,key)=>Object.hasOwn(value??{},key);
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const fail=(message,status=400)=>{throw Object.assign(Error(message),{status});};
const amount=value=>value===null||typeof value==='number'&&Number.isFinite(value)&&value>=0;
export const isMacroEnergyTarget=id=>['calories','protein','carbs','fat','netCarbohydrate'].includes(id);

/** Restore base nutrient overrides. Reference populations, scheduled targets and
 * macro settings have separate owners and continue to resolve in the usual order. */
export function resetNutrientTargetSettings(settings){
 const owned=id=>ids.has(id)&&!isMacroEnergyTarget(id);
 const preserveOtherTargets=values=>Object.fromEntries(Object.entries(values).filter(([id])=>!owned(id)));
 settings.targets={...preserveOtherTargets(settings.targets??{}),...Object.fromEntries(Object.entries(initialWorkspaceTargets).filter(([id])=>owned(id)))};
 if(settings.nutrientTargetModes){
  const nutrients=preserveOtherTargets(settings.nutrientTargetModes.nutrients);
  if(Object.keys(nutrients).length)settings.nutrientTargetModes={version:1,nutrients};
  else delete settings.nutrientTargetModes;
 }
 if(settings.nutrientDisplay){
  const maximums=preserveOtherTargets(settings.nutrientDisplay.maximums);
  if(Object.keys(maximums).length)settings.nutrientDisplay={version:1,maximums,hidden:resolveHiddenNutrients(null)};
  else delete settings.nutrientDisplay;
 }
 if(settings.diaryDisplay)settings.diaryDisplay={...settings.diaryDisplay,highlighted:[...defaultDiaryDisplayPolicy.highlighted]};
}

/** The calculation owner decides whether an edit belongs to another target editor. */
export function nutrientTargetEditors(state,date){
 calendarDate(date);const target=resolveTargetSettings(state,date),modes=parseNutrientTargetModes(state.settings?.nutrientTargetModes).nutrients;
 return new Map([...ids].map(id=>{
  const activeMacro=['protein','fat',target.carbohydrateTargetId].includes(id);let editor=null;
  if(own(target.overrideSources,id))editor=target.overrideSources[id]==='template'?'scheduler':'weekday';
  else if(activeMacro&&['weekly','daily-template','daily-custom'].includes(target.targetAssignment.source))editor='scheduler';
  else if(activeMacro&&target.macroPolicy)editor='macros';
  else if(id==='calories'&&(target.energyPolicy?.target.mode==='calculated'||target.energyPolicy?.target.includeAboveBaseline))editor='expenditure';
  else if(modes[id]?.daily==='reference'||modes[id]?.daily!=='custom'&&state.settings?.nutrientReferences?.nutrients.includes(id))editor='references';
  return [id,editor];
 }));
}

/** Return a narrow settings patch; omitted fields never come from a stale client snapshot.
 * Amounts use the catalog's canonical units. Conversion belongs to the UI boundary.
 */
export function nutrientTargetSettingsPatch(state,input){
 if(!object(input)||Object.keys(input).length!==3||!['date','id','changes'].every(key=>own(input,key)))fail('Choose date, nutrient ID and changes only.');
 const {date,id,changes}=input;calendarDate(date);
 if(!ids.has(id)||!object(changes)||!Object.keys(changes).length||Object.keys(changes).some(key=>!['dailyTarget','maximum','visible'].includes(key)))fail('Choose a known nutrient and daily target, maximum or visibility changes.');
 for(const field of ['dailyTarget','maximum'])if(own(changes,field)&&!amount(changes[field]))fail('Targets and maximums must be finite nonnegative numbers or null.');
 if(own(changes,'visible')&&typeof changes.visible!=='boolean')fail('Visibility must be true or false.');
 const settings=state.settings??{},patch={},modes=parseNutrientTargetModes(settings.nutrientTargetModes);
 if(own(changes,'maximum')&&modes.nutrients[id]?.maximum==='reference')fail('Turn on Custom before changing this maximum.',409);
 if((own(changes,'dailyTarget')||own(changes,'maximum'))&&modes.nutrients[id])patch.nutrientTargetModes=modes;
 if(own(changes,'dailyTarget')){
  const editor=nutrientTargetEditors(state,date).get(id);
  if(editor)fail('This daily target is controlled by '+editor+'. Open that target editor first.',409);
  patch.targets={...settings.targets,[id]:changes.dailyTarget};
 }
 if(own(changes,'maximum')||own(changes,'visible')){
  const current=parseNutrientDisplayPolicy(settings.nutrientDisplay),hidden=resolveHiddenNutrients(current),maximums={...current?.maximums};
  if(own(changes,'maximum'))maximums[id]=changes.maximum;
  const selected=own(changes,'visible')?(changes.visible?hidden.filter(value=>value!==id):hidden.includes(id)?hidden:[...hidden,id]):hidden;
  patch.nutrientDisplay={version:1,hidden:selected,maximums};
 }
 return patch;
}

export function nutrientTargetCustomPatch(state,input){
 if(!object(input)||Object.keys(input).length!==3||!['date','id','custom'].every(key=>own(input,key))||!ids.has(input.id)||typeof input.custom!=='boolean')fail('Choose date, nutrient ID and a boolean Custom choice.');
 const {date,id,custom}=input;calendarDate(date);
 if(isMacroEnergyTarget(id))fail('Use Macro & Energy Targets for this nutrient.',409);
 const editor=nutrientTargetEditors(state,date).get(id);if(editor&&editor!=='references')fail('This nutrient is controlled by '+editor+'.',409);
 const modes=parseNutrientTargetModes(state.settings?.nutrientTargetModes),choice=custom?'custom':'reference';modes.nutrients[id]={daily:choice,maximum:choice};return {nutrientTargetModes:modes};
}
