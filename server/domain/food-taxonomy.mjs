// Public main-editor choices, traced in evidence/food-taxonomy-contract.json.
// Local reviewed labels are independent of provider categories and report classification.
export const foodCategories=Object.freeze([["BABY_FOODS", "Baby Foods"], ["BAKED_PRODUCTS", "Baked Products"], ["BEEF_PRODUCTS", "Beef Products"], ["BEVERAGES", "Beverages"], ["BREAKFAST_CEREALS", "Breakfast Cereals"], ["CEREAL_GRAINS_AND_PASTA", "Cereal Grains and Pasta"], ["DAIRY_AND_EGG_PRODUCTS", "Dairy and Egg Products"], ["ETHNIC_FOODS", "Ethnic Foods"], ["FAST_FOODS", "Fast Foods"], ["FATS_AND_OILS", "Fats and Oils"], ["FINFISH_AND_SHELLFISH_PRODUCTS", "Finfish and Shellfish Products"], ["FRUITS_AND_FRUIT_JUICES", "Fruits and Fruit Juices"], ["LAMB_VEAL_AND_GAME_PRODUCTS", "Lamb, Veal, and Game Products"], ["LEGUMES_AND_LEGUME_PRODUCTS", "Legumes and Legume Products"], ["MEALS_ENTREES_AND_SIDEDISHES", "Meals, Entrees, and Sidedishes"], ["NUT_AND_SEED_PRODUCTS", "Nut and Seed Products"], ["PORK_PRODUCTS", "Pork Products"], ["POULTRY_PRODUCTS", "Poultry Products"], ["RESTAURANT_FOODS", "Restaurant Foods"], ["SAUSAGES_AND_LUNCHEON_MEATS", "Sausages and Luncheon Meats"], ["SNACKS", "Snacks"], ["SOUPS_SAUCES_AND_GRAVIES", "Soups, Sauces, and Gravies"], ["SPICES_AND_HERBS", "Spices and Herbs"], ["SUPPLEMENTS", "Supplements"], ["SWEETS", "Sweets"], ["VEGETABLES_AND_VEGETABLE_PRODUCTS", "Vegetables and Vegetable Products"]].map(([id,label])=>Object.freeze({id,label})));
export const foodTags=Object.freeze(["Whole", "Brand", "Restaurant", "Supplement", "Seafood", "Vegetarian", "Vegan", "Dairy", "Nuts"]);
const categories=new Map(foodCategories.map(row=>[row.id,row]));
const invalid=message=>{throw Object.assign(Error(message),{status:400});};
export function parseFoodTaxonomy(item){
 if(!item||typeof item!=='object'||Array.isArray(item))invalid('Food organization requires an item.');
 const result={};
 if(Object.hasOwn(item,'categoryId')){if(!categories.has(item.categoryId))invalid('Choose a supported food category, or leave it unspecified.');result.categoryId=item.categoryId;}
 if(Object.hasOwn(item,'tags')){
  if(!Array.isArray(item.tags)||item.tags.length>foodTags.length||Array.from(item.tags).some(tag=>!foodTags.includes(tag))||new Set(item.tags).size!==item.tags.length)invalid('Choose each supported food tag only once.');
  if(item.tags.length)result.tags=[...item.tags];
 }
 if(item.readOnly&&Object.keys(result).length)invalid('Create a custom copy to change food categories and tags.');
 return result;
}
export function foodTaxonomyLabels(item){const {categoryId,tags=[]}=parseFoodTaxonomy(item);return [...(categoryId?[categories.get(categoryId).label]:[]),...tags];}
export function customFoodCategory(item){const {categoryId}=parseFoodTaxonomy(item);return categoryId?{id:'custom:'+categoryId,name:categories.get(categoryId).label,origin:'custom'}:null;}
