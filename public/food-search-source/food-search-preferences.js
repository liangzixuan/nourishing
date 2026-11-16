const key='nourishing-food-search-options';
const defaults=()=>({sort:'best',databases:[],tabs:true,multi:false});
function parse(value){
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(key=>!['sort','databases','tabs','multi'].includes(key))||!['best','az','za','recent','frequent'].includes(value.sort)||typeof value.tabs!=='boolean'||typeof value.multi!=='boolean'||!Array.isArray(value.databases)||value.databases.some(id=>typeof id!=='string'||!id.trim())||new Set(value.databases).size!==value.databases.length)throw Error('Invalid food search options.');
 return {sort:value.sort,databases:[...value.databases],tabs:value.tabs,multi:value.multi};
}
// Only presentation choices belong here. Queries and selected foods remain in
// the picker; uncertain saves belong to FoodReviewRecovery.
export function readFoodSearchPreferences(storage){
 try{const saved=(storage??globalThis.localStorage).getItem(key);return saved===null?defaults():parse(JSON.parse(saved));}catch{return defaults();}
}
export function writeFoodSearchPreferences(value,storage){
 (storage??globalThis.localStorage).setItem(key,JSON.stringify(parse(value)));
}
