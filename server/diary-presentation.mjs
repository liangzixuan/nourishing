import {orderDiaryEntries,diaryGroupOrders} from './domain/diary-order.mjs';
import {parseEnergyUnit,convertEnergy} from './domain/energy-units.mjs';
import {diaryRecordPresentation} from './diary-record-presentation.mjs';
export function diaryEnergy(state,calories){const unit=parseEnergyUnit(state.settings.energyUnit??'kcal');return {value:convertEnergy(calories??null,'kcal',unit),unit};}
/** Presentation is resolved once from the same account settings that own the actions. */
export function diaryToolsPresentation(state,view){
 const orders=diaryGroupOrders(state.settings),mode=state.settings.diarySort??'source',entries=[];
 for(const group of [...new Set([...view.groups,...view.entries.map(row=>row.group)])])entries.push(...orderDiaryEntries(view.entries.filter(row=>row.group===group),orders.get(group)??mode));
 const energy=diaryEnergy(state,view.summary.energy?.consumed??view.summary.totals?.calories);
 return {...view,recordDisplay:diaryRecordPresentation(state.settings,{...view,entries}),energyUnit:energy.unit,consumedEnergy:energy.value,diarySort:mode,groupOrders:Object.fromEntries(orders),entries:entries.map(row=>({...row,energyValue:diaryEnergy(state,row.kind==='exercise'?row.caloriesBurned:row.facts?.nutrients?.calories).value}))};
}
