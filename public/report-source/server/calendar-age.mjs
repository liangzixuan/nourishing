import {date as calendarDate} from './calendar.mjs';

/** Completed intervals; a missing anniversary day completes on the next day. */
export function calendarAge(birthDate,date){
  calendarDate(birthDate);calendarDate(date);
  if(birthDate<'0001-01-01')throw Object.assign(new Error('Choose a birth date in year 1 or later.'),{status:400});
  if(date<birthDate)return null;
  const birthYear=Number(birthDate.slice(0,4)),year=Number(date.slice(0,4));
  const years=year-birthYear-(date.slice(5)<birthDate.slice(5)?1:0);
  const months=(year-birthYear)*12+Number(date.slice(5,7))-Number(birthDate.slice(5,7))-(date.slice(8)<birthDate.slice(8)?1:0);
  return {years,months};
}
