import {parseBodyCompositionPolicy,projectBodyComposition,bodyMassIndex} from './body-composition.mjs';
import {parseEnergyPolicy,projectRestingAge} from './energy-policy.mjs';
import {calculateSummary} from './nutrition.mjs';
import {captureProfileGuidance as guidance,PRINT_PROFILE_VERSION} from './profile-guidance.mjs';

/** Current profile facts use the captured calendar, independently of diary filters. */
export function capturePrintProfile(state,calendar){
  const date=calendar.today,policy=parseBodyCompositionPolicy(state.settings?.bodyComposition),body=projectBodyComposition(state.biometrics??[],policy,date),energy=parseEnergyPolicy(state.settings?.energyPolicy),age=projectRestingAge(energy?.resting,date);
  const measurement=(key,unit)=>{const selected=body[key];return {value:selected.reading?.value??null,unit:selected.reading?.unit??unit,basis:selected.reading?guidance('measurement.recorded',{kind:key,date:selected.reading.date,time:selected.reading.time??null}):guidance('measurement.'+selected.status)};};
  const resting=energy?calculateSummary(state,date).energy.components.resting:null;
  let restingBasis=guidance('resting.unconfigured');
  if(energy?.resting.mode==='custom')restingBasis=guidance('resting.custom');
  else if(energy){
    const weight=policy?.useForResting?body.weightKg:energy.resting.weightKg,height=policy?.useHeightForResting?body.heightCm:energy.resting.heightCm;
    restingBasis=guidance('resting.equation',{sex:energy.resting.sex,age:age.years??null,weight:weight??null,height:height??null,weightSource:policy?.useForResting?'recorded':'saved',heightSource:policy?.useHeightForResting?'recorded':'saved',unavailable:resting===null});
  }
  const bmi=bodyMassIndex(body.weightKg,body.heightCm),stored={};
  for(const key of ['age','height','weight','activity','goal','units'])if(Object.hasOwn(state.profile??{},key))stored[key]=state.profile[key];
  return {version:PRINT_PROFILE_VERSION,date,name:typeof state.profile?.name==='string'?state.profile.name:null,
    age:{value:age?.years??null,unit:'years',basis:guidance(age?age.source==='birth-date'?'age.birth':'age.manual':'age.unconfigured')},
    sex:{value:energy?.resting.sex??null,unit:'',basis:guidance('sex')},
    height:measurement('height','cm'),weight:measurement('weight','kg'),
    bmi:{value:bmi,unit:'kg/m²',basis:bmi===null?guidance('bmi.missing'):guidance('bmi.calculated',{differentDates:body.weight.reading.date!==body.height.reading.date})},
    resting:{value:resting,unit:'kcal/day',basis:restingBasis},
    stored,notice:guidance('notice')};
}
