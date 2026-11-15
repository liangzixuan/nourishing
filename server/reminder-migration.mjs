import {isDeepStrictEqual} from 'node:util';
import {parseReminderSchedule,reminderPreferences,MAX_REMINDER_SCHEDULES} from './reminder-schedules.mjs';

const fail=()=>{throw Object.assign(Error('Reminder migration source or account is invalid.'),{code:409});};
const ordered=rows=>[...rows].sort((a,b)=>a.id.localeCompare(b.id));
/** Only schedule payloads cross this boundary. PC keys, devices and delivery history are excluded. */
export function compareReminderSchedules({rows,cloudRow,ownerId}){
 if(typeof ownerId!=='string'||!ownerId||!Array.isArray(rows)||rows.length>MAX_REMINDER_SCHEDULES)fail();
 const seen=new Set(),schedules=ordered(rows.map(row=>{
  if(typeof row?.payload!=='string'||Buffer.byteLength(row.payload)>16384)fail();
  let value;try{value=JSON.parse(row.payload);}catch{fail();}
  const parsed=parseReminderSchedule(value,{stored:true});if(parsed.id!==row.id||seen.has(parsed.id))fail();seen.add(parsed.id);return parsed;
 }));
 let saved={devices:[],schedules:[],paused:true,resumedAt:null};
 if(cloudRow){
  if(cloudRow.$id!==ownerId||cloudRow.ownerId!==ownerId||!Array.isArray(cloudRow.$permissions)||cloudRow.$permissions.length!==0||!Number.isSafeInteger(cloudRow.version)||cloudRow.version<0||typeof cloudRow.$updatedAt!=='string')fail();
  try{saved=JSON.parse(cloudRow.payload);}catch{fail();}
  if(!saved||typeof saved!=='object'||Array.isArray(saved)||!Array.isArray(saved.devices))fail();
 }
 const current=reminderPreferences(saved),existing=ordered(current.schedules),matches=isDeepStrictEqual(existing,schedules);
 const byId=new Map(existing.map(row=>[row.id,row])),sourceIds=new Set(schedules.map(row=>row.id));
 const difference={added:schedules.filter(row=>!byId.has(row.id)).length,changed:schedules.filter(row=>byId.has(row.id)&&!isDeepStrictEqual(row,byId.get(row.id))).length,cloudOnly:existing.filter(row=>!sourceIds.has(row.id)).length};
 return {status:matches?'unchanged':'different',sourceSchedules:schedules.length,cloudSchedules:existing.length,cloudDevices:saved.devices.length,...difference,cloudPaused:current.paused,cloudResumed:current.resumedAt!==null};
}
