export const targetSetupGuidance=Object.freeze({
 baseline:'This sets the daily baseline only. Weekday overrides and other nutrient targets remain as entered.',
 maintenance:'Energy estimates describe maintenance, not a weight-loss or weight-gain prescription.',
 conversion:'Macro grams use 4 kcal/g for carbohydrate and protein and 9 kcal/g for fat; grams are rounded to two decimal places.'
});
export const targetSetupNotes=()=>Object.entries(targetSetupGuidance).map(([code,text])=>({code,text}));
export const presentTargetSetupPreview=plan=>({...plan,format:'nourish-target-setup-preview-v2',notes:targetSetupNotes()});
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value),finite=value=>typeof value==='number'&&Number.isFinite(value);
const macros=['carbs','protein','fat'],targets=['calories',...macros];
export const isTargetSetupNote=note=>object(note)&&Object.keys(note).length===2&&typeof note.code==='string'&&note.code.length>0&&typeof note.text==='string'&&note.text.length>0;
export function sameTargetSetupInput(actual,expected){return object(actual)&&object(expected)&&Object.keys(actual).length===Object.keys(expected).length&&Object.entries(expected).every(([key,value])=>key==='percentages'?object(value)&&object(actual[key])&&Object.keys(actual[key]).length===3&&macros.every(id=>actual[key][id]===value[id]):actual[key]===value);}
export function isTargetSetupPreview(value,input){
 if(!object(value)||value.format!=='nourish-target-setup-preview-v2'||!sameTargetSetupInput(value.input,input)||!['manual','adult_eer'].includes(value.input.method)||!object(value.targets)||targets.some(key=>!finite(value.targets[key])||value.targets[key]<0||key==='calories'&&value.targets[key]===0)||!object(value.calculation)||typeof value.calculation.method!=='string'||!object(value.referenceRanges)||macros.some(key=>!Array.isArray(value.referenceRanges[key])||value.referenceRanges[key].length!==2||!value.referenceRanges[key].every(finite)||value.referenceRanges[key][0]>value.referenceRanges[key][1])||!Array.isArray(value.outsideReference)||value.outsideReference.some(key=>!macros.includes(key))||new Set(value.outsideReference).size!==value.outsideReference.length||!Array.isArray(value.notes)||!value.notes.every(isTargetSetupNote)||!object(value.sources)||Object.keys(value.sources).length!==2)return false;
 try{return ['energy','macros'].every(key=>object(value.sources[key])&&typeof value.sources[key].name==='string'&&value.sources[key].name.length>0&&new URL(value.sources[key].url).protocol==='https:');}catch{return false;}
}
export function isTargetSetupAcknowledgement(result,preview){
 const settings=(result?.state??result)?.settings,record=settings?.targetSetup;
 return object(settings)&&object(record)&&record.format==='nourish-target-setup-v1'&&typeof record.appliedAt==='string'&&Number.isFinite(Date.parse(record.appliedAt))&&sameTargetSetupInput(record.input,preview.input)&&targets.every(key=>record.targets?.[key]===preview.targets[key]&&settings.targets?.[key]===preview.targets[key]);
}
