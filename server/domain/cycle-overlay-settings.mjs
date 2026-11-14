export const cycleChartIds=Object.freeze(['trends','dashboardEnergy','dashboardWeight','bloodPressure','glucoseKetones','glucoseTimeline','glucoseComparison','dashboardGlucose','targetsWeightGoal','dashboardWeightGoal']);
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const fail=()=>{throw Object.assign(Error('Choose boolean cycle overlay settings for supported charts only.'),{status:400});};
function parseChoices(value){if(!object(value)||Object.keys(value).some(key=>!cycleChartIds.includes(key)||typeof value[key]!=='boolean'))fail();return {...value};}
export function parseCycleChartOverlays(value){
 if(value===undefined||value===null)return null;
 if(!object(value)||Object.keys(value).length!==2||value.version!==1||!Object.hasOwn(value,'charts'))fail();
 return {version:1,charts:parseChoices(value.charts)};
}
export function resolveCycleChartOverlays(value){return {version:1,charts:{...Object.fromEntries(cycleChartIds.map(id=>[id,false])),...parseCycleChartOverlays(value)?.charts}};}
/** Explicit changes preserve untouched choices and do not materialize defaults. */
export function updateCycleChartOverlays(value,changes){return {version:1,charts:{...parseCycleChartOverlays(value)?.charts,...parseChoices(changes)}};}
