import {isEnergyReason,isEnergyLimitation} from './../server/energy-guidance.mjs';
import {formatMessage} from './message-format.js';
export function formatEnergyReason(code,language='en'){
 if(!isEnergyReason(code))throw new TypeError('Unknown energy reason code.');
 return formatMessage(language,'energyGuidance.reason.'+code);
}
export function formatEnergyLimitation(code,language='en'){
 if(!isEnergyLimitation(code))throw new TypeError('Unknown energy limitation code.');
 return formatMessage(language,'energyGuidance.limitation.'+code);
}
