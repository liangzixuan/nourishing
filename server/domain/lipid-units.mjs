import Big from './energy-decimal.mjs';

export const lipidUnits=Object.freeze(['mmol/L','mg/dL']);
export const lipidDefinitions=Object.freeze([
 ['total cholesterol','Total Cholesterol','0.02586'],['hdl cholesterol','HDL Cholesterol','0.02586'],
 ['ldl cholesterol','LDL Cholesterol','0.02586'],['triglycerides','Triglycerides','0.01129'],
].map(([type,name,mmolLPerMgDl])=>Object.freeze({type,name,mmolLPerMgDl})));
// CDC NHANES conversion conventions.
export const lipidConversionSources=Object.freeze([
 'https://wwwn.cdc.gov/Nchs/Data/Nhanes/Public/2001/DataFiles/L13_2_B.htm',
 'https://wwwn.cdc.gov/Nchs/Data/Nhanes/Public/2021/DataFiles/TRIGLY_L.htm',
]);
const Decimal=Big();Decimal.DP=40;
export function convertLipidValue(type,value,from,to){
 const definition=lipidDefinitions.find(row=>row.type===type);
 if(!definition||!lipidUnits.includes(from)||!lipidUnits.includes(to)||value!==null&&(typeof value!=='number'||!Number.isFinite(value)||value<0))throw Object.assign(Error('Choose a supported lipid and a nonnegative value with mmol/L or mg/dL units.'),{status:400});
 if(value===null||from===to)return value;
 const number=new Decimal(value),converted=Number((from==='mg/dL'?number.times(definition.mmolLPerMgDl):number.div(definition.mmolLPerMgDl)).toString());
 if(!Number.isFinite(converted))throw Object.assign(Error('The converted lipid value is outside the supported range.'),{status:400});
 return converted;
}
