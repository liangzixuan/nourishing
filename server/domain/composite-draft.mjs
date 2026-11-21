import {text,number} from './diary-record-fields.mjs';
import {parseVolume} from './food-quantity.mjs';
import {libraryStatusForSave,withoutLibraryStatus} from './library-status.mjs';
import {parseFoodTaxonomy} from './food-taxonomy.mjs';
import {recipeServingFields} from './recipe-portion-schema.mjs';
import {servingTranslationFields} from './measure-translations.mjs';
import {parseCookedWeightGrams} from './recipe-weight.mjs';
import {parseCompositeItems} from './resource-quantity.mjs';
import {orderRecipeDependencies} from './resource-dependencies.mjs';
import {recipePortionFields} from './recipe-portions.mjs';
import {fail} from './workspace-validation.mjs';
export function normalizeCompositeDraft(s,kind,p,{previous=null,copied=null}={}){
 if(kind==='meal')return {...libraryStatusForSave(p,previous),id:p.id,name:text(p.name,'Meal name',300),items:parseCompositeItems(s,p.items)};
 if(kind!=='recipe')fail('Choose a recipe or meal.');
 const volume=parseVolume(p.batchVolumeMl,'Measured full-recipe volume',10000000);
 const next={...libraryStatusForSave(copied?withoutLibraryStatus(p):p,previous),...parseFoodTaxonomy(p),...recipeServingFields(p),...(volume===null?{}:{batchVolumeMl:volume}),...servingTranslationFields(p),id:p.id,name:text(p.name,'Recipe name',300),servings:number(p.servings,'Servings',0.001,100000),cookedWeightGrams:parseCookedWeightGrams(p.cookedWeightGrams),ingredients:parseCompositeItems(s,p.ingredients),instructions:typeof p.instructions==='string'?p.instructions.slice(0,100000):'',source:typeof p.source==='string'?p.source.slice(0,2000):''};
 const candidate={...s,recipes:[...s.recipes.filter(row=>row.id!==next.id),next]};
 orderRecipeDependencies(candidate,[next]);
 Object.assign(next,recipePortionFields({...next,portions:p.portions===undefined?(previous?.portions??copied?.portions):p.portions},candidate));
 return next;
}
