const invalid=message=>{throw Object.assign(new Error(message),{status:400});};

/** Personal annotations are separate from the provider's nutrition provenance. */
export function parseFoodNotes(food){
  if(!food||typeof food!=='object'||Array.isArray(food))invalid('Food notes require a food object.');
  if(!Object.hasOwn(food,'notes'))return {};
  if(typeof food.notes!=='string'||food.notes.length>4000)invalid('Food notes must be text of at most 4,000 characters.');
  return food.notes.trim()?{notes:food.notes}:{};
}

/** Nutrition-only exchange and offline measurements exclude personal notes. */
export function withoutFoodNotes(food){
  parseFoodNotes(food);const {notes,...facts}=food;return facts;
}
