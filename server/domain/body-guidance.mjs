export const BODY_PROJECTION_VERSION=2;
const labels={weight:'weight',bodyFat:'body-fat',height:'height'};
export const bodyGuidance=Object.freeze({...Object.fromEntries(Object.entries(labels).flatMap(([kind,label])=>[
 ['invalidDate.'+kind,`Some selected ${label} records have invalid dates and were ignored.`],
 ['empty.'+kind,`No selected ${label} reading is available through the viewed date.`],
 ['invalid.'+kind,`The latest selected ${label} reading is invalid; an earlier reading was not substituted.`]
])),differentDates:'Weight and body-fat readings were recorded on different dates.'});
export function captureBodyGuidance(code){if(!Object.hasOwn(bodyGuidance,code))throw new TypeError('Unknown body guidance identity.');return {code,text:bodyGuidance[code]};}
export const isBodyGuidance=note=>note!==null&&typeof note==='object'&&!Array.isArray(note)&&Object.keys(note).length===2&&typeof note.code==='string'&&note.code.length>0&&typeof note.text==='string'&&note.text.length>0;
