import Big from './../vendor/big.js/7.0.1/big.mjs';
import {MACRO_TARGET_VERSION,captureMacroGuidance} from './macro-guidance.mjs';

// Public web artifact captured 2026-11-01; general programs, not Mercola variants.
// Selection defaults are separate from each saved policy's explicit bonus choice.
export const KETO_PRESETS=Object.freeze({
  rigorous:Object.freeze({name:'Rigorous',proteinPerKg:1,carbohydrateGrams:20,athleticBonus:false}),
  moderate:Object.freeze({name:'Moderate',proteinPerKg:1.5,carbohydrateGrams:40,athleticBonus:true}),
  relaxed:Object.freeze({name:'Relaxed',proteinPerKg:2.5,carbohydrateGrams:50,athleticBonus:true}),
});

// Documented mobile Restore Defaults; does not change energy or measurement sources.
export const DEFAULT_MACRO_RATIOS=Object.freeze({version:1,mode:'ratios',basis:'percent',values:Object.freeze({protein:25,carbohydrate:45,fat:30})});

const names=['protein','carbohydrate','fat'];
export const MACRO_ENERGY_DENSITY=Object.freeze({protein:4,carbohydrate:4,fat:9});
const own=(value,key)=>Object.hasOwn(value??{},key);
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const fail=message=>{throw Object.assign(new Error(message),{status:400});};
const measured=value=>typeof value==='number'&&Number.isFinite(value)&&value>=0;
const Decimal=Big();Decimal.DP=340;
function fields(value,keys,label){if(!object(value)||Object.keys(value).length!==keys.length||keys.some(key=>!own(value,key)))fail(`Choose the required ${label} fields only.`);}
function target(value,label){if(value!==null&&!measured(value))fail(`${label} must be a nonnegative finite number or null.`);return value;}
const decimal=value=>new Decimal(value.toString());

/** Macro settings are reviewed choices, never inferred from profile or records. */
export function parseMacroPolicy(value){
  if(value===undefined||value===null)return null;
  if(value?.mode==='keto'){
    fields(value,['version','mode','program','leanBodyMassKg','proteinPerKg','carbohydrateGrams','athleticBonus','proteinAddition'],'keto policy');
    if(value.version!==1||!['rigorous','moderate','relaxed','custom'].includes(value.program))fail('Choose a version 1 Rigorous, Moderate, Relaxed or Custom keto policy.');
    if(value.leanBodyMassKg!==null&&(!measured(value.leanBodyMassKg)||value.leanBodyMassKg===0||value.leanBodyMassKg>1000000))fail('Lean body mass must be positive and no greater than 1,000,000 kg, or null when unknown.');
    for(const name of ['proteinPerKg','carbohydrateGrams'])if(!measured(value[name])||value[name]>1000000)fail('Keto factors and carbohydrate targets must be finite numbers from 0 to 1,000,000.');
    if(typeof value.athleticBonus!=='boolean'||![0,25].includes(value.proteinAddition))fail('Choose a boolean athletic bonus and a protein addition of 0 or 25 grams.');
    const preset=KETO_PRESETS[value.program];
    if(preset&&(value.proteinPerKg!==preset.proteinPerKg||value.carbohydrateGrams!==preset.carbohydrateGrams))fail(`${preset.name} uses ${preset.proteinPerKg} g protein per kg lean body mass and ${preset.carbohydrateGrams} g carbohydrate. Use Custom to edit these values.`);
    return {version:1,mode:'keto',program:value.program,leanBodyMassKg:value.leanBodyMassKg,proteinPerKg:value.proteinPerKg,carbohydrateGrams:value.carbohydrateGrams,athleticBonus:value.athleticBonus,proteinAddition:value.proteinAddition};
  }
  fields(value,['version','mode','basis','values'],'macro policy');
  if(value.version!==1||value.mode!=='ratios'||!['percent','kcal','grams'].includes(value.basis))fail('Choose a version 1 macro ratio policy with percent, kcal or grams basis.');
  fields(value.values,names,'macro ratio values');
  const values=Object.fromEntries(names.map(name=>{const amount=value.values[name];if(!measured(amount)||amount>1000000)fail('Macro ratios must be finite numbers from 0 to 1,000,000.');return [name,amount];}));
  const total=names.reduce((sum,name)=>sum.plus(values[name].toString()),new Decimal(0));
  if(total.eq(0))fail('At least one macro ratio must be positive.');
  if(value.basis==='percent'&&!total.eq(100))fail('Macro percentages must total exactly 100.');
  return {version:1,mode:'ratios',basis:value.basis,values};
}

