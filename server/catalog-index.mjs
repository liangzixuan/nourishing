import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import {createInsightCatalog} from './food-insights.mjs';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const unavailable=()=>{throw Object.assign(Error('Food insights are being prepared.'),{code:503,publicMessage:'Food insights are being prepared.'});};
// Repeated nutrient keys and dataset credits dominate the JSON catalog. Store each
// once; decoding shares immutable strings while preserving each food's own facts.
export function encodeCatalogIndex({generation,catalogDigest,foods,sourceFactDigests}){
 const nutrientIds=[...new Set(foods.flatMap(food=>Object.keys(food.nutrients)))],nutrientIndex=new Map(nutrientIds.map((id,i)=>[id,i])),sources=[],sourceIndex=new Map();
 const commonKeys=['name','datasetId','dataset','provider','measurementBasis','releaseDate','url','archiveSha256','license','licenseUrl','attribution','retrievedAt'];
 const records=foods.map(food=>{
  const common=Object.fromEntries(commonKeys.filter(key=>food.source?.[key]!==undefined).map(key=>[key,food.source[key]])),key=JSON.stringify(common);let index=sourceIndex.get(key);
  if(index===undefined){index=sources.length;sources.push(common);sourceIndex.set(key,index);}
  return {...food,nutrients:Object.entries(food.nutrients).flatMap(([id,value])=>[nutrientIndex.get(id),value]),source:[index,Object.fromEntries(Object.entries(food.source??{}).filter(([key])=>!commonKeys.includes(key)))]};
 });
 return Buffer.from(JSON.stringify({version:2,generation,catalogDigest,nutrientIds,sources,foods:records,sourceFactDigests}));
}
export function decodeCatalogIndex(bytes,head){
 const metadata=JSON.parse(head.metadata),ref=metadata.insightIndex;
 if(!ref||ref.version!==2||!Number.isSafeInteger(ref.bytes)||ref.bytes<1||ref.bytes>32*1024*1024||!Number.isSafeInteger(ref.expandedBytes)||ref.expandedBytes<1||ref.expandedBytes>128*1024*1024||bytes.length!==ref.bytes||sha(bytes)!==ref.sha256)unavailable();
 const decoded=gunzipSync(bytes,{maxOutputLength:ref.expandedBytes});if(decoded.length!==ref.expandedBytes)unavailable();
 const value=JSON.parse(decoded);
 if(value.version!==2||value.generation!==head.generation||value.catalogDigest!==head.digest||!Array.isArray(value.foods)||value.foods.length!==head.count||Object.keys(value.sourceFactDigests??{}).length!==head.count||!Array.isArray(value.nutrientIds)||!Array.isArray(value.sources))unavailable();
 for(const food of value.foods){
  if(!Array.isArray(food.source)||food.source.length!==2||!value.sources[food.source[0]])unavailable();
  food.source={...value.sources[food.source[0]],...food.source[1]};
 }
 return createInsightCatalog(value.foods,{metadata,sourceFactDigests:value.sourceFactDigests,nutrientIds:value.nutrientIds});
}
// Only public catalog facts are shared. Account state never enters this cache.
export function createCatalogIndexLoader(){
 let cached;
 return async function load({storage,head,namespace}){
  const ref=JSON.parse(head.metadata).insightIndex;if(!ref||ref.bucketId!=='catalog-index'||typeof ref.fileId!=='string'||!/^[a-f0-9]{64}$/.test(ref.sha256??''))unavailable();
  const key=JSON.stringify([namespace,head.generation,head.digest,head.count,ref]);
  if(cached?.key===key)return cached.promise;
  const entry={key,promise:null};entry.promise=(async()=>{
   const file=await storage.getFile({bucketId:ref.bucketId,fileId:ref.fileId});if(file.sizeOriginal!==ref.bytes)unavailable();
   return decodeCatalogIndex(Buffer.from(await storage.getFileDownload({bucketId:ref.bucketId,fileId:ref.fileId})),head);
  })().catch(error=>{if(cached===entry)cached=null;throw error;});cached=entry;return entry.promise;
 };
}
export const loadCatalogIndex=createCatalogIndexLoader();
