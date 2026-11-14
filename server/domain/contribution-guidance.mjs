// Captured contribution notes own their identities and wording at the projection boundary.
export const contributionGuidance=Object.freeze({
 'day-scope':'Contributions cover the full diary day. Recipe and meal values include their ingredients.',
 'selection-scope':'Contributions cover {count} selected food entries. Daily targets still use the full day.',
 'display-precision':'Food contribution values use the diary’s display precision; rounded rows may not sum to the unrounded target total.',
 'selection-exclusions':'Water logs and unselected foods are excluded. Unknown measurements remain unknown.',
 'day-exclusions':'Unknown measurements remain unknown. Water logs are grouped as one contribution.'
});
export function captureContributionNotes(count){
 if(count!==null&&(!Number.isSafeInteger(count)||count<0))throw new TypeError('A selected contribution count must be a nonnegative integer.');
 const selected=count!==null;
 return [selected?'selection-scope':'day-scope','display-precision',selected?'selection-exclusions':'day-exclusions'].map(code=>code==='selection-scope'?{code,text:contributionGuidance[code].replace('{count}',String(count)),count}:{code,text:contributionGuidance[code]});
}
export function isContributionNote(note){
 if(note===null||typeof note!=='object'||Array.isArray(note)||!Object.hasOwn(note,'code')||!Object.hasOwn(note,'text')||typeof note.code!=='string'||!note.code.length||typeof note.text!=='string'||!note.text.length)return false;
 return note.code==='selection-scope'?Object.keys(note).length===3&&Object.hasOwn(note,'count')&&Number.isSafeInteger(note.count)&&note.count>=0:Object.keys(note).length===2;
}
