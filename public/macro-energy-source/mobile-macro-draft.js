import {KETO_PRESETS,MACRO_ENERGY_DENSITY,DEFAULT_MACRO_RATIOS} from '../report-source/server/macro-policy.mjs';
import {convertEnergy} from '../report-source/server/energy-units.mjs';
import {parseTemplateSettings} from '../report-source/server/macro-templates.mjs';
export const macroKeys=['protein','carbohydrate','fat'];
export function templateDraft(template,defaults){
 const settings=structuredClone(template?.settings??defaults),m=settings.macro;
 return {id:template?.id??crypto.randomUUID(),name:template?.name??'',editing:!!template,mode:m.mode,fixed:m.mode==='fixed'?{...m.targets}:{protein:null,carbohydrate:null,fat:null},ratios:m.mode==='ratios'?{basis:m.basis,values:{...m.values}}:{basis:DEFAULT_MACRO_RATIOS.basis,values:{...DEFAULT_MACRO_RATIOS.values}},keto:m.mode==='keto'?{...m}:{version:1,mode:'keto',program:'moderate',leanBodyMassKg:null,...KETO_PRESETS.moderate,proteinAddition:0},energy:settings.energy,fixedUnit:'grams'};
}
export function draftSettings(draft){
 const macro=draft.mode==='fixed'?{mode:'fixed',targets:{...draft.fixed}}:draft.mode==='ratios'?{version:1,mode:'ratios',basis:draft.ratios.basis,values:{...draft.ratios.values}}:{version:1,mode:'keto',program:draft.keto.program,leanBodyMassKg:draft.keto.leanBodyMassKg,proteinPerKg:draft.keto.proteinPerKg,carbohydrateGrams:draft.keto.carbohydrateGrams,athleticBonus:draft.keto.athleticBonus,proteinAddition:draft.keto.proteinAddition};
 return parseTemplateSettings({macro,energy:structuredClone(draft.energy)});
}
export function shownMacroInput(draft,key,energyUnit){
 if(draft.mode==='fixed')return draft.fixedUnit==='grams'?draft.fixed[key]:convertEnergy(draft.fixed[key]===null?null:draft.fixed[key]*MACRO_ENERGY_DENSITY[key],'kcal',energyUnit);
 if(draft.mode==='ratios')return draft.ratios.basis==='kcal'?convertEnergy(draft.ratios.values[key],'kcal',energyUnit):draft.ratios.values[key];
 return null;
}
export function storeMacroInput(draft,key,value,energyUnit){
 if(draft.mode==='fixed')draft.fixed[key]=value===null?null:draft.fixedUnit==='grams'?value:convertEnergy(value,energyUnit,'kcal')/MACRO_ENERGY_DENSITY[key];
 else draft.ratios.values[key]=draft.ratios.basis==='kcal'&&value!==null?convertEnergy(value,energyUnit,'kcal'):value;
}

/** Both mobile editors own the same draft program transition. */
export function setKetoProgram(draft,program){
 if(!['rigorous','moderate','relaxed','custom'].includes(program))throw Error('Choose a Keto program.');
 draft.keto.program=program;if(Object.hasOwn(KETO_PRESETS,program))Object.assign(draft.keto,KETO_PRESETS[program]);
}
