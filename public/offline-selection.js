import {calculateSelectionNutrition,isExerciseEntry} from './report-source/server/nutrition.mjs';
import {resolveDiaryGroups,diaryRecordVisible} from './report-source/server/diary-group-display.mjs';

// UI-only scope: never changes the retained snapshot or the sync outbox.
export function createOfflineSelection(){
 let key=null,enabled=false;const ids=new Set();
 return {
  clear(){ids.clear();enabled=false;},
  toggle(){enabled=!enabled;if(!enabled)ids.clear();},
  select(id,selected){if(selected)ids.add(id);else ids.delete(id);},
  group(rows,group){ids.clear();for(const row of rows)if(row.group===group)ids.add(row.id);},
  capture(copy,state,date,summary){
   const next=JSON.stringify([copy.ownerId,copy.snapshot.identity.generation,copy.snapshot.savedAt,date]);
   if(next!==key){ids.clear();enabled=false;key=next;}
   const policy=resolveDiaryGroups(state.settings),rows=state.entries.filter(row=>row.date===date&&!isExerciseEntry(row)&&diaryRecordVisible(row,policy)),available=new Set(rows.map(row=>row.id));
   for(const id of ids)if(!available.has(id))ids.delete(id);
   return {enabled,ids:new Set(ids),rows,groups:policy.showGroups?state.settings.groups.filter(group=>rows.some(row=>row.group===group)):[],nutrition:ids.size?calculateSelectionNutrition(state,date,[...ids]):summary};
  },
 };
}
