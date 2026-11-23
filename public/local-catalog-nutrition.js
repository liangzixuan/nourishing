const DATABASE='nourishing-catalog-nutrition';
const ENDPOINT='/api/catalog/nutrition-pack';
const MAX_COMPRESSED=48*1024*1024,MAX_EXPANDED=128*1024*1024;
const SHA256=/^[a-f0-9]{64}$/;
let opening,checking,lastCheck=0,lastGeneration,decoded;

function database(){
 if(!globalThis.indexedDB)return Promise.resolve(null);
 if(!opening)opening=new Promise((resolve,reject)=>{
  const req=indexedDB.open(DATABASE,1);
  req.onupgradeneeded=()=>{
   req.result.createObjectStore('meta');
   req.result.createObjectStore('shards');
  };
  req.onsuccess=()=>{
   const db=req.result;
   db.onversionchange=()=>{db.close();opening=null;decoded=null;};
   resolve(db);
  };
  req.onerror=()=>reject(req.error);
 }).catch(()=>{opening=null;return null;});
 return opening;
}

function read(db,store,key){
 return new Promise((resolve,reject)=>{
  const req=db.transaction(store).objectStore(store).get(key);
  req.onsuccess=()=>resolve(req.result);
  req.onerror=()=>reject(req.error);
 });
}

function valid(ok){
 if(!ok)throw Error('Invalid offline nutrition catalog');
}

function parsePack(bytes){
 valid(bytes.byteLength>=4&&bytes.byteLength<=MAX_COMPRESSED);
 const size=new DataView(bytes.buffer,bytes.byteOffset).getUint32(0);
 valid(size>0&&4+size<=bytes.byteLength);
 const manifest=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes.subarray(4,4+size)));
 valid(manifest.version===1&&typeof manifest.generation==='string'&&manifest.generation&&
  Array.isArray(manifest.nutrientIds)&&manifest.nutrientIds.every(id=>typeof id==='string')&&
  new Set(manifest.nutrientIds).size===manifest.nutrientIds.length&&Array.isArray(manifest.sources)&&
  Array.isArray(manifest.shards)&&Number.isSafeInteger(manifest.count)&&manifest.count>0);
 let offset=4+size,count=0,expanded=0,last=null;
 const parts=[];
 for(const shard of manifest.shards){
  valid(typeof shard.first==='string'&&shard.first&&typeof shard.last==='string'&&
   shard.first<=shard.last&&(last===null||last<shard.first)&&
   Number.isInteger(shard.count)&&shard.count>0&&shard.count<=256&&
   Number.isSafeInteger(shard.bytes)&&shard.bytes>0&&offset+shard.bytes<=bytes.length&&
   Number.isSafeInteger(shard.expandedBytes)&&shard.expandedBytes>0&&SHA256.test(shard.sha256));
  expanded+=shard.expandedBytes;valid(expanded<=MAX_EXPANDED);
  parts.push(bytes.subarray(offset,offset+shard.bytes));offset+=shard.bytes;
  count+=shard.count;last=shard.last;
 }
 valid(count===manifest.count&&offset===bytes.length);
 return {manifest,parts};
}

async function boundedBytes(response,limit){
 const reader=response.body.getReader(),chunks=[];
 let length=0;
 try{
  for(;;){
   const {value,done}=await reader.read();
   if(done)break;
   length+=value.length;
   if(length>limit){await reader.cancel();throw Error('Catalog exceeded its byte limit');}
   chunks.push(value);
  }
 }finally{reader.releaseLock();}
 const bytes=new Uint8Array(length);let offset=0;
 for(const part of chunks){bytes.set(part,offset);offset+=part.length;}
 return bytes;
}

async function checkDigest(part,wanted){
 const raw=await crypto.subtle.digest('SHA-256',part);
 const actual=Array.from(new Uint8Array(raw),byte=>byte.toString(16).padStart(2,'0')).join('');
 valid(actual===wanted);
}

function install(db,previous,etag,manifest,parts){
 return new Promise((resolve,reject)=>{
  const tx=db.transaction(['meta','shards'],'readwrite');
  const meta=tx.objectStore('meta'),shards=tx.objectStore('shards'),current=meta.get('active');
  let installed=false;
  current.onsuccess=()=>{
   // A tab without Web Locks can finish downloading an older generation last.
   if((current.result?.etag??null)!==(previous?.etag??null))return;
   shards.clear();
   for(const [i,part] of parts.entries())shards.put(new Blob([part]),manifest.shards[i].sha256);
   meta.put({etag,manifest},'active');installed=true;
  };
  tx.oncomplete=()=>resolve(installed);
  tx.onabort=()=>reject(tx.error??Error('Offline catalog storage unavailable'));
 });
}

