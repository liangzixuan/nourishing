const fail=message=>{throw Object.assign(new Error(message),{status:400});};

export function date(value) { const parsed=typeof value==='string'?new Date(`${value}T12:00:00Z`):null;if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value)||!Number.isFinite(parsed.valueOf())||parsed.toISOString().slice(0,10)!==value) fail('Use a valid YYYY-MM-DD date.'); return value; }

/** Optional recorded-day selection shared by chart calculation owners. */
export function eligibleCalendarDates(range,values){
 if(values===undefined)return null;if(!Array.isArray(values))fail('Eligible dates must be an array.');
 return new Set(values.map(value=>{const day=date(value);if(day<range.from||day>range.to)fail('Eligible dates must be within the selected range.');return day;}));
}

export function parseReportTimeZone(timeZone){
  if(typeof timeZone!=='string'||!timeZone||timeZone!==timeZone.trim()||/^[+-]/.test(timeZone))fail('The nutrition report needs an explicit IANA server time zone.');
  try{new Intl.DateTimeFormat('en',{timeZone});}catch{fail('The nutrition report server time zone is invalid.');}return timeZone;
}
export function captureCalendar(now,timeZone){
  if(!(now instanceof Date)||!Number.isFinite(now.getTime()))fail('The nutrition report needs a valid server clock instant.');
  timeZone=parseReportTimeZone(timeZone);
  const formatter=new Intl.DateTimeFormat('en-CA',{timeZone,year:'numeric',month:'2-digit',day:'2-digit'});
  const parts=Object.fromEntries(formatter.formatToParts(now).map(part=>[part.type,part.value])),today=date(`${parts.year}-${parts.month}-${parts.day}`);
  return {asOf:now.toISOString(),timeZone,today};
}
