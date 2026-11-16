import {Temporal} from './vendor/temporal.js';
import {scheduledWallInstant} from './fasting-time.mjs';

export function dateTimeParts(value){const wall=Temporal.PlainDateTime.from(value);return {date:wall.toPlainDate().toString(),hour:wall.hour%12||12,minute:wall.minute,period:wall.hour>=12?1:0};}
export function pickerValue(parts,original,timeZone){
 if(!Number.isInteger(parts.hour)||parts.hour<1||parts.hour>12||!Number.isInteger(parts.minute)||parts.minute<0||parts.minute>59||![0,1].includes(parts.period))throw RangeError('Invalid date/time selection.');
 const before=dateTimeParts(original),unchanged=Object.keys(before).every(key=>before[key]===parts[key]);
 const value=unchanged?original:Temporal.PlainDate.from(parts.date).toPlainDateTime({hour:parts.hour%12+parts.period*12,minute:parts.minute}).toString({smallestUnit:'minute'});
 if(!scheduledWallInstant(value,timeZone))throw Object.assign(Error('This clock time is skipped by daylight saving.'),{code:'clock-gap'});
 return value;
}
export function dateWindow(selected){
 const date=Temporal.PlainDate.from(selected),values=[];
 for(let offset=-30;offset<=30;offset++){const day=date.add({days:offset});if(day.year>=1&&day.year<=9999)values.push(day.toString());}
 return values;
}
export function compactWallTime(value,language='en',today=Temporal.Now.plainDateISO().toString()){
 const wall=Temporal.PlainDateTime.from(value),date=wall.toLocaleString(language,{month:'short',day:'numeric',...(wall.year!==Temporal.PlainDate.from(today).year?{year:'numeric'}:{})}),time=wall.toLocaleString(language,{hour:'numeric',minute:'2-digit'}).replace(/\s+(AM|PM)$/i,'$1').toLowerCase();
 return date+' @ '+time;
}
