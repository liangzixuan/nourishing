import {Temporal} from '@js-temporal/polyfill';
import {projectCycleOverlay} from './cycle-overlay.mjs';
import {eligibleCycleOverlay} from './cycle-overlay-capture.mjs';

/** Use the same axis as the chart: dated values, or CGM instants in its zone. */
export function mobileCycleOverlay(capture,range,eligibleDates,window){
 const overlay=eligibleCycleOverlay(projectCycleOverlay(capture,range),new Set(eligibleDates));
 return {...overlay,observations:overlay.observations.map(row=>{
  const day=Temporal.PlainDate.from(row.date);
  const midnight=date=>window?date.toZonedDateTime({timeZone:window.timeZone,plainTime:'00:00'}).epochMilliseconds:Date.parse(date.toString()+'T00:00:00Z');
  return {...row,from:midnight(day),to:midnight(day.add({days:1}))};
 })};
}
