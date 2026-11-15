const invalid=message=>{throw Object.assign(new Error(message),{status:400});};

export const FOOD_CLASSIFICATION_OPTIONS=Object.freeze([
  Object.freeze({value:'',label:'Unclassified'}),
  Object.freeze({value:'food',label:'Food'}),
  Object.freeze({value:'supplement',label:'Supplement'}),
]);

/** Omission is the only unclassified representation. This is local reviewed
 * metadata; names, source databases and nutritional values do not establish it. */
export function parseFoodClassification(food){
  if(!food||typeof food!=='object'||Array.isArray(food))invalid('Food classification requires a food object.');
  if(!Object.hasOwn(food,'classification'))return {};
  if(!['food','supplement'].includes(food.classification))invalid('Choose Food, Supplement or clear the classification to leave it unclassified.');
  return {classification:food.classification};
}
export function foodClassificationLabel(food){return FOOD_CLASSIFICATION_OPTIONS.find(option=>option.value===(parseFoodClassification(food).classification??'')).label;}

/** Provider equality and offline measurements omit this one local assertion.
 * Every other field remains part of the existing source/version contract. */
export function foodWithoutClassification(food){
  parseFoodClassification(food);const {classification,...facts}=food;return facts;
}
