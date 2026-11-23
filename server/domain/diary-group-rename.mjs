import {diaryGroups,defaultDiaryGroup} from './diary-groups.mjs';
import {parseDiaryGroupOrder} from './diary-order.mjs';
import {healthConnectGroup} from './health-import-group.mjs';
import {parseDiaryGroups,resolveDiaryGroups} from './diary-group-display.mjs';
import {parseDiaryQuickAdd} from './diary-quick-add.mjs';
import {parseWaterSettings} from './water-settings.mjs';

const fail=(message,status=400)=>{throw Object.assign(Error(message),{status});};
const collections=['entries','biometrics','notes','repeats'];
function checkName(name){
  if(typeof name!=='string'||!name.trim()||name.length>100||name!==name.trim()||/[\r\n]/.test(name))fail('Use a group name of 1–100 characters without surrounding spaces or line breaks.');
}

export function diaryGroupSlots(settings){
  const groups=diaryGroups(settings.groups),empty=resolveDiaryGroups(settings).emptySlots??[];
  let next=0;
  return Array.from({length:Math.max(8,groups.length+empty.length)},(_,i)=>
    empty.includes(i+1)?null:groups[next++]??null);
}

export function editDiaryGroupSlot(state,{slot,from,name,enabled}){
  const settings=state.settings,slots=diaryGroupSlots(settings);
  if(!Number.isInteger(slot)||slot<1||slot>slots.length||typeof enabled!=='boolean')fail('Choose a diary group slot and visibility.');
  if(slots[slot-1]!==from)fail('This diary group changed. Reload Settings before editing it.',409);
  checkName(name);
  if(from!==name&&slots.includes(name))fail('That diary group already exists. Choose a unique name.',409);
  if(from===null&&slots.filter(group=>group!==null&&group!==defaultDiaryGroup).length>=30)fail('Use at most 30 custom diary groups.');
  if(from!==null&&from!==name)renameDiaryGroup(state,{from,to:name});
  const policy=resolveDiaryGroups(state.settings);
  slots[slot-1]=name;
  const last=slots.findLastIndex(group=>group!==null);
  const emptySlots=slots.slice(0,last).flatMap((group,i)=>group===null?[i+1]:[]);
  const hiddenGroups=policy.hiddenGroups.filter(group=>group!==name);
  if(!enabled)hiddenGroups.push(name);
  state.settings.groups=slots.filter(group=>group!==null);
  state.settings.diaryGroups={version:1,showGroups:policy.showGroups,hiddenGroups,...(emptySlots.length?{emptySlots}:{})};
}

export function renameDiaryGroup(state,input){
  if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).length!==2||!Object.hasOwn(input,'from')||!Object.hasOwn(input,'to'))fail('Supply the existing group and its new name.');
  const {from,to}=input;
  if(typeof from!=='string'||!from.trim())fail('Supply the existing group and its new name.');
  checkName(to);
  const groups=diaryGroups(state.settings.groups);
  if(from===defaultDiaryGroup)fail('Uncategorized is the default diary group. Choose another group to rename.');
  if(groups.filter(group=>group===from).length!==1)fail('This diary group changed. Reload Settings before renaming it.',409);
  if(to===from)fail('Enter a different group name.');
  if(groups.includes(to))fail('That diary group already exists. Choose a unique name.',409);
  const next={...state.settings,groups:groups.map(group=>group===from?to:group)};
  if(next.diaryGroups!=null){const policy=parseDiaryGroups(next.diaryGroups,groups);next.diaryGroups=parseDiaryGroups({...policy,hiddenGroups:policy.hiddenGroups.map(group=>group===from?to:group)},next.groups);}
  if(next.diaryQuickAdd!=null){const policy=parseDiaryQuickAdd(next.diaryQuickAdd,groups);next.diaryQuickAdd=parseDiaryQuickAdd({...policy,shortcuts:policy.shortcuts.map(row=>row.group===from?{...row,group:to}:row)},next.groups);}
  if(next.diaryGroupOrder!=null){const policy=parseDiaryGroupOrder(next.diaryGroupOrder,groups);next.diaryGroupOrder=parseDiaryGroupOrder({...policy,groups:policy.groups.map(row=>row.group===from?{...row,group:to}:row)},next.groups);}
  if(healthConnectGroup(state.settings)===from)next.healthConnectGroup=to;
  if(next.waterSettings!=null){const policy=parseWaterSettings(next.waterSettings,groups);next.waterSettings=parseWaterSettings({...policy,group:policy.group===from?to:policy.group},next.groups);}
  // Only live assignments are renamed. Source facts, reviewed packets, replay
  // receipts, copy lineage and recovery history retain their original facts.
  const assigned=collections.flatMap(collection=>state[collection].filter(row=>row.group===from));
  for(const row of assigned)row.group=to;
  state.settings=next;
}
