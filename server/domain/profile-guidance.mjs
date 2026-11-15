export const PRINT_PROFILE_VERSION=2;
export const profileGuidanceTemplates=Object.freeze({
 'notice':'Current measurements use the latest selected readings through the current date, regardless of the diary report range or filters. Missing or invalid readings remain unknown. Stored settings below can include starter values and do not replace measurements.',
 'measurement.recorded':'Recorded {{date}}{{time}}; selected {{kind}} source.',
 'measurement.unselected':'No measurement source selected. Choose or review the source under Recorded body composition.',
 'measurement.empty':'No reading through the current date. Choose or review the source under Recorded body composition.',
 'measurement.invalid':'Latest selected reading is invalid. Choose or review the source under Recorded body composition.',
 'age.birth':'Completed years from the saved birth date on the current date.',
 'age.manual':'Manually entered age from the resting-energy settings.',
 'age.unconfigured':'No reviewed age configured in resting-energy settings.',
 'sex':'Sex used by the configured resting-energy equation; not inferred from other profile data.',
 'bmi.missing':'Both selected height and weight readings are required.',
 'bmi.calculated':'Calculated from selected weight and height: kg / (metres × metres).{{differentDates}}',
 'resting.unconfigured':'Resting energy is not configured.',
 'resting.custom':'User-entered resting energy; not a measured BMR or a maintenance-energy target.',
 'resting.equation':'Mifflin-St Jeor resting estimate; {{sex}} equation, age {{age}}, {{weight}} kg ({{weightSource}}), {{height}} cm ({{heightSource}}).{{unavailable}}',
 'fragment.time':' at {{time}}','fragment.weight':'weight','fragment.height':'height',
 'fragment.unknown':'unknown','fragment.male':'male','fragment.female':'female',
 'fragment.saved':'saved equation input','fragment.recordedWeight':'selected recorded weight','fragment.recordedHeight':'selected recorded height',
 'fragment.differentDates':' The readings have different dates.',
 'fragment.unavailable':' Required inputs are unavailable or outside the supported adult calculation.'
});
const empty=()=>true,exact=(value,keys)=>value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).length===keys.length&&keys.every(key=>Object.hasOwn(value,key)),nullableNumber=value=>value===null||Number.isFinite(value);
const fields=Object.freeze({notice:['notice'],age:['age.birth','age.manual','age.unconfigured'],sex:['sex'],height:['measurement.recorded','measurement.unselected','measurement.empty','measurement.invalid'],weight:['measurement.recorded','measurement.unselected','measurement.empty','measurement.invalid'],bmi:['bmi.missing','bmi.calculated'],resting:['resting.unconfigured','resting.custom','resting.equation']});
const schemas=Object.freeze({
 notice:[[],empty],'measurement.unselected':[[],empty],'measurement.empty':[[],empty],'measurement.invalid':[[],empty],
 'age.birth':[[],empty],'age.manual':[[],empty],'age.unconfigured':[[],empty],sex:[[],empty],'bmi.missing':[[],empty],
 'resting.unconfigured':[[],empty],'resting.custom':[[],empty],
 'measurement.recorded':[['kind','date','time'],v=>['height','weight'].includes(v.kind)&&typeof v.date==='string'&&v.date.length>0&&(v.time===null||typeof v.time==='string'&&v.time.length>0)],
 'bmi.calculated':[['differentDates'],v=>typeof v.differentDates==='boolean'],
 'resting.equation':[['sex','age','weight','height','weightSource','heightSource','unavailable'],v=>['male','female'].includes(v.sex)&&[v.age,v.weight,v.height].every(nullableNumber)&&['recorded','saved'].includes(v.weightSource)&&['recorded','saved'].includes(v.heightSource)&&typeof v.unavailable==='boolean']
});
export function isProfileGuidance(note,field){
 if(!exact(note,['code','text','values'])||typeof note.code!=='string'||!note.code||typeof note.text!=='string'||!note.text||!note.values||typeof note.values!=='object'||Array.isArray(note.values))return false;
 if(!Object.hasOwn(schemas,note.code))return Object.values(note.values).every(value=>value===null||typeof value==='string'||typeof value==='boolean'||Number.isFinite(value));
 const [keys,valid]=schemas[note.code];if(!exact(note.values,keys)||!valid(note.values))return false;
 if(field!==undefined&&(!Object.hasOwn(fields,field)||!fields[field].includes(note.code)||note.code==='measurement.recorded'&&note.values.kind!==field))return false;
 return true;
}
/** One interpretation of captured parameters serves canonical text and translated presentation. */
export function formatProfileGuidance(note,message){
 if(!isProfileGuidance(note))throw new TypeError('Invalid captured profile guidance.');
 if(!Object.hasOwn(schemas,note.code))return note.text;
 const v=note.values;
 if(note.code==='measurement.recorded')return message(note.code,{date:v.date,time:v.time===null?'':message('fragment.time',{time:v.time}),kind:message('fragment.'+v.kind)});
 if(note.code==='bmi.calculated')return message(note.code,{differentDates:v.differentDates?message('fragment.differentDates'):''});
 if(note.code==='resting.equation')return message(note.code,{sex:message('fragment.'+v.sex),age:v.age??message('fragment.unknown'),weight:v.weight??message('fragment.unknown'),height:v.height??message('fragment.unknown'),weightSource:message(v.weightSource==='recorded'?'fragment.recordedWeight':'fragment.saved'),heightSource:message(v.heightSource==='recorded'?'fragment.recordedHeight':'fragment.saved'),unavailable:v.unavailable?message('fragment.unavailable'):''});
 return message(note.code);
}
export function captureProfileGuidance(code,values={}){
 if(!Object.hasOwn(schemas,code))throw new TypeError('Unknown profile guidance identity.');
 const note={code,text:'pending',values:{...values}};
 note.text=formatProfileGuidance(note,(key,args={})=>profileGuidanceTemplates[key].replace(/\{\{(\w+)\}\}/g,(_,name)=>String(args[name])));
 return note;
}
