import {digest} from './data-codec.mjs';
import {parseEnergyUnit} from './domain/energy-units.mjs';
import {defaultDiaryDisplayPolicy,parseDiaryDisplayPolicy} from './domain/diary-display.mjs';
import {prepareDiaryDisplayCommand} from './diary-display-settings.mjs';
const visibility=['showTimestamp','showEnergy','showMacros','showWater'];
export const displayCommandFields={'display.save':['energyUnit','theme',...visibility,'diaryDisplay']};
const fail=message=>{throw Object.assign(Error(message),{status:400});};
export function displayView(state){
 const source=state.settings;
 return {revision:digest(state),settings:{energyUnit:parseEnergyUnit(source.energyUnit??'kcal'),theme:source.theme??'dark',...Object.fromEntries(visibility.map(key=>[key,source[key]!==false])),diaryDisplay:parseDiaryDisplayPolicy(source.diaryDisplay)??structuredClone(defaultDiaryDisplayPolicy)}};
}
export function prepareDisplayCommand(state,{type,payload}){
 if(type!=='display.save')return {type,payload};
 if(!payload||typeof payload!=='object'||Array.isArray(payload)||!Object.keys(payload).length||Object.keys(payload).some(key=>!displayCommandFields[type].includes(key)))fail('Choose a display setting.');
 const patch={};
 if(Object.hasOwn(payload,'energyUnit'))patch.energyUnit=parseEnergyUnit(payload.energyUnit);
 if(Object.hasOwn(payload,'theme')){if(!['light','dark','system'].includes(payload.theme))fail('Choose a theme.');patch.theme=payload.theme;}
 if(Object.hasOwn(payload,'showTimestamp')){if(typeof payload.showTimestamp!=='boolean')fail('Choose whether to show timestamps.');patch.showTimestamp=payload.showTimestamp;}
 const diaryPatch=Object.fromEntries(['showEnergy','showMacros','showWater','diaryDisplay'].filter(key=>Object.hasOwn(payload,key)).map(key=>[key,payload[key]]));
 if(Object.keys(diaryPatch).length)Object.assign(patch,prepareDiaryDisplayCommand(state,{type:'diaryDisplay.save',payload:diaryPatch}).payload);
 return {type:'settings.save',payload:patch};
}
