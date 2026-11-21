import {normalizeCompositeDraft} from './composite-draft.mjs';
import {fail,array,exactId} from './workspace-validation.mjs';
import {text,number} from './diary-record-fields.mjs';
import {nutrients} from './nutrient-values.mjs';
import {parseVolume,resolveFoodQuantity} from './food-quantity.mjs';
import {parseLibraryStatus,libraryStatusForSave} from './library-status.mjs';
import {parseFoodNotes} from './food-notes.mjs';
import {parseFoodTranslations} from './food-translations.mjs';
import {parseFoodOxalateSource} from './oxalate-source.mjs';
import {parseFoodClassification} from './food-classification.mjs';
import {parseCarbohydrateBasis} from './carbohydrate-policy.mjs';
import {parseFoodTaxonomy} from './food-taxonomy.mjs';
import {customCatalogSource} from './food-catalog-identity.mjs';
import {servingTranslationFields,portionTranslationFields} from './measure-translations.mjs';
import {photoReviewMetadata} from './photo-records.mjs';
import {textReviewMetadata} from './text-records.mjs';
import {contentDigestInput} from './content-digest-input.mjs';
const sameContent=(left,right)=>contentDigestInput(left)===contentDigestInput(right);
const lookup=(state,collection,id)=>{const item=state[collection].find(row=>row.id===id);if(!item)fail(`${collection} item does not exist.`);return item;};
const copyTimestamp=value=>{const parsed=new Date(value);if(!Number.isFinite(parsed.getTime()))fail('Recipe copy time must be a valid timestamp.');return parsed.toISOString();};
export function foodPortions(value){
  const portions=array(value,'Food portions',1000).map(p=>{
    if(!p||typeof p!=='object'||Array.isArray(p))fail('Each food portion must be an object with an ID, label and measured weight.');
    const field=Object.hasOwn(p,'milliliters')?'milliliters':'grams';
    if(Object.hasOwn(p,'grams')&&Object.hasOwn(p,'milliliters'))fail('A food portion must use one measured basis: grams or millilitres.');
    return {id:exactId(p.id,'Portion ID',200),label:text(p.label,'Portion label',500),[field]:number(p[field],`Portion ${field}`,0.000001,10000000),...portionTranslationFields(p)};
  });
  if(new Set(portions.map(p=>p.id)).size!==portions.length)fail('Portion IDs must be unique.');return portions;
}
export function foodSource(value) {if(value===undefined)return 'User-provided label or manual entry';if(typeof value==='string')return text(value,'Food source',2000);if(!value||typeof value!=='object'||Array.isArray(value))fail('Food source must be text or a metadata object.');text(value.name,'Source name',200);const encoded=JSON.stringify(value);if(new TextEncoder().encode(encoded).byteLength>32768)fail('Food provenance exceeds 32 KiB.');return JSON.parse(encoded);}
function recipeCopySource(value){
  if(!value||typeof value!=='object'||Array.isArray(value))fail('Recipe copy history must be an object.');
  return {id:exactId(value.id,'Original recipe ID',100),name:text(value.name,'Original recipe name',300),createdAt:copyTimestamp(value.createdAt)};
}
export function retainSourceReviews(next,previous,input,contentKeys){
  const changed=Boolean(previous&&contentKeys.some(key=>!sameContent(previous[key]??null,next[key]??null)));
  for(const [key,parse]of [['photoReview',photoReviewMetadata],['textReview',textReviewMetadata]]){
    const supplied=input[key]===undefined?undefined:parse(input[key]);
    const source=previous?.[key]??supplied;if(source===undefined)continue;
    const review=parse(source);next[key]={...review,modifiedAfterReview:review.modifiedAfterReview||changed};
  }
}
function normalizeFoodDraft(s,p){
      parseLibraryStatus(p);
      const notes=parseFoodNotes(p),translations=parseFoodTranslations(p);
      const oxalateSource=parseFoodOxalateSource(p);
      const classification=parseFoodClassification(p);
      const carbohydrateBasis=parseCarbohydrateBasis(p);
      if(p.id&&lookup(s,'foods',p.id).readOnly)fail('Catalog source foods are read-only. Create a custom copy to change values.');
      const previous=p.id?lookup(s,'foods',p.id):null,provenance=foodSource(p.source===undefined?previous?.source:p.source);
      const source=foodSource(customCatalogSource(provenance));
      const dataQuality=source?.userModified?'User-modified food. Values were entered locally; original source facts remain in the provenance. Review the serving basis and label values.':typeof p.dataQuality==='string'?p.dataQuality.slice(0,4000):previous?.dataQuality||'';
      const volume=parseVolume(p.milliliters);
      const next={...(volume===null?{}:{milliliters:volume}),id:p.id,name:text(p.name,'Food name',500),serving:text(p.serving||'1 serving','Serving',100),grams:p.grams===null||p.grams===undefined&&volume!==null?null:number(p.grams??100,'Grams',0.001,100000),barcode:p.barcode?text(p.barcode,'Barcode',100):'',nutrients:nutrients(p.nutrients||{}),portions:foodPortions(p.portions===undefined?(previous?.portions??[]):p.portions),source,dataQuality,sample:false,...notes,...translations,...servingTranslationFields(p),...classification,...carbohydrateBasis,...oxalateSource,...parseFoodTaxonomy(p),...libraryStatusForSave(p,previous)};
      for(const portion of next.portions)resolveFoodQuantity(next,{quantity:1,unit:'portion',portionId:portion.id});
      return next;
}
function normalizeRecipeDraft(s,p){
      parseLibraryStatus(p);
      const suppliedReview=p.importReview===undefined?null:structuredClone(p.importReview);
      if(p.copyOf!==undefined&&(p.id||p.copiedFrom!==undefined||p.importReview!==undefined||p.photoReview!==undefined||p.textReview!==undefined))fail('Create a recipe copy as a new recipe; its source history is retained automatically.');
      const copied=p.copyOf!==undefined?lookup(s,'recipes',exactId(p.copyOf,'Recipe copy source',100)):null;
      const previous=p.id?lookup(s,'recipes',p.id):null;
      const next=normalizeCompositeDraft(s,'recipe',p,{previous,copied});
      if(copied){
        next.copiedFrom={id:copied.id,name:copied.name,createdAt:new Date().toISOString()};
        if(copied.importReview)next.importReview={...structuredClone(copied.importReview),modifiedAfterImport:true};
      }else if(previous?.importReview){const changed=['name','servings','ingredients','instructions','source','batchVolumeMl'].some(key=>!sameContent(previous[key],next[key]))||(previous.cookedWeightGrams??null)!==next.cookedWeightGrams;next.importReview={...previous.importReview,modifiedAfterImport:previous.importReview.modifiedAfterImport||changed};}
      else if(p.importReview!==undefined)next.importReview=suppliedReview;
      retainSourceReviews(next,copied??previous,p,['servings','ingredients','cookedWeightGrams','batchVolumeMl']);
      if(!copied&&(previous?.copiedFrom||p.copiedFrom!==undefined))next.copiedFrom=recipeCopySource(previous?.copiedFrom||p.copiedFrom);
      return next;
}
function normalizeMealDraft(s,p){
      const previous=p.id?lookup(s,'meals',p.id):null,next=normalizeCompositeDraft(s,'meal',p,{previous});
      retainSourceReviews(next,previous,p,['items']);
      return next;
}
export function normalizeLibraryDraft(state,kind,draft){
  if(!draft||typeof draft!=='object'||Array.isArray(draft))fail('Supply a library draft.');
  if(kind==='food')return normalizeFoodDraft(state,draft);
  if(kind==='recipe')return normalizeRecipeDraft(state,draft);
  if(kind==='meal')return normalizeMealDraft(state,draft);
  fail('Choose a custom food, recipe or meal.');
}
