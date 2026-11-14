export const fastingScheduleViewVersion=1;
export const fastingScheduleLateMinutes=15;
export const fastingScheduleRuleCodes=Object.freeze(['local-clock','late-start','active-conflict','manual-end','restore-disabled']);
export const fastingScheduleOutcomes=Object.freeze(['started','started-early','missed','conflict']);
export const fastingRecurrenceIntervalLimits=Object.freeze({once:1,daily:7,weekly:52,monthly:1,yearly:1});
export const fastingRecurrenceFrequencies=Object.freeze(['once','daily','weekly','monthly','yearly']);
export function validFastingRecurrence(value){
 const interval=value.interval===undefined?1:value.interval;
 return (value.custom===undefined||value.custom===true&&['daily','weekly'].includes(value.recurrence))&&fastingRecurrenceFrequencies.includes(value.recurrence)&&Number.isSafeInteger(interval)&&interval>=1&&interval<=fastingRecurrenceIntervalLimits[value.recurrence]&&
 Array.isArray(value.days)&&value.days.every(day=>Number.isInteger(day)&&day>=0&&day<=6)&&new Set(value.days).size===value.days.length&&
 (value.recurrence==='weekly'?value.days.length>0:value.days.length===0)&&
 (value.recurrence!=='once'||interval===1&&value.untilDate===null);
}

// Record-owned recurrence describes a history edit. It does not schedule execution.
// Return null for Does Not Repeat so existing records need no default metadata.
export function parseFastingRepeat(value){
 const fail=()=>{throw Object.assign(Error('Invalid fasting repeat rule.'),{status:400});};
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(key=>!['recurrence','interval','days','untilDate','custom'].includes(key))||!validFastingRecurrence(value))fail();
 if(value.untilDate!==null){
  if(typeof value.untilDate!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value.untilDate))fail();
  const date=new Date(value.untilDate+'T00:00:00Z');if(!Number.isFinite(+date)||date.toISOString().slice(0,10)!==value.untilDate)fail();
 }
 if(value.recurrence==='once')return null;
 return {recurrence:value.recurrence,interval:value.interval??1,days:[...value.days].sort((a,b)=>a-b),untilDate:value.untilDate,...(value.custom?{custom:true}:{})};
}
