import {createCycleView} from './cycle-view.mjs';
import {validateCycleOverlay} from './cycle-overlay.mjs';
/** The cycle view owns eligibility and source-date meaning; charts only project it. */
export function createCycleOverlay(state,range,clock){
 const view=createCycleView(state,range,clock),observations=view.days.filter(row=>row.phase!==null).map(row=>({date:row.date,source:{id:row.sourceId,name:row.phase.source.name},phase:row.phase.value}));
 return validateCycleOverlay({version:1,range:{...view.range},calendar:{...view.calendar},observations},range);
}

/** Preserve the capture calendar while restricting observations to report-eligible dates. */
export function eligibleCycleOverlay(capture,eligible){return {...capture,observations:capture.observations.filter(row=>eligible===null||eligible.has(row.date))};}
/** Report-local source identities retain grouping without exporting stored IDs. */
export function* cycleOverlayPrintRows(capture){const sources=new Map();for(const row of capture.observations){if(!sources.has(row.source.id))sources.set(row.source.id,`source-${sources.size+1}`);yield {...row,source:{id:sources.get(row.source.id),name:row.source.name}};}}
