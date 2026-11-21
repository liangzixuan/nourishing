/** Captured timing shared by dashboard cards and Android home-screen widgets. */
export function captureFastingTiming(state,asOf){
  const fast=(state.fasts??[]).find(row=>!row.end);
  if(!fast){
    const cutoff=Date.parse(asOf);
    const lastFastEnd=(state.fasts??[]).reduce((last,row)=>{
      const end=Date.parse(row.end);return end<=cutoff&&(last===null||end>last)?end:last;
    },null);
    return {status:'none',active:null,elapsedSeconds:null,remainingSeconds:null,progressPercent:null,...(lastFastEnd===null?{}:{lastFastEnd})};
  }
  const start=Date.parse(fast.start),goalHours=fast.goalHours;
  if(typeof fast.start!=='string'||!Number.isFinite(start)||(goalHours!==null&&(!Number.isFinite(goalHours)||goalHours<=0)))throw Object.assign(Error('The active fast needs a valid recorded start and goal.'),{status:400});
  const label=fast.label||fast.scheduled?.label;
  const active={start:fast.start,goalHours,...(label?{label}:{})},elapsedSeconds=(Date.parse(asOf)-start)/1000;
  if(elapsedSeconds<0)return {status:'future-start',active,elapsedSeconds:null,remainingSeconds:null,progressPercent:null};
  return {status:'active',active,elapsedSeconds,remainingSeconds:goalHours===null?null:Math.max(0,goalHours*3600-elapsedSeconds),progressPercent:goalHours===null?null:elapsedSeconds/(goalHours*3600)*100};
}
