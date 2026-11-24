import {reviewCanBeSaved,signedReviewLifetimeMs} from './domain/signed-review-time.mjs';
import {parseEnergyUnit,convertEnergy} from './domain/energy-units.mjs';
import {createHmac,timingSafeEqual} from 'node:crypto';
import {getBarcodeProduct,searchOpenFoodFacts} from './domain/open-food-facts.mjs';
import {getUsdaBrandedProduct,lookupUsdaBrandedByBarcode,searchUsdaBranded} from './domain/usda-branded.mjs';
import {act,normalizeLibraryDraft,previewDiaryItem} from './domain/workspace.mjs';
import {libraryItem} from './library-view.mjs';
import {digest} from './data-codec.mjs';

export const BARCODE_BODY_BYTES=128*1024;
export const barcodeCommandFields={'barcode.log':['reviewToken','date','time','group','amount','quantity','unit','portionId','saveOnly']};
const fail=(message,code=400)=>{throw Object.assign(Error(message),{code,status:code,publicMessage:message});};
function keys(value,allowed){if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!allowed.includes(k)))fail('Invalid barcode fields.');}
const signingKey=secret=>{if(typeof secret!=='string'||secret.length<32)fail('Food lookup is unavailable.',503);return secret;};
const mac=(encoded,secret)=>createHmac('sha256',signingKey(secret)).update('nourishing:barcode-review:v1\0'+encoded).digest();
function ownerRequired(owner){if(typeof owner!=='string'||!owner)fail('Please sign in.',401);}
export function validateBarcodeLookup(input){
 keys(input,['code','scan','fdcId']);
 const hasCode=input.code!==undefined,hasFdc=input.fdcId!==undefined;
 if(hasCode===hasFdc)fail('Enter a barcode with 8 to 14 digits.');
 if(hasFdc){
  if(!Number.isSafeInteger(input.fdcId)||input.fdcId<=0||input.scan!==undefined)fail('Invalid USDA FDC ID.');
  return input;
 }
 if(typeof input.code!=='string'||!/^\d{8,14}$/.test(input.code))fail('Enter a barcode with 8 to 14 digits.');
 const scan=input.scan;if(scan!==undefined){keys(scan,['format','decoder','rawCode']);if(!['EAN8','EAN13','UPCA','UPCE','ITF14','ITF'].includes(scan.format)||typeof scan.decoder!=='string'||!scan.decoder.trim()||scan.decoder.length>200||(scan.rawCode!==undefined&&(typeof scan.rawCode!=='string'||!/^\d{8}$/.test(scan.rawCode)||scan.format!=='UPCE')))fail('Scan the barcode again.');}
 return input;
}
export function validateBrandedSearch(input){
 keys(input,['q','page','lang']);
 if(typeof input.q!=='string'||input.q.trim().length<2||input.q.length>200||!Number.isSafeInteger(input.page??1)||(input.page??1)<1||(input.page??1)>100)fail('Enter a product name.');
 if(input.lang!==undefined&&(typeof input.lang!=='string'||!/^[a-z]{2}(?:-[A-Z]{2})?$/.test(input.lang)))fail('Invalid language.');
 return {q:input.q.trim(),page:input.page??1,lang:input.lang??'en'};
}
export function signBarcodeReview(food,{owner,reviewSecret,now=Date.now()}){
 ownerRequired(owner);const encoded=Buffer.from(JSON.stringify({version:1,owner,issued:now,expires:now+signedReviewLifetimeMs,food})).toString('base64url');
 const token=encoded+'.'+mac(encoded,reviewSecret).toString('base64url');if(Buffer.byteLength(token)>BARCODE_BODY_BYTES-4096)fail('This product has too much source data.',502);return token;
}
export function verifyBarcodeReview(token,{owner,reviewSecret,now=Date.now(),reviewSavedAt}){
 ownerRequired(owner);if(typeof token!=='string'||token.length>BARCODE_BODY_BYTES||!/^[-\w]+\.[-\w]{43}$/.test(token))fail('Look up this product again.',409);
 const [encoded,signature]=token.split('.'),expected=mac(encoded,reviewSecret),received=Buffer.from(signature,'base64url');
 if(received.length!==expected.length||!timingSafeEqual(expected,received))fail('Look up this product again.',409);
 let review;try{review=JSON.parse(Buffer.from(encoded,'base64url').toString('utf8'));}catch{fail('Look up this product again.',409);}
 if(review.version!==1||review.owner!==owner||!reviewCanBeSaved(review.issued,review.expires,now,reviewSavedAt))fail('Look up this product again.',409);
 return review.food;
}
function withFood(state,food){
 const candidate=structuredClone(state),existing=candidate.foods.find(row=>row.id===food.id);
 if(existing&&(existing.retired||digest(existing)!==digest(food)))fail('This food changed. Choose it from My Foods.',409);
 if(!existing)candidate.foods.push(structuredClone(food));return candidate;
}
export async function lookupBarcode(state,input,context={}){
 validateBarcodeLookup(input);ownerRequired(context.owner);signingKey(context.reviewSecret);
 const usdaApiKey=context.usdaApiKey??process.env.USDA_FDC_API_KEY??'';
 let draft;
 if(input.fdcId!==undefined){
  try{draft=await getUsdaBrandedProduct(input.fdcId,{apiKey:usdaApiKey,fetchImpl:context.fetchImpl});}
  catch(error){if(error.status)Object.assign(error,{code:error.status,publicMessage:error.message});throw error;}
 }else{
  try{draft=await getBarcodeProduct(input.code,{fetchImpl:context.fetchImpl});}
  catch(error){
   if(usdaApiKey&&error.errorCode==='barcode.productNotFound'){
    try{draft=await lookupUsdaBrandedByBarcode(input.code,{apiKey:usdaApiKey,fetchImpl:context.fetchImpl});}catch{}
   }
   if(!draft){if(error.status)Object.assign(error,{code:error.status,publicMessage:error.message});throw error;}
  }
  if(draft.barcode!==input.code)fail('The provider returned another product.',502);
 }
 const source=input.scan?{...draft.source,barcodeScan:{format:input.scan.format,decoder:input.scan.decoder,decodedIdentifier:input.code,...(input.scan.rawCode?{compressedIdentifier:input.scan.rawCode}:{})}}:draft.source;
 const normalized=normalizeLibraryDraft(state,'food',{...draft,id:undefined,source});delete normalized.id;
 const food={...normalized,id:(input.fdcId!==undefined?'branded:':'barcode:')+digest(normalized)},candidate=withFood(state,food);
 return {...libraryItem(candidate,'food',food),energyUnit:parseEnergyUnit(state.settings.energyUnit??'kcal'),reviewToken:signBarcodeReview(food,context),revision:digest(state)};
}
export async function searchBranded(input,{fetchImpl,usdaApiKey=process.env.USDA_FDC_API_KEY??''}={}){
 const {q,page,lang}=validateBrandedSearch(input);
 if(!usdaApiKey){
  try{return await searchOpenFoodFacts(q,{page,lang,fetchImpl});}
  catch(error){if(error.status)Object.assign(error,{code:error.status,publicMessage:error.message});throw error;}
 }
 const [usdaRes,offRes]=await Promise.allSettled([
  searchUsdaBranded(q,{page,pageSize:15,apiKey:usdaApiKey,fetchImpl}),
  searchOpenFoodFacts(q,{page,pageSize:15,lang,fetchImpl}),
 ]);
 const usda=usdaRes.status==='fulfilled'?usdaRes.value:null;
 const off=offRes.status==='fulfilled'?offRes.value:null;
 if(!usda&&!off){
  const err=usdaRes.reason??offRes.reason;
  if(err?.status)Object.assign(err,{code:err.status,publicMessage:err.message});
  throw err;
 }
 const items=[],seenBarcodes=new Set();
 for(const item of usda?.items??[]){
  if(item.barcode)seenBarcodes.add(item.barcode.replace(/^0+/,''));
  items.push(item);
 }
 for(const item of off?.items??[]){
  const norm=item.barcode?.replace(/^0+/,'');
  if(norm&&seenBarcodes.has(norm))continue;
  items.push({...item,provider:'open-food-facts'});
 }
 return {
  items,
  page,
  pageSize:items.length,
  total:(usda?.total??0)+(off?.total??0)||null,
  nextPage:usda?.nextPage??off?.nextPage??null,
  source:[usda?'USDA Branded Foods':null,off?'Open Food Facts':null].filter(Boolean).join(' + '),
  license:[usda?'CC0 1.0':null,off?'ODbL':null].filter(Boolean).join(' · '),
  noteCode:'review-current-label',
  note:'Search names are suggestions. Open the current product and check the package label before saving.',
 };
}
export function validateBarcodeAction({payload}){keys(payload,barcodeCommandFields['barcode.log']);if(typeof payload.reviewToken!=='string'||payload.reviewToken.length>BARCODE_BODY_BYTES)fail('Look up this product again.');if(payload.saveOnly!==undefined&&typeof payload.saveOnly!=='boolean')fail('Choose a save action.');return payload;}
export function previewBarcode(state,input,context){
 validateBarcodeAction({payload:input});const food=verifyBarcodeReview(input.reviewToken,context),candidate=withFood(state,food),{reviewToken,saveOnly,...entry}=input;
 const preview=previewDiaryItem(candidate,{...entry,foodId:food.id}),unit=parseEnergyUnit(state.settings.energyUnit??'kcal');
 return {...preview,energy:{value:convertEnergy(preview.nutrition.totals.calories??null,'kcal',unit),unit}};
}
export function applyBarcodeLog(state,payload,context){
 validateBarcodeAction({payload});const food=verifyBarcodeReview(payload.reviewToken,context),candidate=withFood(state,food),{reviewToken,saveOnly,...entry}=payload,count=candidate.entries.length;
 if(!saveOnly)act(candidate,'entry.add',{...entry,foodId:food.id});
 const entries=candidate.entries.slice(count);Object.assign(state,candidate);
 return {kind:'food',id:food.id,entryIds:entries.map(row=>row.id),records:{foods:[food],entries}};
}
