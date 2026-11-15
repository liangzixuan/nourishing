import Big from './energy-decimal.mjs';

// Thermochemical kilocalorie: 1 kcal = 4.184 kJ (NIST SP 811, Appendix B.9).
export const KILOJOULES_PER_KILOCALORIE='4.184';
const Decimal=Big();Decimal.DP=340;
const fail=message=>{throw Object.assign(new Error(message),{status:400});};
export function parseEnergyUnit(unit){
  if(unit!=='kcal'&&unit!=='kJ')fail('Choose kcal or kJ as the energy unit.');
  return unit;
}

/** Convert a value at a presentation/input boundary, never by mutating its source. */
export function convertEnergy(value,from,to){
  parseEnergyUnit(from);parseEnergyUnit(to);
  if(value===null)return null;
  if(typeof value!=='number'||!Number.isFinite(value))fail('Energy must be a finite number or unknown.');
  if(from===to||value===0)return value;
  const converted=Number((from==='kcal'?new Decimal(value).times(KILOJOULES_PER_KILOCALORIE):new Decimal(value).div(KILOJOULES_PER_KILOCALORIE)).toString());
  if(!Number.isFinite(converted))fail('The converted energy is outside the supported numeric range.');
  return converted;
}
