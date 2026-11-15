import Big from 'big.js';
// NIH ODS: dietary vitamin D, 1 microgram = 40 IU.
// https://ods.od.nih.gov/factsheets/VitaminD-HealthProfessional/
const Decimal=Big();Decimal.DP=340;
const fail=message=>{throw Object.assign(new Error(message),{status:400});};
export function parseVitaminDUnit(unit){
  if(unit!=='µg'&&unit!=='IU')fail('Choose micrograms (µg) or IU for dietary vitamin D.');
  return unit;
}
export function convertVitaminD(value,from,to){
  parseVitaminDUnit(from);parseVitaminDUnit(to);
  if(value===null)return null;
  if(typeof value!=='number'||!Number.isFinite(value)||value<0)fail('Vitamin D must be a nonnegative finite amount or unknown.');
  if(from===to||value===0)return value;
  const converted=Number((from==='µg'?new Decimal(value).times(40):new Decimal(value).div(40)).toString());
  if(!Number.isFinite(converted)||(value!==0&&converted===0))fail('The converted vitamin D amount is outside the supported numeric range.');
  return converted;
}
