import {parseFontScale} from './domain/font-scale.mjs';
import {parseAppLanguage} from './domain/app-language.mjs';
import {parseDiaryGroups,resolveDiaryGroups} from './domain/diary-group-display.mjs';
import {parseDiaryQuickAdd,diaryQuickAddActions} from './domain/diary-quick-add.mjs';
import {defaultDiaryCalendar,parseDiaryCalendar} from './domain/diary-calendar.mjs';
import {digest} from './data-codec.mjs';
import {parseEnergyUnit} from './domain/energy-units.mjs';
import {defaultDiaryDisplayPolicy,parseDiaryDisplayPolicy,defaultDiaryTablePolicy,parseDiaryTablePolicy,diaryTableNutrients} from './domain/diary-display.mjs';
import {prepareDiaryDisplayCommand} from './diary-display-settings.mjs';
const visibility=['showTimestamp','showEnergy','showMacros','showWater'];
export const displayCommandFields={'display.save':['appLanguage','fontScale','matchDeviceFontSize','energyUnit','theme',...visibility,'diaryDisplay','diaryTable','diaryCalendar','diaryGroups','diaryQuickAdd','alwaysExpandMeals']};
const fail=message=>{throw Object.assign(Error(message),{status:400});};
export function displayView(state){
 const source=state.settings;
 return {revision:digest(state),quickAddActions:diaryQuickAddActions,summaryNutrients:diaryTableNutrients.map(({id,name,unit})=>({id,name,unit})),settings:{appLanguage:parseAppLanguage(source.appLanguage??'en'),fontScale:parseFontScale(source.fontScale),matchDeviceFontSize:source.matchDeviceFontSize===true,groups:[...source.groups],diaryGroups:resolveDiaryGroups(source),diaryQuickAdd:source.diaryQuickAdd===undefined?{version:1,shortcuts:[]}:parseDiaryQuickAdd(source.diaryQuickAdd,source.groups)??{version:1,shortcuts:[]},alwaysExpandMeals:source.alwaysExpandMeals===true,diaryCalendar:parseDiaryCalendar(source.diaryCalendar)??{...defaultDiaryCalendar},energyUnit:parseEnergyUnit(source.energyUnit??'kcal'),theme:source.theme??'dark',...Object.fromEntries(visibility.map(key=>[key,source[key]!==false])),diaryDisplay:parseDiaryDisplayPolicy(source.diaryDisplay)??structuredClone(defaultDiaryDisplayPolicy),diaryTable:parseDiaryTablePolicy(source.diaryTable)??{...defaultDiaryTablePolicy}}};
}
export function prepareDisplayCommand(state,{type,payload}){
 if(type!=='display.save')return {type,payload};
 if(!payload||typeof payload!=='object'||Array.isArray(payload)||!Object.keys(payload).length||Object.keys(payload).some(key=>!displayCommandFields[type].includes(key)))fail('Choose a display setting.');
 const patch={};
 if(Object.hasOwn(payload,'appLanguage'))patch.appLanguage=parseAppLanguage(payload.appLanguage);
 if(Object.hasOwn(payload,'fontScale'))patch.fontScale=parseFontScale(payload.fontScale);
 if(Object.hasOwn(payload,'matchDeviceFontSize')){if(typeof payload.matchDeviceFontSize!=='boolean')fail('Choose whether to use browser text size.');patch.matchDeviceFontSize=payload.matchDeviceFontSize;}
 if(Object.hasOwn(payload,'diaryGroups'))patch.diaryGroups=parseDiaryGroups(payload.diaryGroups,state.settings.groups);
 if(Object.hasOwn(payload,'diaryQuickAdd'))patch.diaryQuickAdd=parseDiaryQuickAdd(payload.diaryQuickAdd,state.settings.groups);
 if(Object.hasOwn(payload,'alwaysExpandMeals')){if(typeof payload.alwaysExpandMeals!=='boolean')fail('Choose whether to expand meals.');patch.alwaysExpandMeals=payload.alwaysExpandMeals;}
 if(Object.hasOwn(payload,'diaryCalendar'))patch.diaryCalendar=parseDiaryCalendar(payload.diaryCalendar);
 if(Object.hasOwn(payload,'diaryTable'))patch.diaryTable=parseDiaryTablePolicy(payload.diaryTable);
 if(Object.hasOwn(payload,'energyUnit'))patch.energyUnit=parseEnergyUnit(payload.energyUnit);
 if(Object.hasOwn(payload,'theme')){if(!['light','dark','system'].includes(payload.theme))fail('Choose a theme.');patch.theme=payload.theme;}
 if(Object.hasOwn(payload,'showTimestamp')){if(typeof payload.showTimestamp!=='boolean')fail('Choose whether to show timestamps.');patch.showTimestamp=payload.showTimestamp;}
 const diaryPatch=Object.fromEntries(['showEnergy','showMacros','showWater','diaryDisplay'].filter(key=>Object.hasOwn(payload,key)).map(key=>[key,payload[key]]));
 if(Object.keys(diaryPatch).length)Object.assign(patch,prepareDiaryDisplayCommand(state,{type:'diaryDisplay.save',payload:diaryPatch}).payload);
 return {type:'settings.save',payload:patch};
}
