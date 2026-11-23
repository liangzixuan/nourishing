import {diaryGroups} from './diary-groups.mjs';
import {parseFontScale} from './font-scale.mjs';
import {parseAppLanguage} from './app-language.mjs';
import {resolveDiaryGroups} from './diary-group-display.mjs';
import {parseDiaryQuickAdd,diaryQuickAddActions} from './diary-quick-add.mjs';
import {defaultDiaryCalendar,parseDiaryCalendar} from './diary-calendar.mjs';
import {parseEnergyUnit} from './energy-units.mjs';
import {defaultDiaryDisplayPolicy,parseDiaryDisplayPolicy,defaultDiaryTablePolicy,parseDiaryTablePolicy,diaryTableNutrients} from './diary-display.mjs';
import {resolveWaterSettings} from './water-settings.mjs';
const visibility=['showTimestamp','showEnergy','showMacros','showWater'];
export function createDisplayView(state){
 const source={...state.settings,groups:diaryGroups(state.settings.groups),waterSettings:resolveWaterSettings(state.settings)};
 return {quickAddActions:diaryQuickAddActions,summaryNutrients:diaryTableNutrients.map(({id,name,unit})=>({id,name,unit})),settings:{waterSettings:source.waterSettings,appLanguage:parseAppLanguage(source.appLanguage??'en'),fontScale:parseFontScale(source.fontScale),matchDeviceFontSize:source.matchDeviceFontSize===true,groups:[...source.groups],diaryGroups:resolveDiaryGroups(source),diaryQuickAdd:source.diaryQuickAdd===undefined?{version:1,shortcuts:[]}:parseDiaryQuickAdd(source.diaryQuickAdd,source.groups)??{version:1,shortcuts:[]},alwaysExpandMeals:source.alwaysExpandMeals===true,diaryCalendar:parseDiaryCalendar(source.diaryCalendar)??{...defaultDiaryCalendar},energyUnit:parseEnergyUnit(source.energyUnit??'kcal'),theme:source.theme??'dark',...Object.fromEntries(visibility.map(key=>[key,source[key]!==false])),diaryDisplay:parseDiaryDisplayPolicy(source.diaryDisplay)??structuredClone(defaultDiaryDisplayPolicy),diaryTable:parseDiaryTablePolicy(source.diaryTable)??{...defaultDiaryTablePolicy}}};
}
