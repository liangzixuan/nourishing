import {metricOptions,metricInfo} from './domain/chart-metrics.mjs';
import {biometricCatalog,biometricCatalogDefinition,createBiometricLibrary} from './domain/biometric-library.mjs';
import {lipidDefinitions,lipidUnits} from './domain/lipid-units.mjs';

// The saved mobile chart picker includes supported catalog metrics before any logging.
// Labels may change; the canonical metric identity must not.
export function chartMetricOptions(state,preferences){
 const options=metricOptions(state),seen=new Set(options.map(row=>JSON.stringify(row.metric)));
 const add=metric=>{const key=JSON.stringify(metric);if(!seen.has(key)){seen.add(key);options.push({metric,...metricInfo(metric)});}};
 for(const row of createBiometricLibrary(state).metrics){
  const type=row.selection.kind==='catalog'?biometricCatalogDefinition(row.selection.id).type:row.selection.type;
  for(const unit of row.units)add({kind:'biometric',type,unit});
 }
 for(const {type} of lipidDefinitions)for(const unit of lipidUnits)add({kind:'biometric',type,unit});
 for(const setting of Object.values(preferences.charts))for(const metric of [setting.primary,setting.secondary])if(metric)add(metric);
 for(const chart of state.charts??[])for(const metric of [chart.primary,chart.secondary])if(metric)add(metric);
 return options.map(row=>({...row,name:row.metric.kind==='biometric'?(biometricCatalog.find(definition=>definition.type===row.metric.type)?.label??row.name):row.name}));
}
