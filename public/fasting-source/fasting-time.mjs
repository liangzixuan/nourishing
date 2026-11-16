import {Temporal} from './vendor/temporal.js';

// Recurring starts skip clock-forward gaps and use the first clock-back occurrence.
export function scheduledWallInstant(value,timeZone){
 const wall=Temporal.PlainDateTime.from(value),zoned=wall.toZonedDateTime(timeZone,{disambiguation:'earlier'});
 return zoned.toPlainDateTime().equals(wall)?zoned.toInstant():null;
}
export function scheduleGoalEnd(start,goalHours,timeZone){
 const instant=scheduledWallInstant(start,timeZone);if(!instant)return null;
 return instant.add({nanoseconds:Math.round(goalHours*3_600_000_000_000)}).toZonedDateTimeISO(timeZone).toPlainDateTime().toString();
}
export function scheduleGoalHours(start,end,timeZone){
 const from=scheduledWallInstant(start,timeZone),to=scheduledWallInstant(end,timeZone);
 if(!from||!to)throw Object.assign(Error('This clock time is skipped by daylight saving. Choose another time.'),{code:'clock-gap'});
 return Number(to.epochNanoseconds-from.epochNanoseconds)/3_600_000_000_000;
}
export function nextScheduleDraft(timeZone){return Temporal.Now.zonedDateTimeISO(timeZone).add({minutes:2}).toPlainDateTime().toString({smallestUnit:'minute'});}
export function scheduleWeekday(start){return Temporal.PlainDateTime.from(start).dayOfWeek%7;}
