import Big from 'big.js';
import {waterLimits} from './diary-record-fields.mjs';

// US customary volumes: one fluid ounce is 1/128 of a 231 cubic inch gallon.
// A cup is eight fluid ounces. Stored quantities remain milliliters.
export const waterUnits=Object.freeze({'mL':1,'fl oz':29.5735295625,cup:236.5882365});
const fail=()=>{throw Object.assign(Error('Choose valid water units, amounts and diary settings.'),{status:400});};
const volume=value=>typeof value==='number'&&Number.isFinite(value)&&value>=waterLimits.minimumMl&&value<=waterLimits.maximumMl;
const fields=['version','unit','goalMl','containerMl','showEntries','showTotal','group'];
export const defaultWaterSettings=Object.freeze({version:1,unit:'fl oz',goalMl:1892.705892,containerMl:236.5882365,showEntries:true,showTotal:true,group:null});
export function parseWaterSettings(value,groups){
 if(value===null)return null;
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).length!==fields.length||fields.some(key=>!Object.hasOwn(value,key))||value.version!==1||!Object.hasOwn(waterUnits,value.unit)||!volume(value.goalMl)||!volume(value.containerMl)||typeof value.showEntries!=='boolean'||typeof value.showTotal!=='boolean'||value.group!==null&&(!Array.isArray(groups)||!groups.includes(value.group)))fail();
 return Object.fromEntries(fields.map(key=>[key,value[key]]));
}
export function resolveWaterSettings(settings){return settings.waterSettings==null?{...defaultWaterSettings}:parseWaterSettings(settings.waterSettings,settings.groups);}
export function waterToMilliliters(amount,unit){
 if(typeof amount!=='number'||!Number.isFinite(amount)||amount<0||!Object.hasOwn(waterUnits,unit))fail();
 const result=Number(new Big(amount).times(waterUnits[unit]));if(!Number.isFinite(result))fail();return result;
}
export function waterFromMilliliters(amount,unit){
 if(typeof amount!=='number'||!Number.isFinite(amount)||amount<0||!Object.hasOwn(waterUnits,unit))fail();
 return Number(new Big(amount).div(waterUnits[unit]));
}
