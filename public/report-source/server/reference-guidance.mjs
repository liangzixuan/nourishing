/** Presentation identities for captured population-reference explanations. */
export const REFERENCE_PROJECTION_VERSION=3;
export const referenceGuidance=Object.freeze({
 notDetermined:'No RDA or AI is determined for this source row; the value remains unknown.',
 population:'References describe normal, apparently healthy populations. RDA and AI are distinct intake references, not maximum thresholds.',
 reviewedStage:'The reviewed life stage applies across viewed dates until changed.',
 adjustments:'Special dietary and clinical adjustments are not applied.',
 calendarAge:'Age uses completed calendar intervals. A missing anniversary day completes on the following day.',
 maternalAge:'Pregnancy and lactation references cover ages 14 through 50; the source row labelled 18 or younger applies from age 14.',
 beforeBirth:'The viewed date is before birth; reference values are unknown.',
 unsupportedAge:'The selected life stage is outside the supported source age bands; reference values are unknown.'
});
export function captureReferenceGuidance(code){if(!Object.hasOwn(referenceGuidance,code))throw new TypeError('Unknown reference guidance identity.');return {code,text:referenceGuidance[code]};}
export function isReferenceGuidance(note){return note!==null&&typeof note==='object'&&!Array.isArray(note)&&Object.keys(note).length===2&&typeof note.code==='string'&&note.code.length>0&&typeof note.text==='string'&&note.text.length>0;}
