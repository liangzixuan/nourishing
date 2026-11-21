import {parseDiaryGroupOrder} from './diary-order.mjs';
import {healthConnectGroup} from './health-import-group.mjs';
import {parseDiaryGroups} from './diary-group-display.mjs';
import {parseDiaryQuickAdd} from './diary-quick-add.mjs';
import {parseWaterSettings} from './water-settings.mjs';

const fail=(message,status=400)=>{throw Object.assign(Error(message),{status});};
const collections=['entries','biometrics','notes','repeats'];
export function renameDiaryGroup(state,input){
  if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).length!==2||!Object.hasOwn(input,'from')||!Object.hasOwn(input,'to'))fail('Supply the existing group and its new name.');
  const {from,to}=input;
  if(typeof from!=='string'||!from.trim()||typeof to!=='string'||!to.trim()||to.length>100||to!==to.trim()||/[\r\n]/.test(to))fail('Use a group name of 1–100 characters without surrounding spaces or line breaks.');
  const groups=state.settings.groups;
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
