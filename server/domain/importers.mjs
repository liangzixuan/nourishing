import { interpretRecipeYield } from './recipe-yield.mjs';
import { readRecipeSource } from './recipe-source.mjs';
import { extractPlainRecipe } from './recipe-plain-text.mjs';
import { interpretRecipeIngredients } from './recipe-ingredient-source.mjs';
import { interpretRecipeInstructions } from './recipe-instructions.mjs';
import Papa from 'papaparse';
import { act } from './workspace.mjs';
import { catalog } from './nutrition.mjs';
import { parseFoodClassification } from './food-classification.mjs';

const invalid = message => { throw Object.assign(new Error(message), {status:400}); };
function recipeDraft(recipe,source='Pasted recipe') {
  if(!recipe) invalid('No recipe was found. Paste Recipe JSON, structured HTML, or a complete recipe with Ingredients and Instructions headings.');
  const yieldReview=interpretRecipeYield(recipe.recipeYield);
  const {ingredients,ingredientSource}=interpretRecipeIngredients(recipe.recipeIngredient??[]);
  if(recipe.name!==undefined&&typeof recipe.name!=='string')invalid('Recipe name must be a single text value.');
  return {name:typeof recipe.name==='string'?recipe.name:'Imported recipe',servings:yieldReview.sourceServings??1,ingredients,...(ingredientSource===undefined?{}:{ingredientSource}),recipeYield:recipe.recipeYield??null,yieldReview,instructions:interpretRecipeInstructions(recipe.recipeInstructions),source,reviewRequired:true,note:'Review food matches, quantities and serving yield before saving. Uncertain values remain visible.'};
}
export async function parseRecipe(input,source) {
  if(typeof input!=='string'||input.length>5000000)invalid('Recipe input must be text below 5 MB.');
  const recipe=await readRecipeSource(input,source)??extractPlainRecipe(input);
  return {...recipeDraft(recipe,source),...(recipe?.jsonldSource?{jsonldSource:recipe.jsonldSource}:{}),...(recipe?.rdfaSource?{rdfaSource:recipe.rdfaSource}:{}),...(recipe?.plainTextSource?{plainTextSource:recipe.plainTextSource}:{})};
}
export async function importRecipe(input) {
  if(!input||typeof input!=='object'||Array.isArray(input))invalid('Choose a recipe URL, recipe text, or an ingredient list.');
  const supplied=['url','text','ingredients'].filter(key=>{
    if(input[key]===undefined)return false;
    if(typeof input[key]!=='string')invalid('Recipe sources must be text.');
    return input[key].trim().length>0;
  });
  if(supplied.length!==1)invalid('Use one source: a recipe URL, recipe text, or an ingredient list.');
  if(supplied[0]==='ingredients'){
    if(input.ingredients.length>5000000)invalid('Ingredient list must be text below 5 MB.');
    const recipeIngredient=input.ingredients.split(/\r\n?|\n/).filter(line=>line.trim());
    return recipeDraft({recipeIngredient},'Pasted ingredient list');
  }
  if(supplied[0]==='text') return parseRecipe(input.text,'Pasted recipe');
  let url;try{url=new URL(input.url);}catch{invalid('Enter a complete public recipe URL.');}
  if(!['http:','https:'].includes(url.protocol)||url.username||url.password)invalid('Use an HTTP(S) recipe URL without credentials.');
  let response;try{response=await fetch(url,{signal:AbortSignal.timeout(20000),headers:{'User-Agent':'Nourish-Local-Recipe-Importer/0.1','Accept':'text/html,application/ld+json,application/json'}});}catch{invalid('The recipe page could not be fetched. Paste Recipe JSON or HTML instead.');}
  if(!response.ok)invalid(`Recipe site returned HTTP ${response.status}. Paste Recipe JSON instead.`);
  if(!response.body)invalid('The recipe page returned no readable body.');
  let size=0;const chunks=[];for await(const chunk of response.body){size+=chunk.length;if(size>5000000)invalid('Recipe page exceeds 5 MB.');chunks.push(chunk);}
  return parseRecipe(Buffer.concat(chunks).toString('utf8'),response.url);
}

export function importCsv(state,text,kind='biometrics') {
  if(typeof text!=='string'||text.length>10000000)invalid('CSV must be text below 10 MB.');
  const parsed=Papa.parse(text,{header:true,skipEmptyLines:'greedy',transformHeader:x=>x.trim().toLowerCase()});
  if(parsed.errors.length)invalid(`CSV error: ${parsed.errors[0].message}`);
  if(parsed.data.length>100000)invalid('CSV has too many rows.');
  const candidate=structuredClone(state);
  for(const [index,row]of parsed.data.entries()){
    try {
      if(kind==='biometrics')act(candidate,'biometric.add',{date:row.date,type:row.type||row.metric,value:Number(row.value),unit:row.unit,time:row.time});
      else if(kind==='foods'){
        if(row.netcarbs?.trim())invalid('The legacy netCarbs column is ambiguous. Use availableCarbs only when the value excludes fiber alone, or reportedNetCarbs when the exclusion method is unknown.');
        if(row.netcarbohydrate?.trim())invalid('netCarbohydrate is a target ID and cannot be imported as a food nutrient.');
        const nutrients={};
        for(const n of catalog){const value=row[n.id.toLowerCase()];if(value!==undefined&&value.trim()!=='')nutrients[n.id]=Number(value);}
        const classification=parseFoodClassification(row.classification?.trim()?{classification:row.classification}:{});
        let carbohydrateBasis={};
        if(row.reportednetexcludes?.trim()){
          let reportedNetExcludes;try{reportedNetExcludes=JSON.parse(row.reportednetexcludes);}catch{invalid('reportedNetExcludes must be a JSON array of carbohydrate component IDs.');}
          carbohydrateBasis={carbohydrateBasis:{reportedNetExcludes}};
        }
        act(candidate,'food.save',{name:row.name,serving:row.serving||'1 serving',grams:row.grams?Number(row.grams):100,barcode:row.barcode,nutrients,...classification,...carbohydrateBasis});
      }
      else if(kind==='diary'){const food=state.foods.find(x=>x.id===row.foodid||x.name.toLowerCase()===String(row.name||'').toLowerCase());if(!food)invalid(`Food '${row.name||row.foodid}' is not in the local database.`);act(candidate,'entry.add',{date:row.date,foodId:food.id,amount:Number(row.amount||1),group:row.group||state.settings.groups[0],time:row.time});}
      else invalid('CSV kind must be biometrics, foods or diary.');
    }catch(error){invalid(`Row ${index+2}: ${error.message}`);}
  }
  Object.assign(state,candidate);return parsed.data.length;
}
