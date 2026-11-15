import Big from 'big.js';
const Decimal=Big();Decimal.DP=340;
export class VitaminActivityError extends Error{constructor(code,message){super(message);this.status=400;this.vitaminActivityCode=code;}}
const invalid=(code,message)=>{throw new VitaminActivityError(code,message);};
const definitions={
 vitaminAIU:{id:'vitaminA',name:'Vitamin A (RAE)',unit:'µg',reference:'https://ods.od.nih.gov/factsheets/VitaminA-HealthProfessional/',forms:[
  {id:'retinol',name:'Retinol (preformed vitamin A)',factor:'0.3'},
  {id:'supplementalBetaCarotene',name:'Beta-carotene from supplements',factor:'0.3'},
  {id:'dietaryBetaCarotene',name:'Beta-carotene from food',factor:'0.05'},
  {id:'dietaryOtherCarotenoids',name:'Alpha-carotene or beta-cryptoxanthin from food',factor:'0.025'}]},
 vitaminEIU:{id:'vitaminE',name:'Vitamin E (alpha-tocopherol activity)',unit:'mg',reference:'https://ods.od.nih.gov/factsheets/vitaminE-consumer/',forms:[
  {id:'naturalAlphaTocopherol',name:'Natural d-alpha-tocopherol',factor:'0.67'},
  {id:'syntheticAlphaTocopherol',name:'Synthetic dl-alpha-tocopherol',factor:'0.45'}]}
};
for(const definition of Object.values(definitions)){for(const form of definition.forms)Object.freeze(form);Object.freeze(definition.forms);Object.freeze(definition);}Object.freeze(definitions);
export const vitaminActivityDefinition=id=>Object.hasOwn(definitions,id)?definitions[id]:null;
/** Percentages describe shares of the stated IU activity, not ingredient mass. */
export function parseVitaminActivityForms(id,forms){
 const definition=vitaminActivityDefinition(id);if(!definition)invalid('measurement','Choose a supported vitamin A or E IU measurement.');
 if(forms===undefined)return null;
 if(!forms||typeof forms!=='object'||Array.isArray(forms)||!Object.keys(forms).length)invalid('shares','Enter the known vitamin forms and their shares of the total IU amount.');
 const known=new Set(definition.forms.map(form=>form.id)),result={};let total=new Decimal(0);
 for(const [key,value]of Object.entries(forms)){
  if(!known.has(key))invalid('form','Choose a supported form for this vitamin.');
  if(typeof value!=='string'||value.length>400||! /^(?:\d+(?:\.\d*)?|\.\d+)$/.test(value.trim()))invalid('decimalShare','Vitamin form shares must be decimal percentages from 0 to 100.');
  const share=new Decimal(value.trim());if(share.lt(0)||share.gt(100))invalid('shareRange','Vitamin form shares must be from 0 to 100.');
  result[key]=share.toString();total=total.plus(share);
 }
 if(!total.eq(100))invalid('shareTotal','Known vitamin form shares must total exactly 100% of the stated IU amount. Leave the form unknown if those shares are unavailable.');
 return result;
}
export function deriveVitaminActivity(id,value,forms){
 const definition=vitaminActivityDefinition(id),composition=parseVitaminActivityForms(id,forms);
 if(value===null)return null;
 if(typeof value!=='number'||!Number.isFinite(value)||value<0)invalid('amount','The vitamin IU amount must be a nonnegative finite number or unknown.');
 if(composition===null)return null;
 const components=definition.forms.filter(form=>Object.hasOwn(composition,form.id)).map(form=>({form:form.id,percent:composition[form.id],factor:form.factor}));
 const factor=components.reduce((sum,part)=>sum.plus(new Decimal(part.percent).times(part.factor).div(100)),new Decimal(0));
 const converted=Number(new Decimal(value).times(factor).toString());
 if(!Number.isFinite(converted)||(value>0&&converted===0))invalid('range','The converted vitamin activity is outside the supported numeric range.');
 return {id:definition.id,inputId:id,method:'vitamin-activity-conversion',inputValue:value,inputUnit:'IU',components,reference:definition.reference,value:converted,unit:definition.unit};
}
