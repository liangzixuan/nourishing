export function sameDiarySnapshot(previous,next){
 return JSON.stringify(previous)===JSON.stringify(next);
}
export function presentFastingTiming(fasting,ageMs){
 if(fasting?.status!=='active')return fasting;
 const elapsedSeconds=fasting.elapsedSeconds+Math.max(0,ageMs)/1000,goalSeconds=fasting.active.goalHours===null?null:fasting.active.goalHours*3600;
 return {...fasting,elapsedSeconds,remainingSeconds:goalSeconds===null?null:Math.max(0,goalSeconds-elapsedSeconds),progressPercent:goalSeconds===null?null:elapsedSeconds/goalSeconds*100};
}