/** The selected carbohydrate target has one identity; raw Total facts remain
 * separate when Net is selected. Explicit weekday grams always take precedence. */
export function calculateMacroTargets({policy:input,energyTarget,carbohydrateTargetId,fixedTargets,weekdayTargets={},exerciseKcal=null,recordedLeanMassKg=undefined}){
  const policy=parseMacroPolicy(input),reasons=[];
  target(energyTarget,'Energy target');
  target(exerciseKcal,'Recorded exercise energy');
  if(!['carbs','netCarbohydrate'].includes(carbohydrateTargetId))fail('Choose the Total or Net carbohydrate target identity.');
  fields(fixedTargets,names,'fixed macro targets');
  if(!object(weekdayTargets))fail('Supply a weekday target object.');
  const derived=Object.fromEntries(names.map(name=>[name,target(fixedTargets[name],`Fixed ${name} target`)]));
  if(policy?.mode==='ratios'){
    if(energyTarget===null){for(const name of names)derived[name]=null;reasons.push(captureMacroGuidance('dynamicUnknown'));}
    else{
      const gramBasis=policy.basis==='grams';
      const divisor=names.reduce((sum,name)=>sum.plus(decimal(policy.values[name]).times(gramBasis?MACRO_ENERGY_DENSITY[name]:1)),new Decimal(0));
      for(const name of names){
        const value=decimal(energyTarget).times(policy.values[name].toString()).div(divisor).div(gramBasis?1:MACRO_ENERGY_DENSITY[name]);
        const amount=Number(value.toString());derived[name]=Number.isFinite(amount)?amount:null;
      }
    }
    reasons.push(captureMacroGuidance('ratios'));
  }else if(policy?.mode==='keto'){
    const leanMass=recordedLeanMassKg===undefined?policy.leanBodyMassKg:target(recordedLeanMassKg,'Recorded lean mass');
    if(recordedLeanMassKg!==undefined)reasons.push(captureMacroGuidance('recordedLean'));
    const protein=leanMass===null?null:decimal(leanMass).times(policy.proteinPerKg.toString()).plus(policy.proteinAddition);
    const carbohydrate=policy.athleticBonus&&exerciseKcal===null?null:decimal(policy.carbohydrateGrams).plus(policy.athleticBonus?decimal(exerciseKcal).div(50):0);
    const finiteNumber=value=>{const amount=Number(value.toString());return Number.isFinite(amount)?amount:null;};
    derived.protein=protein===null?null:finiteNumber(protein);derived.carbohydrate=carbohydrate===null?null:finiteNumber(carbohydrate);derived.fat=null;
    if(protein!==null&&derived.protein===null)reasons.push(captureMacroGuidance('proteinRange'));
    if(protein===null)reasons.push(captureMacroGuidance('proteinMissing'));
    if(carbohydrate===null)reasons.push(captureMacroGuidance('carbExerciseMissing'));
    if(policy.athleticBonus)reasons.push(captureMacroGuidance('athleticBonus'));
    if(energyTarget===null)reasons.push(captureMacroGuidance('fatEnergyMissing'));
    else if(protein===null||carbohydrate===null)reasons.push(captureMacroGuidance('fatMacroMissing'));
    else{
      const remainder=decimal(energyTarget).minus(protein.times(4)).minus(carbohydrate.times(4));
      if(remainder.lt(0))reasons.push(captureMacroGuidance('fatExceeded'));
      else derived.fat=Number(remainder.div(9).toString());
    }
    reasons.push(recordedLeanMassKg===undefined?captureMacroGuidance('ketoManual'):captureMacroGuidance('ketoRecorded'));
  }
  const targets={...derived},sources=Object.fromEntries(names.map(name=>[name,policy?.mode==='keto'?'keto':policy?'ratio':'fixed']));
  const identities={protein:'protein',carbohydrate:carbohydrateTargetId,fat:'fat'},overridden=[];
  for(const name of names){const id=identities[name];if(own(weekdayTargets,id)){targets[name]=target(weekdayTargets[id],`Weekday ${name} target`);sources[name]='weekday';overridden.push(name);}}
  if(policy&&overridden.length)reasons.push(policy.mode==='keto'?captureMacroGuidance('ketoOverride',overridden):captureMacroGuidance('ratioOverride',overridden));
  return {version:MACRO_TARGET_VERSION,mode:policy?.mode??'fixed',basis:policy?.basis??null,values:policy?.mode==='ratios'?{...policy.values}:null,energyTarget,carbohydrateTargetId,derived,targets,sources,reasons};
}
