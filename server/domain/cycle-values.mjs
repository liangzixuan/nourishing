export const cyclePhases=Object.freeze(['follicular','luteal','menstruation','ovulation','unknown']);
export const cycleMetrics=Object.freeze(['cycleDay','phase','temperatureVariation']);
export function validCycleValue(metric,value){
 if(!cycleMetrics.includes(metric))return false;
 if(value===null)return true;
 if(metric==='cycleDay')return Number.isSafeInteger(value)&&value>0;
 if(metric==='phase')return cyclePhases.includes(value);
 return typeof value==='number'&&Number.isFinite(value);
}


export function parseCycleDisplay(value){
 if(value===undefined||value===null)return null;
 if(typeof value!=='object'||Array.isArray(value)||Object.keys(value).length!==2||value.version!==1||typeof value.showDiary!=='boolean')throw Object.assign(Error('Choose version 1 and a boolean diary cycle visibility setting.'),{status:400});
 return {version:1,showDiary:value.showDiary};
}
/** Omission is a projected default, never a saved user preference. */
export function resolveCycleDisplay(value){return parseCycleDisplay(value)??{version:1,showDiary:true};}
