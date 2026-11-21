import {resolveDiaryGroups,diaryRecordVisible} from './domain/diary-group-display.mjs';
import {resolveWaterSettings} from './domain/water-settings.mjs';
import {isLoggedWater} from './domain/water-measurement.mjs';

/** Display groups never replace a record's stored (possibly absent) group.
 * Source mobile order is notes, biometrics, then the canonically ordered entries.
 */
export function diaryRecordPresentation(settings,view){
 const policy=resolveDiaryGroups(settings),names=view.groups.filter(group=>!policy.showGroups||!policy.hiddenGroups.includes(group));
 const water=resolveWaterSettings(settings);
 const records=['entries','notes','biometrics'].flatMap(collection=>(view[collection]??[]).filter(row=>diaryRecordVisible(row,policy)&&(collection!=='biometrics'||water.showEntries||!isLoggedWater(row))).map(row=>({collection,id:row.id,group:row.group||(collection==='entries'?'Snacks':'Uncategorized')})));
 for(const {group} of records)if(!names.includes(group))names.unshift(group);
 return {showGroups:policy.showGroups,groups:names.map(name=>({name,configured:view.groups.includes(name),records:['notes','biometrics','entries'].flatMap(collection=>records.filter(ref=>ref.group===name&&ref.collection===collection).map(({collection,id})=>({collection,id})))}))};
}
