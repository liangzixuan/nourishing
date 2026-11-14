// Product scope, not runtime configuration or a claim of original-service parity.
export const capabilityStatuses=Object.freeze(['local','optional','partial','independent','unavailable']);
export const capabilities=Object.freeze([
 ['identity','independent'],['diary','local'],['nutrients','local'],['targets','local'],
 ['recipes','local'],['meals','local'],['export','local'],['repeats','local'],
 ['recipeImporter','optional'],['scores','independent'],['macroScheduler','local'],
 ['fasting','local'],['timestamps','local'],['customBiometrics','local'],['customCharts','local'],
 ['reports','local'],['foodSuggestions','local'],['nutrientOracle','local'],['sharing','partial'],
 ['ads','local'],['photoLogging','optional'],['voiceLogging','optional'],['coach','optional'],
 ['integrations','partial'],['barcode','optional'],['reminders','optional'],['database','independent'],
 ['professional','partial'],['enterprise','unavailable'],['mobile','partial'],['offline','local'],['backup','local']
].map(([id,status])=>Object.freeze({id,status})));
const ids=new Set(capabilities.map(row=>row.id));
export function parseCapabilities(value){
 if(!Array.isArray(value)||value.length!==capabilities.length)return null;
 const seen=new Set(),result=[];
 for(const row of value){
  if(!row||typeof row!=='object'||Array.isArray(row)||Object.keys(row).length!==2||!Object.hasOwn(row,'id')||!Object.hasOwn(row,'status')||!ids.has(row.id)||seen.has(row.id)||!capabilityStatuses.includes(row.status))return null;
  seen.add(row.id);result.push({id:row.id,status:row.status});
 }
 return result;
}
