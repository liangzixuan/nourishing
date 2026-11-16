import {digest} from './data-codec.mjs';
import {date,captureCalendar} from './domain/calendar.mjs';
import {diaryCalendarMarkers} from './domain/diary-calendar.mjs';
const fail=()=>{throw Object.assign(Error('Choose a calendar month.'),{status:400});};
/** The account owns presence and fasting time-zone facts; clients receive one month. */
export function diaryCalendarView(state,input,context){
 if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).length!==1||typeof input.month!=='string'||!/^\d{4}-\d{2}$/.test(input.month))fail();
 const {month}=input,from=date(month+'-01'),end=new Date(from+'T12:00:00Z');end.setUTCMonth(end.getUTCMonth()+1);end.setUTCDate(0);const to=date(end.toISOString().slice(0,10));
 const calendar=captureCalendar(context.now??new Date(context.asOf),context.timeZone);
 return {revision:digest(state),month,markers:diaryCalendarMarkers(state,{from,to,now:new Date(calendar.asOf),timeZone:calendar.timeZone}),completedDays:(state.settings.completedDays??[]).filter(day=>day>=from&&day<=to),calendar};
}
