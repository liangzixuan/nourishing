export const expenditureComponents=Object.freeze([
 ['resting','BMR'],['baseline','Adjusted Baseline Activity'],['exercise','Exercise'],['tracker','Tracker Activity'],['thermicEffect','Thermic Effect of Food'],
]);
const known=value=>typeof value==='number'&&Number.isFinite(value)&&value>=0;
const close=(a,b)=>Math.abs(a-b)<=Math.max(0.0001,Math.abs(b)*1e-10);
const invalid=()=>{throw Error('The captured expenditure breakdown is incomplete. Generate a fresh report.');};

/** All slices use precisely the dates with a known daily expenditure. */
export function captureExpenditureBreakdown(days){
 const measured=days.filter(day=>known(day.energy.expenditure));
 const sums=Object.fromEntries(expenditureComponents.map(([id])=>[id,0]));let total=0;
 for(const {energy}of measured){
  const values={resting:energy.components.resting,baseline:energy.components.adjustedBaseline,
   exercise:energy.activityMode==='manual'?energy.exercise:0,
   tracker:energy.activityMode==='health-connect'?energy.device?.value:0,thermicEffect:energy.components.thermicEffect};
  if(!['manual','health-connect'].includes(energy.activityMode)||Object.values(values).some(value=>!known(value))||!close(Object.values(values).reduce((sum,value)=>sum+value,0),energy.expenditure))invalid();
  for(const [id,value]of Object.entries(values))sums[id]+=value;total+=energy.expenditure;
 }
 return {version:1,unit:'kcal',eligibleDays:days.length,knownDays:measured.length,mean:measured.length?total/measured.length:null,
  components:expenditureComponents.map(([id,name])=>({id,name,mean:measured.length?sums[id]/measured.length:null,percent:total>0?sums[id]/total*100:null}))};
}

export function validateExpenditureBreakdown(value,summary){
 if(!value||value.version!==1||value.unit!=='kcal'||value.eligibleDays!==summary.eligibleDays||value.knownDays!==summary.knownDays||!Array.isArray(value.components)||value.components.length!==expenditureComponents.length)invalid();
 if(value.knownDays===0){if(value.mean!==null||summary.mean!==null)invalid();}
 else if(!known(value.mean)||!known(summary.mean)||!close(value.mean,summary.mean))invalid();
 let total=0;
 for(const [index,[id,name]]of expenditureComponents.entries()){
  const row=value.components[index];if(!row||row.id!==id||row.name!==name)invalid();
  if(value.knownDays===0){if(row.mean!==null||row.percent!==null)invalid();continue;}
  if(!known(row.mean))invalid();total+=row.mean;
  if(value.mean===0){if(row.percent!==null)invalid();}
  else if(!known(row.percent)||!close(row.percent,row.mean/value.mean*100))invalid();
 }
 if(value.knownDays&&!close(total,value.mean))invalid();return value;
}
