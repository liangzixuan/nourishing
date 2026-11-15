import {date} from './calendar.mjs';
import {validCycleValue} from './cycle-values.mjs';
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value),text=value=>typeof value==='string'&&value.length>0;
const fail=()=>{throw Object.assign(Error('The cycle overlay capture is incomplete. Refresh the chart.'),{status:400});};
export function validateCycleOverlay(value,range){
 if(!object(value)||value.version!==1||!object(value.range)||!object(range)||value.range.from!==range.from||value.range.to!==range.to||!object(value.calendar)||!text(value.calendar.timeZone)||!text(value.calendar.asOf)||!Number.isFinite(Date.parse(value.calendar.asOf))||!Array.isArray(value.observations))fail();
 date(range.from);date(range.to);date(value.calendar.today);if(range.from>range.to)fail();
 const seen=new Set();for(const row of value.observations){if(!object(row)||!object(row.source)||!text(row.source.id)||!text(row.source.name)||!validCycleValue('phase',row.phase))fail();date(row.date);const key=JSON.stringify([row.date,row.source.id]);if(row.date<range.from||row.date>range.to||row.date>=value.calendar.today||seen.has(key))fail();seen.add(key);}
 return value;
}
/** Select a chart's exact calendar window from one captured observation set. */
export function projectCycleOverlay(capture,range){
 validateCycleOverlay(capture,capture?.range);date(range.from);date(range.to);if(range.from>range.to||range.from<capture.range.from||range.to>capture.range.to)fail();
 return {...capture,range:{...range},calendar:{...capture.calendar},observations:capture.observations.filter(row=>row.date>=range.from&&row.date<=range.to).map(row=>({...row,source:{...row.source}}))};
}
export const cyclePhasePresentation=Object.freeze({follicular:Object.freeze({label:'Follicular',color:'#c4dff3'}),luteal:Object.freeze({label:'Luteal',color:'#d9c5ed'}),menstruation:Object.freeze({label:'Menstruation',color:'#f0c4d1'}),ovulation:Object.freeze({label:'Ovulation',color:'#f3deaa'}),unknown:Object.freeze({label:'Unknown',color:'#d4dbe2'})});
export function cyclePhaseAppearance(phase){return phase===null?{label:'Not supplied',color:'#edf0f3'}:cyclePhasePresentation[phase];}

/** A specialized chart owns one optional overlay on its exact capture calendar. */
export function validateOptionalCycleOverlay(view){
 if(typeof view.cycleOverlayEnabled!=='boolean'||Object.hasOwn(view,'cycleOverlay')!==view.cycleOverlayEnabled)fail();
 if(view.cycleOverlayEnabled){validateCycleOverlay(view.cycleOverlay,view.range);if(['asOf','timeZone','today'].some(key=>view.cycleOverlay.calendar[key]!==view.calendar[key]))fail();}
 return view.cycleOverlay;
}
