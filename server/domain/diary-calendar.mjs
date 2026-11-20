import {date,captureCalendar} from './calendar.mjs';
export const diaryCalendarKinds=Object.freeze(['food','exercise','biometric','note','fast']);
export const defaultDiaryCalendar=Object.freeze({version:1,...Object.fromEntries(diaryCalendarKinds.map(key=>[key,true]))});
export function projectDiaryCalendar(state,month,context){
 if(typeof month!=='string'||!/^\d{4}-\d{2}$/.test(month))throw Object.assign(Error('Choose a calendar month.'),{status:400});
 const from=date(month+'-01'),end=new Date(from+'T12:00:00Z');end.setUTCMonth(end.getUTCMonth()+1);end.setUTCDate(0);const to=date(end.toISOString().slice(0,10));
 const calendar=captureCalendar(context.now??new Date(context.asOf),context.timeZone);
 return {month,markers:diaryCalendarMarkers(state,{from,to,now:new Date(calendar.asOf),timeZone:calendar.timeZone}),completedDays:(state.settings.completedDays??[]).filter(day=>day>=from&&day<=to),calendar};
}
export function parseDiaryCalendar(value){
 if(value===undefined||value===null)return null;
 if(typeof value!=='object'||Array.isArray(value)||Object.keys(value).length!==6||value.version!==1||!diaryCalendarKinds.every(key=>typeof value[key]==='boolean'))throw Object.assign(Error('Choose visibility for food, exercise, biometric, note and fasting calendar markers.'),{status:400});
 return {version:1,...Object.fromEntries(diaryCalendarKinds.map(key=>[key,value[key]]))};
}
/** Project only presence, never quantities. Recorded diary dates retain their source date. */
export function diaryCalendarMarkers(state,{from,to,timeZone,now=new Date()}){
 date(from);date(to);if(from>to)throw Object.assign(Error('Choose an ordered calendar range.'),{status:400});
 const policy=parseDiaryCalendar(state.settings.diaryCalendar)??defaultDiaryCalendar,markers=new Map();
 const add=(day,kind)=>{if(!policy[kind]||day<from||day>to)return;if(!markers.has(day))markers.set(day,new Set());markers.get(day).add(kind)};
 for(const row of state.entries??[])add(row.date,row.kind==='exercise'?'exercise':'food');
 for(const row of state.biometrics??[])add(row.date,'biometric');
 for(const row of state.notes??[])add(row.date,'note');
 if(policy.fast)for(const row of state.fasts??[]){
  const start=new Date(row.start),end=row.end===null?now:new Date(row.end);if(!Number.isFinite(start.valueOf())||!Number.isFinite(end.valueOf())||start>=end)continue;
  const first=captureCalendar(start,timeZone).today,last=captureCalendar(new Date(end.valueOf()-1),timeZone).today;
  for(let day=first<from?from:first;day<=last&&day<=to;){add(day,'fast');const next=new Date(day+'T12:00:00Z');next.setUTCDate(next.getUTCDate()+1);day=next.toISOString().slice(0,10)}
 }
 return Object.fromEntries([...markers].map(([day,kinds])=>[day,diaryCalendarKinds.filter(kind=>kinds.has(kind))]));
}
