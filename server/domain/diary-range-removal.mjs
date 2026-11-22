import {Temporal} from '@js-temporal/polyfill';
import {date,parseReportTimeZone} from './calendar.mjs';

const supported=['food','exercise','biometrics','notes','fasts'];
const fail=message=>{throw Object.assign(Error(message),{status:400});};

export function parseDiaryRangeRemoval(input){
 if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).length!==4||
    !['start','end','timeZone','types'].every(key=>Object.hasOwn(input,key)))fail('Choose a date range and the diary data to delete.');
 const start=date(input.start),end=date(input.end);
 if(start>end)fail('The end date must be on or after the start date.');
 if(typeof input.timeZone!=='string'||!input.timeZone.trim())fail('Choose a valid time zone.');
 const timeZone=parseReportTimeZone(input.timeZone),types=input.types;
 if(!Array.isArray(types)||!types.length||new Set(types).size!==types.length||types.some(type=>!supported.includes(type)))fail('Choose at least one supported diary data type.');
 return {start,end,timeZone,types:supported.filter(type=>types.includes(type))};
}

/** Remove Diary occurrences. Food, recipe, exercise and metric definitions are stored separately. */
export function removeDiaryRange(state,input){
 const {start,end,timeZone,types}=parseDiaryRangeRemoval(input),selected=new Set(types);
 const inRange=day=>day>=start&&day<=end;
 const removed={food:0,exercise:0,biometrics:0,notes:0,fasts:0,daysReopened:0};
 const keep=(kind,day)=>{
  if(!selected.has(kind)||!inRange(day))return true;
  removed[kind]++;
  return false;
 };
 const changes={};
 if(selected.has('food')||selected.has('exercise')){
  changes.entries=state.entries.filter(row=>keep(row.kind==='exercise'?'exercise':'food',row.date));
 }
 for(const name of ['biometrics','notes']){
  if(selected.has(name))changes[name]=state[name].filter(row=>keep(name,row.date));
 }
 if(selected.has('fasts')){
  changes.fasts=state.fasts.filter(row=>{
   const day=Temporal.Instant.from(row.start).toZonedDateTimeISO(timeZone).toPlainDate().toString();
   return keep('fasts',day);
  });
 }
 const completedDays=state.settings.completedDays.filter(day=>!inRange(day));
 removed.daysReopened=state.settings.completedDays.length-completedDays.length;
 Object.assign(state,changes);
 state.settings.completedDays=completedDays;
 return removed;
}
