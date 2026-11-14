export const MACRO_TARGET_VERSION=2;
export const macroGuidance=Object.freeze({
 dynamicUnknown:'Dynamic macro targets are unknown because the effective energy target is unknown or disabled.',
 ratios:'Dynamic targets use the effective energy target with 4 kcal/g for protein and selected carbohydrate, and 9 kcal/g for fat.',
 recordedLean:'Keto protein uses the selected recorded body composition for this date.',
 proteinRange:'Protein is unknown because its calculation exceeds the numeric range.',
 proteinMissing:'Protein is unknown because lean body mass is unknown.',
 carbExerciseMissing:'Carbohydrate is unknown because the athletic bonus is enabled and recorded exercise energy is unknown.',
 athleticBonus:'The athletic bonus uses recorded exercise calories only; aggregate daily active energy is not counted.',
 fatEnergyMissing:'Fat is unknown because the effective energy target is unknown or disabled.',
 fatMacroMissing:'Fat is unknown because a protein or carbohydrate target is unknown.',
 fatExceeded:'Fat is unknown because protein and carbohydrate allocations exceed the effective energy target.',
 ketoManual:'Keto targets use reviewed lean body mass and protein settings, the selected carbohydrate amount, and remaining energy for fat at 4/4/9 kcal per gram.',
 ketoRecorded:'Keto targets use selected recorded lean mass, reviewed protein settings, the selected carbohydrate amount, and remaining energy for fat at 4/4/9 kcal per gram.',
 ratioOverride:'Explicit weekday gram targets override {{macros}}; the resulting targets may not retain the selected ratio.',
 ketoOverride:'Explicit weekday gram targets override {{macros}} after calculation; fat is not recalculated and the energy allocation may change.'
});
const names=['protein','carbohydrate','fat'],override=code=>code==='ratioOverride'||code==='ketoOverride';
const validMacros=value=>Array.isArray(value)&&value.length>0&&value.length<=3&&value.every((name,index)=>names.includes(name)&&(index===0||names.indexOf(value[index-1])<names.indexOf(name)));
export function captureMacroGuidance(code,macros){
 if(!Object.hasOwn(macroGuidance,code))throw new TypeError('Unknown macro guidance identity.');
 if(override(code)?!validMacros(macros):macros!==undefined)throw new TypeError('Invalid macro override fields.');
 return override(code)?{code,text:macroGuidance[code].replace('{{macros}}',macros.join(', ')),macros:[...macros]}:{code,text:macroGuidance[code]};
}
export function isMacroGuidance(note){
 if(note===null||typeof note!=='object'||Array.isArray(note)||typeof note.code!=='string'||!note.code||typeof note.text!=='string'||!note.text)return false;
 return override(note.code)?Object.keys(note).length===3&&validMacros(note.macros):Object.keys(note).length===2;
}