async function refresh(){
 const db=await database();
 if(!db||typeof DecompressionStream!=='function'||!crypto.subtle)return null;
 const existing=await read(db,'meta','active');
 const response=await fetch(ENDPOINT,{cache:'no-store',credentials:'same-origin',
  headers:existing?{'If-None-Match':existing.etag}:{}});
 if(response.status===304&&existing){lastCheck=Date.now();return lastGeneration=existing.manifest.generation;}
 if(!response.ok)return null;
 const etag=response.headers.get('etag');
 valid(/^W\/"nutrition-v1-[a-f0-9]{64}"$/.test(etag));
 const {manifest,parts}=parsePack(await boundedBytes(response,MAX_COMPRESSED));
 for(const [i,part] of parts.entries()){
  const ref=manifest.shards[i];
  await checkDigest(part,ref.sha256);
  // Verify one small member at a time before replacing a working generation.
  const rows=await decodeShard(new Blob([part]),ref);
  let previous=null;
  for(const row of rows){
   valid(typeof row.id==='string'&&(!previous||previous<row.id)&&typeof row.name==='string'&&
    SHA256.test(row.sourceFactDigest)&&Array.isArray(row.source)&&row.source.length===2&&
    Number.isInteger(row.source[0])&&manifest.sources[row.source[0]]&&row.source[1]&&typeof row.source[1]==='object'&&
    Array.isArray(row.nutrients)&&row.nutrients.length%2===0);
   const seen=new Set();
   for(let j=0;j<row.nutrients.length;j+=2){
    const key=row.nutrients[j],value=row.nutrients[j+1];
    valid(Number.isInteger(key)&&manifest.nutrientIds[key]&&!seen.has(key)&&(value===null||Number.isFinite(value)));
    seen.add(key);
   }
   previous=row.id;
  }
 }
 const installed=await install(db,existing,etag,manifest,parts);
 if(installed)decoded=null;
 lastCheck=Date.now();
 return lastGeneration=installed?manifest.generation:(await read(db,'meta','active'))?.manifest.generation;
}

// The complete previous generation remains readable until the final transaction
// commits. An interrupted download, quota error or invalid digest leaves it intact.
export function warmCatalogNutrition({force=false}={}){
 if(checking)return checking;
 if(!force&&Date.now()-lastCheck<6*60*60*1000)return Promise.resolve(lastGeneration);
 if(globalThis.navigator?.onLine===false)return Promise.resolve(null);
 const run=()=>globalThis.navigator?.locks
  ?navigator.locks.request(DATABASE,{ifAvailable:true},lock=>lock?refresh():null):refresh();
 checking=run().catch(()=>null).finally(()=>{checking=null;});
 return checking;
}

async function activePack(generation){
 const db=await database();
 if(!db)return null;
 const active=await read(db,'meta','active');
 return active&&(!generation||active.manifest.generation===generation)?{db,...active}:null;
}
export async function hasCatalogNutrition(generation){
 try{return !!await activePack(generation);}catch{return false;}
}

async function decodeShard(blob,ref){
 valid(blob&&blob.size===ref.bytes);
 const response=new Response(blob.stream().pipeThrough(new DecompressionStream('gzip')));
 const raw=await boundedBytes(response,ref.expandedBytes);
 valid(raw.length===ref.expandedBytes);
 const rows=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(raw));
 valid(Array.isArray(rows)&&rows.length===ref.count&&rows[0]?.id===ref.first&&rows.at(-1)?.id===ref.last);
 return rows;
}

export async function localCatalogNutritionFood(id,generation){
 try{
  const active=await activePack(generation);
  if(!active)return null;
  const {manifest,db}=active;
  const ref=manifest.shards.find(shard=>shard.first<=id&&shard.last>=id);
  if(!ref)return null;
  if(decoded?.hash!==ref.sha256){
   const rows=read(db,'shards',ref.sha256).then(blob=>decodeShard(blob,ref));
   decoded={hash:ref.sha256,rows};
   rows.catch(()=>{if(decoded?.rows===rows)decoded=null;});
  }
  const row=(await decoded.rows).find(food=>food.id===id);
  if(!row)return null;
  const {nutrients,source,sourceFactDigest,...food}=row;
  valid(Array.isArray(nutrients)&&nutrients.length%2===0&&Array.isArray(source)&&source.length===2&&manifest.sources[source[0]]&&SHA256.test(sourceFactDigest));
  const values={};
  for(let i=0;i<nutrients.length;i+=2){
   const key=manifest.nutrientIds[nutrients[i]];valid(key&&!Object.hasOwn(values,key));
   values[key]=nutrients[i+1];
  }
  // Only the preview and optimistic account projection consume this object.
  // Commands carry the catalog ID; the server captures the full original.
  return {...food,readOnly:true,nutrients:values,source:{...manifest.sources[source[0]],...source[1]}};
 }catch{return null;}
}