/** Presentation projection of the canonical dashboard capture; no extra clock or calculations. */
export function projectDashboardHealthCards(capture){
 const cards=capture.cards,result={};
 if(cards.glucose){
  const view=cards.glucose;
  result.glucose={status:view.status,range:{...view.range},unit:view.series.glucose.unit,stats:structuredClone(view.stats),readings:view.readings.map(row=>({id:row.id,date:row.date,time:row.time,type:row.type,value:row.value,unit:row.unit,displayValue:row.displayValue,position:row.position?{...row.position}:null,eligible:row.eligible,copied:row.copied,duplicateTimestamp:row.duplicateTimestamp,source:structuredClone(row.source)})),excludedCount:view.excluded.filter(row=>row.kind==='glucose').length};
 }
 if(cards.cycle)result.cycle={status:cards.cycle.status,range:{...cards.cycle.range},today:cards.cycle.calendar.today,sources:structuredClone(cards.cycle.dashboard)};
 return result;
}
