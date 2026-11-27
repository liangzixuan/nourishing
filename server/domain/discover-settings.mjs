const ranges=['today','7','14','21','28','56','90','180','365','all','custom'];
export const discoverDefaults=Object.freeze({version:1,reportRange:'7',reportWidget:'Consumed',energyRange:'7',energyShow:'Consumed',weightRange:'28',weightTarget:true,weightZoom:false,newsVisible:true,weightGoalVisible:true,fastingEnabled:true,fastingDiary:true,timerDirection:'up',sleepPrompt:true,sleepPromotion:true,customFrom:null,customTo:null});
export function parseDiscoverSettings(input){
  if(input===undefined)return {...discoverDefaults};
  const fail=()=>{throw Object.assign(Error('Invalid Discover preferences.'),{status:400});};
  if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(key=>!Object.hasOwn(discoverDefaults,key)))fail();
  const value={...discoverDefaults,...input};if(value.version!==1)fail();
  for(const key of ['reportRange','energyRange','weightRange'])if(!ranges.includes(value[key]))fail();
  if(!['Consumed','Remaining','Expenditure','Energy Budget','Macro Targets','Highlighted Nutrients','Nutrition Scores'].includes(value.reportWidget))fail();
  if(!['Consumed','Expenditure','Balance'].includes(value.energyShow))fail();
  for(const [key,defaultValue]of Object.entries(discoverDefaults))if(typeof defaultValue==='boolean'&&typeof value[key]!=='boolean')fail();
  if(!['up','down'].includes(value.timerDirection))fail();
  for(const key of ['customFrom','customTo'])if(value[key]!==null&&(!/^\d{4}-\d{2}-\d{2}$/.test(value[key])||!Number.isFinite(Date.parse(value[key]+'T00:00:00Z'))||new Date(value[key]+'T00:00:00Z').toISOString().slice(0,10)!==value[key]))fail();
  if(value.customFrom&&value.customTo&&(value.customFrom>value.customTo||(Date.parse(value.customTo)-Date.parse(value.customFrom))/86400000>=3660))fail();
  if(['reportRange','energyRange','weightRange'].some(key=>value[key]==='custom')&&(!value.customFrom||!value.customTo))fail();
  return value;
}
