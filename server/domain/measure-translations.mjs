export const measureLocales=Object.freeze([
 ['en_US','English (US)'],['en_GB','English (UK)'],['fr','French'],['de','German'],['es','Spanish'],['pt_BR','Portuguese (Brazil)'],
].map(([id,name])=>Object.freeze({id,name})));
export const measureTranslationErrors=Object.freeze({"invalidList": "Use at most one measure translation for each supported language.", "invalidRow": "A measure translation needs only a locale and label.", "invalidLocale": "Choose each supported measure language only once.", "invalidLabel": "Translation names cannot be blank or exceed 500 characters.", "invalidResource": "Measure translations require a food or recipe.", "invalidPortions": "Translated portions must be a list.", "invalidPortion": "A translated portion must be an object."});
const invalid=measureTranslationCode=>{throw Object.assign(Error(measureTranslationErrors[measureTranslationCode]),{status:400,measureTranslationCode});};
export function parseMeasureTranslations(value){
 if(value===undefined)return [];
 if(!Array.isArray(value)||value.length>measureLocales.length)invalid('invalidList');
 const seen=new Set();return value.map(row=>{
  if(!row||typeof row!=='object'||Array.isArray(row)||Object.keys(row).length!==2||!Object.hasOwn(row,'locale')||!Object.hasOwn(row,'label'))invalid('invalidRow');
  if(!measureLocales.some(locale=>locale.id===row.locale)||seen.has(row.locale))invalid('invalidLocale');seen.add(row.locale);
  if(typeof row.label!=='string'||!row.label.trim()||row.label.length>500)invalid('invalidLabel');
  return {locale:row.locale,label:row.label.trim()};
 });
}
export function servingTranslationFields(resource){const rows=parseMeasureTranslations(resource.servingTranslations);return rows.length?{servingTranslations:rows}:{};}
export function portionTranslationFields(portion){const rows=parseMeasureTranslations(portion.translations);return rows.length?{translations:rows}:{};}
export function validateMeasureTranslations(resource){
 if(!resource||typeof resource!=='object'||Array.isArray(resource))invalid('invalidResource');
 servingTranslationFields(resource);
 if(resource.portions!==undefined&&!Array.isArray(resource.portions))invalid('invalidPortions');
 for(const portion of resource.portions??[]){if(!portion||typeof portion!=='object'||Array.isArray(portion))invalid('invalidPortion');portionTranslationFields(portion);}
}
export function measureLabel(base,translations,locale){return parseMeasureTranslations(translations).find(row=>row.locale===locale)?.label??base;}
/** Translation metadata cannot change the measured quantity of an offline command. */
export function withoutMeasureTranslations(resource){
 validateMeasureTranslations(resource);const {servingTranslations,...facts}=resource;
 if(resource.portions!==undefined)facts.portions=resource.portions.map(({translations,...portion})=>portion);
 return facts;
}
