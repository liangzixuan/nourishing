export function storeChartDefinition(state,chart){
  const index=state.charts.findIndex(row=>row.id===chart.id),previous=state.charts[index],prefs=state.settings.mobileCharts?.custom?.[chart.id];
  const changed=previous?['primary','secondary'].filter(axis=>JSON.stringify(previous[axis])!==JSON.stringify(chart[axis])):[];
  if(index<0)state.charts.push(chart);else state.charts[index]=chart;
  if(prefs)for(const axis of changed)delete prefs[axis+'Unit'];
  return chart;
}
