import {accountMessage as m} from './account-cloud-messages.js';
import {escape as e} from './html.js';

export function reminderShortcuts(data){
 return [
  {kind:'daily',label:m('reminders.foodShortcut'),foodCondition:{group:null},hint:m('reminders.foodShortcutHint')},
  ...(data.groups??[]).map(group=>({kind:'daily',label:group,foodCondition:{group}})),
  {kind:'weight',label:m('reminders.weightShortcut'),hint:m('reminders.weightShortcutHint')},
  {kind:'fasting',label:m('reminders.fastShortcut')}
 ];
}

export function shortcutSettings(data){
 const slots=reminderShortcuts(data);
 const rows=(slot,index)=>{
  const matches=data.schedules.filter(row=>row.kind===slot.kind&&(row.kind!=='daily'||row.foodCondition&&row.foodCondition.group===slot.foodCondition.group));
  return (matches.length?matches:[null]).map(row=>{
   const label=matches.length>1?slot.label+' · '+row.label:slot.label;
   const detail=row?[row.label===label?'':row.label,row.time,row.weightMetric?.unit].filter(Boolean).join(' · '):'';
   return `<div class="push-shortcut"><label class="mds-row"><strong>${e(label)}</strong><input type="checkbox" role="switch" class="dc-switch" data-reminder-action="shortcut" data-slot="${index}" ${row?`data-id="${e(row.id)}"`:''} ${row?.enabled?'checked':''}></label>${slot.hint?`<p>${e(slot.hint)}</p>`:''}${row?`<button type="button" data-reminder-action="edit" data-id="${e(row.id)}">${e(m('mobileNutrientTargets.edit'))}${detail?' · '+e(detail):''}</button>`:''}</div>`;
  }).join('');
 };
 const groupRows=slots.slice(1,-2).map((slot,i)=>rows(slot,i+1)).join('');
 return `<section class="push-shortcuts">${rows(slots[0],0)}${groupRows?`<p>${e(m('reminders.groupHint'))}</p><div class="push-shortcut-groups">${groupRows}</div>`:''}${rows(slots.at(-2),slots.length-2)}${rows(slots.at(-1),slots.length-1)}</section>`;
}
