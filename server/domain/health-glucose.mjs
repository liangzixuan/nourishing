// Native Health Connect enum identities; unknown integers are retained, not inferred.
const fields=['specimenSource','mealType','relationToMeal'];
const names={specimenSource:'specimen',mealType:'meal',relationToMeal:'meal relation'};
const labels={specimenSource:['Unknown specimen','Interstitial fluid','Capillary blood','Plasma','Serum','Tears','Whole blood'],mealType:['Unknown meal','Breakfast','Lunch','Dinner','Snack'],relationToMeal:['Unknown meal relation','General','Fasting','Before meal','After meal']};
export function parseHealthGlucoseContext(value){
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).length!==fields.length||fields.some(key=>!Object.hasOwn(value,key)||!Number.isInteger(value[key])||value[key]<0||value[key]>2147483647))throw Object.assign(Error('Invalid native Health Connect glucose context.'),{status:400});
 return Object.fromEntries(fields.map(key=>[key,value[key]]));
}
export const healthGlucoseContextLabels=Object.freeze(Object.fromEntries(fields.flatMap(field=>labels[field].map((label,code)=>[field+'.'+code,label]))));
const glucoseMessage=(key,{code})=>healthGlucoseContextLabels[key]??('Unknown '+names[key.split('.')[0]]+' code '+code);
export function describeHealthGlucoseContext(value,message=glucoseMessage){const context=parseHealthGlucoseContext(value);return fields.map(field=>{const code=context[field],key=field+'.'+code;return message(Object.hasOwn(healthGlucoseContextLabels,key)?key:field+'.unknown',{code});}).join(' · ');}
