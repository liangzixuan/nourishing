import {lookup as dnsLookup} from 'node:dns/promises';
import {request as httpRequest} from 'node:http';
import {request as httpsRequest} from 'node:https';
import {isIP} from 'node:net';
import {createGunzip,createInflate,createBrotliDecompress} from 'node:zlib';
import ipaddr from 'ipaddr.js';
import {parseRecipe,importRecipe as parseRecipeInput} from './domain/importers.mjs';
import {libraryQuantityOptions} from './library-view.mjs';
import {parseIngredientLine,convertIngredient} from './domain/recipe-ingredients.mjs';
import {matchIngredient,assessIngredientMatch} from './domain/recipe-matching.mjs';
import {interpretRecipeYield} from './domain/recipe-yield.mjs';
import {validateIngredientSource} from './domain/recipe-ingredient-source.mjs';
import {validateJsonLdSource} from './domain/recipe-jsonld.mjs';
import {validatePlainRecipeSource} from './domain/recipe-plain-text.mjs';
import {validateRdfaSource} from './domain/recipe-rdfa.mjs';
import {recipeNutrition} from './domain/nutrition.mjs';
import {digest} from './data-codec.mjs';

const fail=message=>{throw Object.assign(Error(message),{status:400,code:400,publicMessage:message});};
const exact=(value,fields)=>{if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(key=>!fields.includes(key)))fail('Unsupported recipe fields.');};
const positive=value=>typeof value==='number'&&Number.isFinite(value)&&value>0;
const MAX_BYTES=5_000_000;
export function publicRecipeUrl(input){
 let url;try{url=new URL(input);}catch{fail('Enter a complete recipe URL.');}
 if(!['http:','https:'].includes(url.protocol)||url.username||url.password)fail('Use a public HTTP(S) recipe URL without credentials.');
 url.hash='';return url;
}
export function isPublicRecipeAddress(address){
 try{return address!=='168.63.129.16'&&ipaddr.process(address).range()==='unicast';}catch{return false;}
}
function abortable(promise,signal){
 if(signal.aborted)return Promise.reject(signal.reason);
 return new Promise((resolve,reject)=>{const abort=()=>reject(signal.reason);signal.addEventListener('abort',abort,{once:true});promise.then(resolve,reject).finally(()=>signal.removeEventListener('abort',abort));});
}
function requestPage(url,{lookup,signal}){
 return new Promise((resolve,reject)=>{
  const req=(url.protocol==='https:'?httpsRequest:httpRequest)(url,{method:'GET',agent:false,lookup,signal,headers:{'User-Agent':'Nourishing-Recipe-Importer/1.0',Accept:'text/html,application/ld+json,application/json','Accept-Encoding':'gzip, deflate, br'}},resolve);
  req.on('error',reject);req.end();
 });
}
/** Every redirect receives a fresh public DNS check. The socket uses only those checked addresses. */
export async function fetchPublicRecipe(input,{lookup=dnsLookup,open=requestPage,signal=AbortSignal.timeout(20_000)}={}){
 let url=publicRecipeUrl(input);
 try{
  for(let redirects=0;redirects<=5;redirects++){
   signal.throwIfAborted();const host=url.hostname.replace(/^\[|\]$/g,'');
   const addresses=isIP(host)?[{address:host,family:isIP(host)}]:await abortable(lookup(host,{all:true,verbatim:true}),signal);
   if(!addresses.length||addresses.some(row=>!isPublicRecipeAddress(row.address)||isIP(row.address)!==row.family))fail('Recipe links must resolve to public internet addresses.');
   const pinnedLookup=(_hostname,options,callback)=>{const list=options?.family?addresses.filter(row=>row.family===options.family):addresses;if(!list.length)return callback(Error('No address matches this connection.'));options?.all?callback(null,list):callback(null,list[0].address,list[0].family);};
   const response=await abortable(open(url,{lookup:pinnedLookup,signal}),signal);
   if([301,302,303,307,308].includes(response.statusCode)){response.destroy();if(redirects===5)fail('The recipe link redirects too many times.');if(typeof response.headers.location!=='string')fail('The recipe redirect has no destination.');url=publicRecipeUrl(new URL(response.headers.location,url).href);continue;}
   if(response.statusCode<200||response.statusCode>=300){response.destroy();fail(`Recipe site returned HTTP ${response.statusCode}.`);}
   const encoding=String(response.headers['content-encoding']??'identity').toLowerCase();let body=response;
   if(encoding==='gzip')body=response.pipe(createGunzip());else if(encoding==='deflate')body=response.pipe(createInflate());else if(encoding==='br')body=response.pipe(createBrotliDecompress());else if(encoding!=='identity'){response.destroy();fail('The recipe page uses unsupported encoding.');}
   const chunks=[];let size=0;const abort=()=>body.destroy(signal.reason),forward=error=>body.destroy(error);signal.addEventListener('abort',abort,{once:true});if(body!==response)response.on('error',forward);
   try{signal.throwIfAborted();for await(const chunk of body){size+=chunk.length;if(size>MAX_BYTES)fail('Recipe page exceeds 5 MB.');chunks.push(chunk);}return {text:Buffer.concat(chunks).toString('utf8'),url:url.href};}finally{signal.removeEventListener('abort',abort);if(body!==response)response.removeListener('error',forward);body.destroy();response.destroy();}
  }
 }catch(error){if(error.status===400)throw error;fail(signal.aborted?'Recipe site timed out. Try again.':'The recipe page could not be fetched.');}
}
/** Search is a bounded view over the public compact catalog, never hydrated account state. */
export function recipeImportCatalog(catalog){
 return {get:id=>catalog.get(id),getOriginal:()=>null,search(query,{offset=0,limit=25}={}){const rows=catalog.projectInsights(['calories'],{query,portions:'none'});return {items:rows.slice(offset,offset+limit),total:rows.length};}};
}
const draftFields=['name','servings','instructions','source','originalIngredients','recipeYield','ingredientSource','jsonldSource','rdfaSource','plainTextSource','rows','yieldConfirmed','sourceConfirmed'];
const rowFields=['id','original','selection','override','excluded','confirmed'];
function validateDraft(draft){
 exact(draft,draftFields);if(typeof draft.name!=='string'||!draft.name.trim()||draft.name.length>300)fail('Enter a recipe name.');
 if(!positive(draft.servings)||draft.servings<0.001||draft.servings>100000)fail('Enter a serving count from 0.001 to 100,000.');
 if(!Array.isArray(draft.originalIngredients)||!draft.originalIngredients.length||draft.originalIngredients.length>1000||draft.originalIngredients.some(line=>typeof line!=='string'||!line.trim()||line.length>10000))fail('Use 1 to 1,000 ingredient lines.');
 if(typeof draft.instructions!=='string'||draft.instructions.length>100000||typeof draft.source!=='string'||draft.source.length>2000)fail('Recipe instructions or source link exceed the saved recipe limits.');
 for(const key of ['yieldConfirmed','sourceConfirmed'])if(draft[key]!==undefined&&typeof draft[key]!=='boolean')fail('Choose an explicit review confirmation.');
 if(draft.jsonldSource!==undefined)validateJsonLdSource(draft.jsonldSource,draft.originalIngredients,draft.ingredientSource);
 if(draft.rdfaSource!==undefined)validateRdfaSource(draft.rdfaSource);
 if(draft.plainTextSource!==undefined)validatePlainRecipeSource(draft.plainTextSource,draft.originalIngredients);
}
export async function importRecipeUrl(state,catalog,input,{fetchPage=fetchPublicRecipe}={}){
 exact(input,['url','ingredients','text']);const keys=Object.keys(input);if(keys.length!==1||typeof input[keys[0]]!=='string'||!input[keys[0]].trim())fail('Use one source: a recipe URL, recipe text, or an ingredient list.');
 let parsed;if(keys[0]==='url'){const url=publicRecipeUrl(input.url),page=await fetchPage(url.href);parsed=await parseRecipe(page.text,page.url);}else parsed=await parseRecipeInput(input);
 const draft={name:parsed.name,servings:parsed.servings,instructions:parsed.instructions,source:parsed.source,originalIngredients:parsed.ingredients,recipeYield:parsed.recipeYield,...Object.fromEntries(['ingredientSource','jsonldSource','rdfaSource','plainTextSource'].filter(key=>parsed[key]!==undefined).map(key=>[key,parsed[key]]))};
 return previewRecipeImport(state,catalog,draft,{initial:true});
}
export function previewRecipeImport(state,catalog,draft,{initial=false}={}){
 validateDraft(draft);const foodCatalog=recipeImportCatalog(catalog),yieldReview={...interpretRecipeYield(draft.recipeYield),confirmed:draft.yieldConfirmed===true},sourceRows=draft.ingredientSource===undefined?null:validateIngredientSource(draft.ingredientSource,draft.originalIngredients).rows;
 if(!initial&&(!Array.isArray(draft.rows)||draft.rows.length!==draft.originalIngredients.length))fail('Keep every ingredient line in the review.');
 const records=[],ingredients=[],rows=[],nextRows=[],matchingCache=new Map();let known=0,total=0;
 for(const [index,original] of draft.originalIngredients.entries()){
  const submitted=initial?{id:String(index),original}:draft.rows[index];exact(submitted,rowFields);
  if(submitted.id!==String(index)||submitted.original!==original)fail('Ingredient order must match the recipe.');
  for(const key of ['confirmed','excluded'])if(submitted[key]!==undefined&&typeof submitted[key]!=='boolean')fail('Choose an explicit ingredient confirmation.');
  if(submitted.override!==null&&submitted.override!==undefined)exact(submitted.override,['quantity','unit','portionId']);
  const parsed=sourceRows?.[index]?.sourceIngredient?sourceRows[index].parsed:parseIngredientLine(original,String(index));
  if(sourceRows?.[index]?.sourceIngredient&&parsed.isGroupHeader)fail('A structured ingredient cannot be removed as a heading.');
  if(parsed.isGroupHeader||submitted.excluded){rows.push({id:String(index),original,status:parsed.isGroupHeader?'header':'excluded'});nextRows.push({...submitted,selection:null,override:null,confirmed:false});continue;}
  total++;const matchKey=JSON.stringify({...parsed,id:undefined});
  if(!matchingCache.has(matchKey))matchingCache.set(matchKey,matchIngredient(parsed,{foodCatalog,foods:state.foods,limit:5,supportsQuantity:parsed.quantity!==null&&!parsed.issues.length?ref=>{const food=ref.kind==='catalog'?catalog.get(ref.id):state.foods.find(row=>row.id===ref.id);return !!food&&convertIngredient(parsed,food).status==='resolved';}:undefined}));
  const matched=matchingCache.get(matchKey);
  const selection=initial?matched.selection:submitted.selection;let food=null,conversion=null,match=null;
  if(selection!==null&&selection!==undefined){exact(selection,['kind','id']);if(!['catalog','library'].includes(selection.kind)||typeof selection.id!=='string')fail('Choose an exact ingredient.');food=selection.kind==='catalog'?catalog.get(selection.id):state.foods.find(row=>row.id===selection.id);if(!food)fail('This ingredient is no longer available.');match=assessIngredientMatch(parsed,food);conversion=convertIngredient(parsed,food,{override:submitted.override??null});}
  if(conversion?.status==='resolved'&&!positive(conversion.amount))fail('The ingredient quantity could not be calculated.');
  const status=!food?'unmatched':conversion.status!=='resolved'?'quantity-needed':match.requiresConfirmation&&!submitted.confirmed?'needs-review':'ready';
  if(conversion?.status==='resolved'){const id=String(index);records.push({...food,id});ingredients.push({foodId:id,amount:conversion.amount});known++;}else ingredients.push({foodId:'unresolved:'+index,amount:1});
  rows.push({id:String(index),original,status,selection:selection??null,food:food?{id:food.id,name:food.name,serving:food.serving,grams:food.grams,milliliters:food.milliliters,portions:food.portions??[]}:null,conversion,match,candidates:matched.candidates});
  nextRows.push({id:String(index),original,selection:selection??null,override:submitted.override??null,confirmed:submitted.confirmed===true,excluded:false});
 }
 const canSave=total>0&&rows.every(row=>['ready','header','excluded'].includes(row.status))&&(!yieldReview.requiresConfirmation||draft.yieldConfirmed===true)&&(draft.plainTextSource===undefined||draft.sourceConfirmed===true);
 const preview=total?{perServing:recipeNutrition({foods:records},{servings:draft.servings,ingredients}).nutrients,totals:recipeNutrition({foods:records},{servings:1,ingredients}).nutrients,knownIngredientCount:known,totalIngredientCount:total}:null;
 return {revision:digest(state),draft:{...draft,rows:nextRows},review:{rows,canSave,preview,yieldReview,sourceNeedsConfirmation:draft.plainTextSource!==undefined&&draft.sourceConfirmed!==true}};
}
export function prepareRecipeImportSave(state,catalog,draft){
 const result=previewRecipeImport(state,catalog,draft);if(!result.review.canSave)fail('Check ingredient matches, amounts and servings.');
 const importReview={version:1,originalIngredients:[...draft.originalIngredients],recipeYield:draft.recipeYield??null,reviewedServings:draft.servings,yieldConfirmed:draft.yieldConfirmed===true,modifiedAfterImport:false,...Object.fromEntries(['ingredientSource','jsonldSource','rdfaSource','plainTextSource'].filter(key=>draft[key]!==undefined).map(key=>[key,structuredClone(draft[key])])),...(draft.plainTextSource!==undefined?{sourceConfirmed:draft.sourceConfirmed===true}:{}),rows:result.review.rows.map(row=>({id:row.id,original:row.original,status:row.status,selection:row.selection??null,foodName:row.food?.name??null,conversion:row.conversion??null,match:row.match??null,excluded:row.status==='excluded',confirmed:draft.rows[Number(row.id)].confirmed===true,override:draft.rows[Number(row.id)].override??null}))};
 return {name:draft.name.trim(),servings:draft.servings,instructions:draft.instructions,source:draft.source,importReview,rows:result.review.rows.filter(row=>row.status==='ready').map(row=>({ref:row.selection,quantity:row.conversion.sourceQuantity}))};
}

/** Review-only handoff. Catalog identities remain references until the final recipe command. */
export function prepareRecipeImportDraft(state,catalog,draft){
 const {rows,...recipe}=prepareRecipeImportSave(state,catalog,draft);
 recipe.ingredients=rows.map(row=>({foodId:row.ref.id,...row.quantity}));
 const ingredients=rows.map((row,index)=>{const food=row.ref.kind==='catalog'?catalog.get(row.ref.id):state.foods.find(item=>item.id===row.ref.id);return {...recipe.ingredients[index],name:food.name,source:food.source??null,options:libraryQuantityOptions(state,'food',food)};});
 return {revision:digest(state),recipe,ingredients};
}
