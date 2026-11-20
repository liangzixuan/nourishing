import {digest} from './data-codec.mjs';
import {projectDiaryCalendar} from './domain/diary-calendar.mjs';
const fail=()=>{throw Object.assign(Error('Choose a calendar month.'),{status:400});};
/** The account owns presence and fasting time-zone facts; clients receive one month. */
export function diaryCalendarView(state,input,context){
 if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).length!==1||typeof input.month!=='string'||!/^\d{4}-\d{2}$/.test(input.month))fail();
 return {revision:digest(state),...projectDiaryCalendar(state,input.month,context)};
}
