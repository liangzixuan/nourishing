const fail=()=>{throw Object.assign(Error('Choose whether to show diary groups and which existing groups to hide.'),{status:400});};
export const defaultDiaryGroups=Object.freeze({version:1,showGroups:true,hiddenGroups:Object.freeze([])});
export function parseDiaryGroups(value,groups){
  if(value===null)return null;
  if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(key=>!['version','showGroups','hiddenGroups','emptySlots'].includes(key))||!['version','showGroups','hiddenGroups'].every(key=>Object.hasOwn(value,key))||value.version!==1||typeof value.showGroups!=='boolean'||!Array.isArray(value.hiddenGroups)||new Set(value.hiddenGroups).size!==value.hiddenGroups.length||value.hiddenGroups.some(group=>typeof group!=='string'||!groups.includes(group)))fail();
  const emptySlots=Object.hasOwn(value,'emptySlots')?value.emptySlots:[];
  if(!Array.isArray(emptySlots)||emptySlots.length>8||emptySlots.some((slot,i)=>!Number.isInteger(slot)||slot<1||slot>8||(i>0&&slot<=emptySlots[i-1])))fail();
  return {version:1,showGroups:value.showGroups,hiddenGroups:[...value.hiddenGroups],...(emptySlots.length?{emptySlots:[...emptySlots]}:{})};
}
export function resolveDiaryGroups(settings){return settings.diaryGroups===undefined?defaultDiaryGroups:parseDiaryGroups(settings.diaryGroups,settings.groups)??defaultDiaryGroups;}
export function diaryRecordVisible(record,policy){return !policy.showGroups||!policy.hiddenGroups.includes(record.group);}
