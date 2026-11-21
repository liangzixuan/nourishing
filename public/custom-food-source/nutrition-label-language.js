import {formatMessage} from '../report-source/public/message-format.js';
import {nutrientDisplayName} from '../report-source/public/nutrient-language.js';

const compactAmericanRows=new Set(['calories','fat','saturatedFat','transFat','carbs','fiber','sugar','addedSugar']);

/** Presentation follows stable profile and nutrient identities; source facts stay literal. */
export function nutritionLabelPresentation(language){
 const message=(key,values)=>formatMessage(language,'nutritionLabel.'+key,values),field=key=>formatMessage(language,'nutritionLabelErrors.field.'+key);
 const number=value=>language==='en'?String(value):new Intl.NumberFormat(language,{maximumSignificantDigits:21,useGrouping:false}).format(value);
 const nutrient=(id,name)=>nutrientDisplayName({id,name},language);
 const fullRowName=(profile,row)=>{
  if(language==='en')return row.name;
  if(row.id==='salt')return formatMessage(language,'nutritionLabelErrors.row.salt');
  const key=row.id==='carbs'?'carbs':row.id==='folicAcid'?'folicAcid':profile.id==='us-legacy'&&row.id==='totalFolates'?'legacyFolates':profile.id==='eu-1169'&&row.id==='totalFolates'?'euFolates':profile.id==='anz-2026'&&row.id==='niacin'?'anzNiacin':profile.id==='anz-2026'&&row.id==='reportedNetCarbs'?'anzCarbs':profile.id==='canada-2022'&&row.id==='iodine'?'canadaIodine':null;
  return key?message('row.'+key):nutrient(row.id,row.name);
 };
 const rowName=(profile,row)=>profile.id==='us-2016'&&compactAmericanRows.has(row.id)?formatMessage(language,'mobileFoodEditor.facts.'+row.id):fullRowName(profile,row);
 const method=fact=>message('method.'+fact.method,{percent:number(fact.percent),dailyValue:number(fact.dailyValue),amount:number(fact.inputValue),unit:fact.method==='percent-daily-value'?fact.referenceUnit:fact.inputUnit});
 return {message,field,number,nutrient,rowName,fullRowName,method,profileName:profile=>message('profile.'+profile.id),population:profile=>formatMessage(language,'nutritionLabelErrors.population.'+profile.id),formName:form=>message('form.'+form.id)};
}
