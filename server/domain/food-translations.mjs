export const foodLanguages=Object.freeze([
 ['en','English'],['fr','French'],['es','Spanish'],['de','German'],['it','Italian'],['pl','Polish'],['pt','Portuguese'],['nl','Dutch'],['da','Danish'],
].map(([id,name])=>Object.freeze({id,name})));
export const foodTranslationErrors=Object.freeze({"invalidFood": "Food translations require a food object.", "invalidList": "Add at most one translated name for each supported language.", "invalidRow": "A food translation needs only its language and name.", "invalidLanguage": "Choose each supported food language only once.", "invalidName": "A translated food name must contain 1 to 500 characters."});
const invalid=foodTranslationCode=>{throw Object.assign(Error(foodTranslationErrors[foodTranslationCode]),{status:400,foodTranslationCode});};
export function parseFoodTranslations(food){
 if(!food||typeof food!=='object'||Array.isArray(food))invalid('invalidFood');
 if(!Object.hasOwn(food,'translations'))return {};
 if(!Array.isArray(food.translations)||food.translations.length>foodLanguages.length)invalid('invalidList');
 const seen=new Set(),translations=food.translations.map(row=>{
  if(!row||typeof row!=='object'||Array.isArray(row)||Object.keys(row).length!==2||!Object.hasOwn(row,'language')||!Object.hasOwn(row,'name'))invalid('invalidRow');
  if(!foodLanguages.some(language=>language.id===row.language)||seen.has(row.language))invalid('invalidLanguage');seen.add(row.language);
  if(typeof row.name!=='string'||!row.name.trim()||row.name.length>500)invalid('invalidName');
  return {language:row.language,name:row.name.trim()};
 });return translations.length?{translations}:{};
}
