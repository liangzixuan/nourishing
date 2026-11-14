const fail=message=>{throw Object.assign(new Error(message),{status:400});};
const collections={foodId:'foods',recipeId:'recipes',mealId:'meals'};
export function resourceReference(input){
  if(!input||typeof input!=='object'||Array.isArray(input))fail('A resource quantity must be an object.');
  const refs=Object.keys(collections).filter(key=>input[key]!==undefined&&input[key]!==null&&input[key]!=='');
  if(refs.length>1)fail('Choose exactly one food, recipe or meal.');
  return refs[0]||null;
}
