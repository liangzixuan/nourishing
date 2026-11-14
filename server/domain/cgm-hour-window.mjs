import {Temporal} from '@js-temporal/polyfill';
import {captureCalendar} from './calendar.mjs';
export const cgmHours=Object.freeze([3,24,48,72]);
export function captureCgmWindow(hours,{now,timeZone}){
 if(!cgmHours.includes(hours))throw Object.assign(Error('Choose 3, 24, 48 or 72 hours.'),{status:400});
 const calendar=captureCalendar(now,timeZone),end=new Date(calendar.asOf),start=new Date(end.getTime()-hours*3600000);
 const local=value=>Temporal.Instant.from(value.toISOString()).toZonedDateTimeISO(timeZone).toPlainDate().toString();
 return {hours,start:start.toISOString(),end:end.toISOString(),timeZone,range:{from:local(start),to:local(end)}};
}
/** Diary times do not identify an instant during a clock-back fold. Keep those
 * records as unresolved evidence rather than assign them to an occurrence. */
export function scopeCgmRows(rows,window){
 const start=Date.parse(window.start),end=Date.parse(window.end),selected=[];
 for(const row of rows){
  if(!row.position){row.eligible=false;selected.push(row);continue}
  let instant;
  try{instant=row.position.instant?Date.parse(row.position.instant):Temporal.PlainDateTime.from(row.date+'T'+row.time).toZonedDateTime(window.timeZone,{disambiguation:'reject'}).epochMilliseconds}
  catch{row.position=null;row.eligible=false;(row.reasons??=[]).push({code:'clock-change',text:'This diary time does not identify one instant in the selected time zone.'});selected.push(row);continue}
  if(instant<start||instant>end)continue;
  row.position={...row.position,instant:new Date(instant).toISOString(),offsetMinutes:(instant-start)/60000};selected.push(row);
 }
 return selected;
}
export function scopeCgmFasts(rows,window){
 const start=Date.parse(window.start),end=Date.parse(window.end);
 return rows.flatMap(row=>{
  const from=Date.parse(row.start),to=Date.parse(row.end??window.end);if(to<start||from>end)return [];
  const position=ms=>({instant:new Date(ms).toISOString(),offsetMinutes:(ms-start)/60000});
  return [{...row,startPosition:position(Math.max(start,from)),endPosition:position(Math.min(end,to)),clippedStart:from<start,clippedEnd:to>end}];
 });
}
