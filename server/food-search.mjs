// Canonical local search membership and ranking adapter; source: nourishing-local/server/food-search.mjs.
import {catalogQuery,matchesCatalogQuery} from './domain/usda-catalog.mjs';
import {catalogIdentity,catalogSourceAliases,compactFoodSource} from './domain/catalog-source.mjs';
import {isActiveLibraryItem} from './domain/library-status.mjs';
import {recipeAncestors} from './domain/resource-dependencies.mjs';
import {parseFoodSearchOptions,searchFoodIndex,foodSearchCategories,foodSearchSorts} from './domain/food-search-index.mjs';

const localDatabase=food=>catalogIdentity(food.source)?food.source.datasetId:food.source?.name==='Open Food Facts'?'open-food-facts':food.source?.provider==='usda-branded'?'usda-branded':'custom';
const singular={foods:'food',recipes:'recipe',meals:'meal'};
const reference={foodId:'foods',recipeId:'recipes',mealId:'meals'};
/** Restrict the search corpus before pagination; ingredient lists cannot contain meals or cycles. */
export function searchLibraryIngredients(state,foodCatalog,parameters){
 const params=new URLSearchParams(parameters),excluded=params.getAll('excludeRecipeId');params.delete('excludeRecipeId');
 if(excluded.length>1||excluded.some(id=>!id.trim()||id.length>1000))throw Object.assign(Error('Choose one recipe to exclude.'),{status:400});
 const ids=new Set(excluded.length?[excluded[0],...recipeAncestors(state,'recipeId',excluded[0]).map(row=>row.id)]:[]);
 return searchWorkspaceFoods({...state,meals:[],recipes:state.recipes.filter(row=>!ids.has(row.id))},foodCatalog,readFoodSearchQuery(params));
}
function categoryFacts(food,kind){
 const tags=new Set(food.tags??[]),identified=kind==='foods'&&catalogIdentity(food.source)!==null,externalBranded=food.source?.name==='Open Food Facts'||food.source?.provider==='usda-branded';
 return {common:identified?1:0,custom:identified||externalBranded?0:1,supplements:food.classification==='supplement'||food.categoryId==='SUPPLEMENTS'||tags.has('Supplement'),brands:tags.has('Brand')||externalBranded||Boolean(food.barcode)||Boolean(food.source?.brands?.trim()),restaurants:food.categoryId==='RESTAURANT_FOODS'||tags.has('Restaurant'),beverages:food.categoryId==='BEVERAGES'};
}

