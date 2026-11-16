import {formatMessage} from './message-format.js';
/** Sleep entry uses a duration; stored measurements keep the existing sleep/h identity. */
export const usesSleepDuration=(metric,custom=false)=>!custom&&metric?.selection.kind==='catalog'&&metric.selection.id==='sleep';

export function sleepDurationHours(hours,minutes,language='en'){
 const message=(key,values)=>formatMessage(language,'measurementLog.'+key,values);
 const read=(value,label)=>{
  if(typeof value!=='string'||!/^\d*$/.test(value.trim()))throw Error(message('whole',{label}));
  const number=Number(value.trim());
  if(!Number.isSafeInteger(number)||number<0)throw Error(message('nonnegativeWhole',{label}));
  return number;
 };
 const h=read(hours,message('hours')),m=read(minutes,message('minutes'));
 if(m>59)throw Error(message('minutesRange'));
 const value=(h*60+m)/60;
 if(value<=0)throw Error(message('sleepPositive'));
 if(value>1000000)throw Error(message('sleepLimit'));
 return value;
}
