import {createMobileChartView} from './domain/mobile-chart-view.mjs';
import {parseCycleRecordValues} from './domain/cycle-record-parser.mjs';
import {applyChartPreference} from './domain/chart-display-command.mjs';
import {chartMetricOptions} from './chart-options.mjs';
import {mobileChartUnitChoices} from './domain/mobile-chart-metrics.mjs';
import {chartDisplayUnits} from './domain/chart-display-units.mjs';

/** Same producer and command rules as the server, over the account's local snapshot. */
export async function projectLocalChart(state,action,view,id){
 const next=structuredClone(state);applyChartPreference(next,action);
 const identities=new Map();
 for(const row of next.cycleRecords??[]){const key=JSON.stringify([row.source?.id,row.metric,row.source?.recordId]);if(!identities.has(key)){const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(key));identities.set(key,'cycle-'+Array.from(new Uint8Array(hash),byte=>byte.toString(16).padStart(2,'0')).join(''));}}
 next.cycleRecords=parseCycleRecordValues(next.cycleRecords,(...parts)=>identities.get(JSON.stringify(parts)));
 const result=createMobileChartView(next,{to:view.to,card:id},{now:new Date(view.calendar.asOf),timeZone:view.calendar.timeZone});
 if(!Object.hasOwn(state,'cycleRecords')){
  // Offline snapshots omit the health records. Reuse the server's capture only
  // for dates it examined, retaining the boundaries and original source IDs.
  result.hasRecordedPhases=view.hasRecordedPhases;
  const previous=view.cards.find(row=>row.id===id);
  const source=view.cycleSource?.id===id?view.cycleSource:previous?.cycleOverlay?{
   id,dates:previous.cycleCoveredDates??previous.dates,observations:previous.cycleOverlay.observations
  }:null;
  if(source)result.cycleSource=source;
  for(const card of result.cards.filter(row=>row.cycleOverlayEnabled)){
   const dates=new Set(card.dates.filter(day=>day<view.calendar.today));
   const covered=new Set(source?.dates);
   card.cycleOverlay.observations=(source?.observations??[]).filter(row=>dates.has(row.date));
   if(view.hasRecordedPhases!==false&&[...dates].some(day=>!covered.has(day))){
    card.cycleCoveredDates=[...dates].filter(day=>covered.has(day));
   }
  }
 }
 return {...result,localChartState:{mobileCharts:next.settings.mobileCharts,charts:next.charts},revision:view.revision,options:chartMetricOptions(next,result.preferences),saved:next.charts,cards:result.cards.map(card=>({...card,unitChoices:Object.fromEntries(['primary','secondary'].map(axis=>[axis,card.kind==='custom'?(card.definition[axis]?chartDisplayUnits(card.definition[axis]):[]):mobileChartUnitChoices(next,card.id,axis,card.settings)]))}))};
}