/** One owner for mobile search membership, source identity and personal usage. */
export function searchWorkspaceFoods(state,foodCatalog,input={}){
 const options=parseFoodSearchOptions(input),parsed=catalogQuery(options.query),usage=new Map();
 for(const [index,entry]of (state.entries??[]).entries()){
  const field=Object.keys(reference).find(key=>typeof entry[key]==='string');if(!field)continue;
  const key=reference[field]+':'+entry[field],previous=usage.get(key)??{frequency:0,recent:0};usage.set(key,{frequency:previous.frequency+1,recent:index+1});
 }
 const favorites=new Set((state.settings?.favorites??[]).map(row=>row.kind+':'+row.id));
 const datasets=new Map((foodCatalog?.status().datasets??[]).filter(row=>row.foodCount>0).map(row=>[row.id,{id:row.id,name:row.name}]));
 const all=[];
 for(const kind of ['foods','recipes','meals'])for(const item of state[kind]??[]){
  if(!isActiveLibraryItem(item))continue;
  const database=kind==='foods'?localDatabase(item):'custom';
  if(!datasets.has(database))datasets.set(database,{id:database,name:database==='custom'?'Custom':database==='open-food-facts'?'Open Food Facts':database==='usda-branded'?'USDA Branded':item.source.dataset||database});
  const flags=categoryFacts(item,kind),favorite=favorites.has(singular[kind]+':'+item.id);
  const compact={id:item.id,kind,name:item.name,serving:item.serving??null,grams:item.grams??null,...(item.milliliters!==undefined?{milliliters:item.milliliters}:{}),source:compactFoodSource(item.source),database,favorite,knownNutrients:kind==='foods'?Object.values(item.nutrients??{}).filter(Number.isFinite).length:null};
  all.push({item,kind,identity:kind+':'+item.id,database,compact,...flags,favorite,...(usage.get(kind+':'+item.id)??{frequency:0,recent:0})});
 }
 if(options.databases.some(id=>!datasets.has(id)))throw Object.assign(Error('A selected food database is not available. Choose an installed or saved source.'),{status:400});
 const identical=foodCatalog?.identicalSnapshotIds(all.filter(row=>row.kind==='foods').map(row=>row.item))??new Set();
 const excludedCatalogIds=[...new Set(all.filter(row=>row.kind==='foods'&&identical.has(row.item.id)).map(row=>catalogIdentity(row.item.source).id))];
 const libraryRows=all.filter(row=>{
  if(options.category==='favorites'&&!row.favorite)return false;
  if(['custom','common','supplements','brands'].includes(options.category)&&!row[options.category])return false;
  return matchesCatalogQuery([row.item.name,...(row.item.translations??[]).map(t=>t.name),...catalogSourceAliases(row.item.source),row.item.barcode??'',row.item.source?.brands??'',catalogIdentity(row.item.source)?.value??''].join(' '),parsed);
 }).map(({item,...row})=>({...row,restaurants:row.restaurants?1:0,catalogId:row.kind==='foods'&&identical.has(item.id)?catalogIdentity(item.source).id:null,nameFold:item.name.toLowerCase(),tier:item.name.toLowerCase()===parsed.trimmed?0:item.name.toLowerCase().startsWith(parsed.trimmed)?1:2}));
 const query={options,libraryRows,excludedCatalogIds};
 const result=foodCatalog?.searchWorkspace?foodCatalog.searchWorkspace(options.query,query):searchFoodIndex(null,parsed,query);
 const items=result.items.map(row=>({...row,sourceType:catalogIdentity(row.source)?.provider??(row.source?.name==='Open Food Facts'?'open-food-facts':row.source?.provider==='usda-branded'?'usda-branded':'custom')}));
 return {version:1,...result,items,options,databases:[...datasets.values()],categories:foodSearchCategories,sorts:foodSearchSorts,identicalSnapshotsDeduplicated:excludedCatalogIds.length};
}

export function readFoodSearchQuery(parameters){
 const scalar=['q','category','sort','offset','limit'];
 if([...parameters.keys()].some(key=>!scalar.includes(key)&&key!=='database')||scalar.some(key=>parameters.getAll(key).length>1))throw Object.assign(Error('Choose each search option once.'),{status:400});
 return parseFoodSearchOptions({query:parameters.get('q')??'',category:parameters.get('category')??'all',sort:parameters.get('sort')??'best',databases:parameters.getAll('database'),offset:parameters.has('offset')?Number(parameters.get('offset')):0,limit:parameters.has('limit')?Number(parameters.get('limit')):25});
}

/** Cloud route limits and ingredient restrictions are applied before ranking/pagination. */
export function readCloudFoodSearchQuery(parameters){
 const params=new URLSearchParams(parameters),scope={allowMeals:true,allowRecipes:true,excludeRecipe:null};
 for(const key of Object.keys(scope)){
  const values=params.getAll(key);if(values.length>1)throw Object.assign(Error('Choose each search option once.'),{status:400});params.delete(key);
  if(!values.length)continue;
  if(key==='excludeRecipe'){if(!values[0].trim()||values[0].length>1000)throw Object.assign(Error('Choose one recipe to exclude.'),{status:400});scope[key]=values[0];}
  else {if(!['true','false'].includes(values[0]))throw Object.assign(Error('Choose valid ingredient filters.'),{status:400});scope[key]=values[0]==='true';}
 }
 const options=readFoodSearchQuery(params);if(options.query.length>200||options.offset>100000)throw Object.assign(Error('Invalid search.'),{status:400});
 return {options,scope};
}
export function searchCloudFoods(state,catalog,{options,scope}){
 const excluded=new Set(scope.excludeRecipe?[scope.excludeRecipe,...recipeAncestors(state,'recipeId',scope.excludeRecipe).map(row=>row.id)]:[]);
 return searchWorkspaceFoods({...state,meals:scope.allowMeals?state.meals:[],recipes:scope.allowRecipes?state.recipes.filter(row=>!excluded.has(row.id)):[]},catalog,options);
}
