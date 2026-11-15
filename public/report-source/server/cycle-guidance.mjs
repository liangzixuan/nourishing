/** Explanatory identities; no observation values or review-token inputs are changed. */
export const CYCLE_CAPTURE_VERSION=2;
export const cycleGuidance=Object.freeze({
  "rule.dates": "Cycle day, phase and temperature variation retain separate source dates. Null means the source supplied no value; unknown is an explicit phase value.",
  "rule.past": "Past diary and calendar dates show their recorded observations only. Today and future dates have no diary phase display, and gaps are not filled.",
  "rule.latest": "Dashboard values use the latest eligible observation for each source and metric, independent of the report range. A newer unknown value remains unknown.",
  "rule.temperature": "Temperature variation is a Celsius difference. It does not determine a cycle phase, ovulation or fertility.",
  "rule.source": "Source labels describe the imported file; they do not establish a live or verified vendor connection.",
  "warning.exchange": "This is a Nourish exchange file. The source name is supplied by the file and does not verify an Oura connection.",
  "warning.temperature": "Temperature variation is a difference in degrees Celsius, not absolute body temperature. No cycle phase or day is inferred.",
  "warning.missing": "Missing observations do not remove existing records. Older exports do not replace newer imported observations.",
  "warning.clinical": "Cycle phase predictions are not suitable for contraception or medical decisions."
});
export function captureCycleGuidance(code){if(!Object.hasOwn(cycleGuidance,code))throw new TypeError('Unknown cycle guidance identity.');return {code,text:cycleGuidance[code]};}
export function isCycleGuidance(note,scope){return note!==null&&typeof note==='object'&&!Array.isArray(note)&&Object.keys(note).length===2&&typeof note.code==='string'&&note.code.length>0&&typeof note.text==='string'&&note.text.length>0&&(!Object.hasOwn(cycleGuidance,note.code)||note.code.startsWith(scope+'.'));}
