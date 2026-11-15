import {diaryTableNutrients,projectDiaryTarget} from './diary-display.mjs';
import {netCarbohydrateDefinition,parseCarbohydrateDefinition,carbohydrateDescription} from './carbohydrate-policy.mjs';
const nutrients=new Map(diaryTableNutrients.map(row=>[row.id,row]));
const fail=()=>{throw Object.assign(Error('Choose the macro summary or a known nutrient for the printed diary column.'),{status:400});};
export function parsePrintDiaryColumn(value){
 if(value===undefined)return {mode:'macros'};
 if(!value||typeof value!=='object'||Array.isArray(value))fail();
 if(value.mode==='macros'&&Object.keys(value).length===1)return {mode:'macros'};
 if(value.mode!=='nutrient'||Object.keys(value).length!==2||!nutrients.has(value.id))fail();
 return {mode:'nutrient',id:value.id};
}
export function capturePrintDiaryColumn(value,settings){
 const choice=parsePrintDiaryColumn(value);return {version:1,...choice,...(choice.mode==='nutrient'?{...nutrients.get(choice.id),...(choice.id==='netCarbohydrate'?{definition:netCarbohydrateDefinition(settings)}:{})}:{})};
}
/** The existing diary target projection owns partial, zero and inactive values. */
export function projectPrintDiaryValue(facts,id){
 const row=projectDiaryTarget({id,totals:facts.nutrients,targets:{},coverage:facts.coverage,complete:false,carbohydrate:facts.carbohydrate,carbohydrates:facts.carbohydrates});
 return {value:row.value,coverage:row.coverage,status:row.status,active:row.active};
}

export function printDiaryColumnDescription(column){return column.id==='netCarbohydrate'?(column.definition===null?'Net carbohydrate definition is not set. Food values remain unknown.':carbohydrateDescription(column.definition)):null;}
export function validatePrintDiaryColumn(column,choice,rows){
 const selected=parsePrintDiaryColumn(choice);
 if(!column||column.version!==1||column.mode!==selected.mode)fail();
 if(selected.mode==='macros'){if(Object.keys(column).length!==2)fail();return;}
 if(column.id!==selected.id||typeof column.name!=='string'||!column.name||column.unit!==nutrients.get(selected.id).unit)fail();
 const net=column.id==='netCarbohydrate';if(Object.hasOwn(column,'definition')!==net)fail();if(net&&column.definition!==null&&parseCarbohydrateDefinition(column.definition).mode!=='net')fail();
 for(const row of rows){if(row.kind==='exercise')continue;const value=row.column,c=value?.coverage;
  if(!value||typeof value.active!=='boolean'||!(value.value===null||typeof value.value==='number'&&Number.isFinite(value.value))||!c||!Number.isSafeInteger(c.known)||!Number.isSafeInteger(c.total)||c.known<0||c.total<c.known||typeof c.complete!=='boolean'||!['unknown','partial','complete'].includes(value.status))fail();
  if(value.active!==(net?column.definition!==null:true)||(value.value===null)!==(value.status==='unknown')||value.status==='complete'&&!c.complete||value.status==='partial'&&c.complete||!value.active&&value.value!==null||Object.hasOwn(row,'nutrients')||Object.hasOwn(row,'coverage'))fail();
 }
}
