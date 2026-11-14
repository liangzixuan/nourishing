import {Temporal} from '@js-temporal/polyfill';

const maximum=Temporal.PlainDate.from('9999-12-31');
const distance=(from,to,frequency)=>frequency==='monthly'?(to.year-from.year)*12+to.month-from.month:frequency==='yearly'?to.year-from.year:from.until(to,{largestUnit:'days'}).days;

/** Calendar dates only. The schedule owner applies its zoned clock and cursor. */
export function* fastingRecurrenceDates(schedule,bound,direction){
 const start=Temporal.PlainDate.from(schedule.startDate),end=Temporal.PlainDate.from(schedule.untilDate??'9999-12-31');
 if(schedule.recurrence==='once'){if(direction>0?start.toString()>=bound:start.toString()<=bound)yield start.toString();return;}
 const frequency=schedule.recurrence,interval=schedule.interval??1;
 const anchor=frequency==='weekly'?start.subtract({days:start.dayOfWeek-1}):start;
 const scale=frequency==='weekly'?7:1,unit=frequency==='monthly'?'months':frequency==='yearly'?'years':'days';
 const limit=Math.floor(distance(anchor,maximum,frequency)/scale/interval);
 let period=Math.max(0,Math.floor(distance(anchor,Temporal.PlainDate.from(bound),frequency)/scale/interval));
 if(direction<0)period=Math.min(period,limit);
 for(;period>=0&&period<=limit;period+=direction){
  let base;try{base=anchor.add({[unit]:period*interval*scale},{overflow:'reject'});}catch{continue;}
  const offsets=frequency==='weekly'?schedule.days.map(day=>(day+6)%7).sort((a,b)=>direction*(a-b)):[0];
  for(const offset of offsets){
   const day=base.add({days:offset}),key=day.toString();
   if(Temporal.PlainDate.compare(day,start)<0||Temporal.PlainDate.compare(day,end)>0)continue;
   if(direction>0?key<bound:key>bound)continue;
   yield key;
  }
  // The next period cannot return to the permitted date range.
  if(direction>0&&Temporal.PlainDate.compare(base,end)>0)break;
 }
}
