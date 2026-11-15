export const WEIGHT_PROJECTION_VERSION=2;
export const weightGuidance=Object.freeze({
 'plan.linear':'The forecast is a linear plan at the chosen rate, not a prediction of measured weight.',
 'plan.approximation':'The energy adjustment uses the historical 3,500 kcal per pound approximation.',
 'plan.active':'The chosen rate remains active until you review and change the settings; the forecast date does not switch to maintenance.',
 'plan.calendar':'The linear arrival falls outside the supported 0000-9999 calendar; no forecast date is available.',
 'progress.required':'A valid selected weight reading is required to calculate progress.',
 'progress.invalid':'The selected weight cannot be represented as a positive measurement.',
 'progress.before':'The selected reading is before the plan start; progress calculations are unavailable.',
 'progress.linear':'The updated forecast is linear from the selected reading at the chosen rate; it is not a prediction of measured weight.',
 'progress.range':'The selected reading is outside the supported planning range; no updated forecast is available.',
 'progress.calendar':'The updated linear arrival falls outside the supported 0000-9999 calendar; no forecast date is available.'
});
export function captureWeightGuidance(code){if(!Object.hasOwn(weightGuidance,code))throw new TypeError('Unknown weight guidance identity.');return {code,text:weightGuidance[code]};}
export const isWeightGuidance=note=>note!==null&&typeof note==='object'&&!Array.isArray(note)&&Object.keys(note).length===2&&typeof note.code==='string'&&note.code.length>0&&typeof note.text==='string'&&note.text.length>0;
