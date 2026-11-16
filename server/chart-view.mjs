import {exportReport} from './domain/report-exports.mjs';
const fail=message=>{throw Object.assign(Error(message),{code:400,publicMessage:message});};
export function csvReport(state,input){
 if(!input||Object.keys(input).some(k=>!['kind','from','to','includeGroups','energyUnit'].includes(k)))fail('Choose a report and date range.');
 return exportReport(state,{...input,energyUnit:input.energyUnit??state.settings.energyUnit??'kcal'});
}
