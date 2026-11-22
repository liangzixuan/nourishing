// The response stays immutable. Only the captured fasting clock is time-dependent.
export function sameDiarySnapshot(previous,next){
 const comparable=value=>{
  if(!value?.presentation?.fasting)return value;
  const {asOf,...fasting}=value.presentation.fasting;
  return {...value,presentation:{...value.presentation,fasting}};
 };
 return JSON.stringify(comparable(previous))===JSON.stringify(comparable(next));
}
export function presentFastingTiming(fasting,ageMs){
 if(fasting?.status!=='active')return fasting;
 const elapsedSeconds=fasting.elapsedSeconds+Math.max(0,ageMs)/1000,goalSeconds=fasting.active.goalHours===null?null:fasting.active.goalHours*3600;
 return {...fasting,elapsedSeconds,remainingSeconds:goalSeconds===null?null:Math.max(0,goalSeconds-elapsedSeconds),progressPercent:goalSeconds===null?null:elapsedSeconds/goalSeconds*100};
}
export function presentDiarySnapshot(value,ageMs){
 const fasting=value?.presentation?.fasting;
 return fasting?.status==='active'?{...value,presentation:{...value.presentation,fasting:presentFastingTiming(fasting,ageMs)}}:value;
}
