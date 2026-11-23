import test from 'node:test';
import assert from 'node:assert/strict';
import {gzipSync,gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {createWebHandler} from '../server/http.mjs';
import {createCatalogIndexLoader,decodeCatalogIndex,encodeCatalogIndex,projectCatalogIndexFood} from '../server/catalog-index.mjs';
import {initialState} from '../server/domain/workspace.mjs';
import {applyWorkspaceCommand} from '../server/workspace-commands.mjs';
function fixture(generation='one'){
 const food={id:'fixture',name:'Fixture oats',grams:100,serving:'100 g',nutrients:{protein:10}},data=encodeCatalogIndex({generation,catalogDigest:'digest',foods:[food],sourceFactDigests:{fixture:'facts'}}),bytes=gzipSync(data);
 const ref={version:2,bucketId:'catalog-index',fileId:'fixture',sha256:createHash('sha256').update(bytes).digest('hex'),bytes:bytes.length,expandedBytes:data.length};
 return {bytes,head:{generation,digest:'digest',count:1,metadata:JSON.stringify({insightIndex:ref})},food};
}
test('catalog artifact verifies content and generation and only shares public facts',async()=>{
 const {bytes,head}=fixture();let reads=0;const storage={getFile:async()=>({sizeOriginal:bytes.length}),getFileDownload:async()=>{reads++;return bytes;}},load=createCatalogIndexLoader();
 const [a,b]=await Promise.all([load({head,storage,namespace:'project'}),load({head,storage,namespace:'project'})]);assert.equal(a,b);assert.equal(reads,1);assert.equal(a.get('fixture').name,'Fixture oats');
 let disposed=0;const dispose=a.disposeSearch;a.disposeSearch=()=>{disposed++;dispose();};
 await load({head,storage,namespace:'another project'});assert.equal(reads,2);assert.equal(disposed,1);
 assert.throws(()=>a.searchWorkspace('',{options:{}}),/Food search is being prepared/);
 assert.throws(()=>decodeCatalogIndex(Buffer.from('corrupt'),head));assert.throws(()=>decodeCatalogIndex(bytes,{...head,generation:'wrong'}));
 const bad={...head,metadata:JSON.stringify({...JSON.parse(head.metadata),insightIndex:{...JSON.parse(head.metadata).insightIndex,expandedBytes:1}})};assert.throws(()=>decodeCatalogIndex(bytes,bad));
});
test('client nutrition pack preserves sorted source foods, portion units, measured zero and missing values',async()=>{
 const foods=Array.from({length:258},(_,i)=>({id:'id-'+String(257-i).padStart(3,'0'),name:'Food '+i,serving:'1 cup',grams:125,
  portions:[{name:'1 spoon',grams:15}],nutrients:{protein:i,calories:0},source:{datasetId:'fixture',foodCode:String(i)},...(i===0?{sample:true}:{})}));
 const digests=Object.fromEntries(foods.map(f=>[f.id,'facts-'+f.id]));
 const raw=encodeCatalogIndex({generation:'test',catalogDigest:'digest',foods,sourceFactDigests:digests});
 const bytes=gzipSync(raw),ref={version:2,bytes:bytes.length,expandedBytes:raw.length,sha256:createHash('sha256').update(bytes).digest('hex')};
 const catalog=decodeCatalogIndex(bytes,{generation:'test',digest:'digest',count:258,metadata:JSON.stringify({insightIndex:ref})});
 const [pack,again]=await Promise.all([catalog.clientNutritionPack(),catalog.clientNutritionPack()]);assert.equal(pack,again);
 let offset=4+pack.readUInt32BE(0);
 const header=JSON.parse(pack.subarray(4,offset));assert.equal(header.count,257);assert.equal(header.generation,'test');assert.equal(header.shards.length,2);
 const expected=foods.filter(f=>!f.sample).reverse();let seen=0;
 for(const shard of header.shards){
  const member=pack.subarray(offset,offset+shard.bytes);offset+=shard.bytes;
  assert.equal(createHash('sha256').update(member).digest('hex'),shard.sha256);
  const data=gunzipSync(member);assert.equal(data.length,shard.expandedBytes);const rows=JSON.parse(data);assert.equal(rows.length,shard.count);
  assert.equal(rows[0].id,shard.first);assert.equal(rows.at(-1).id,shard.last);
  for(const row of rows){
   const nutrients={};for(let i=0;i<row.nutrients.length;i+=2)nutrients[header.nutrientIds[row.nutrients[i]]]=row.nutrients[i+1];
   const {sourceFactDigest,...food}=row;assert.equal(sourceFactDigest,digests[row.id]);
   assert.deepEqual({...food,nutrients,source:{...header.sources[row.source[0]],...row.source[1]}},expected[seen++]);
  }
 }
 assert.equal(seen,header.count);assert.equal(offset,pack.length);
});

test('nutrient pack download requires a session and revalidates without sending the bytes again',async()=>{
 const origin='https://nourishing.test',bytes=Buffer.from([0,1,2,255]),etag='W/"nutrition-v1-fixture"';
 const calls=[],handle=createWebHandler({config:{origin},service:{catalogNutritionPack:async(secret,known)=>{
  calls.push({secret,known});return {etag,bytes:known===etag?null:bytes};
 }}});
 const read=(path='',headers={})=>handle(new Request(origin+'/api/catalog/nutrition-pack'+path,{headers}));
 const session={cookie:'__Host-nourishing_session=fixture'};
 assert.equal((await read()).status,401);assert.equal((await read('?id=1',session)).status,400);assert.equal(calls.length,0);
 const first=await read('',session);assert.equal(first.status,200);assert.equal(first.headers.get('etag'),etag);
 assert.equal(first.headers.get('content-type'),'application/octet-stream');assert.deepEqual(Buffer.from(await first.arrayBuffer()),bytes);
 const current=await read('',{...session,'if-none-match':etag});assert.equal(current.status,304);assert.equal(await current.text(),'');
 assert.deepEqual(calls,[{secret:'fixture',known:null},{secret:'fixture',known:etag}]);
});

test('published search projection takes canonical compact categories and marks complete search metadata',()=>{
 const food={id:'fixture',name:'Apple juice',grams:100,serving:'100 g',nutrients:{protein:1},source:{name:'USDA',datasetId:'sr-legacy-2018-04',fdcId:1}},category={id:'usda-category:14',name:'Beverages'},projected=projectCatalogIndexFood(food,{id:food.id,category});
 assert.deepEqual(projected.category,category);assert.equal(food.category,undefined);assert.throws(()=>projectCatalogIndexFood(food,{id:'other'}),/identity/);
 const expanded=encodeCatalogIndex({generation:'g',catalogDigest:'d',foods:[projected],sourceFactDigests:{fixture:'f'},searchVersion:1}),bytes=gzipSync(expanded),metadata={datasets:[{id:'sr-legacy-2018-04',name:'USDA',foodCount:1}],insightIndex:{version:2,sha256:createHash('sha256').update(bytes).digest('hex'),bytes:bytes.length,expandedBytes:expanded.length}},adapter=decodeCatalogIndex(bytes,{generation:'g',digest:'d',count:1,metadata:JSON.stringify(metadata)});
 try{assert.equal(adapter.searchWorkspace('',{options:{category:'beverages'},libraryRows:[]}).items[0].id,'fixture');}finally{adapter.disposeSearch();}
});
test('meal logging validates entire batch before changing the diary',()=>{
 const state=initialState(),{food}=fixture();state.foods.push(food);const input={type:'meal.log',payload:{date:'2026-11-14',group:'Lunch',time:'12:00',rows:[{foodId:food.id,quantity:50,unit:'g'},{foodId:'missing',quantity:20,unit:'g'}]}};
 assert.throws(()=>applyWorkspaceCommand(state,input));assert.equal(state.entries.length,0);input.payload.rows.pop();assert.equal(applyWorkspaceCommand(state,input).entryIds.length,1);assert.equal(state.entries[0].quantity,50);
 assert.throws(()=>applyWorkspaceCommand(state,{...input,payload:{...input.payload,rows:[{foodId:food.id,quantity:50,unit:'g',nutrients:{protein:100}}]}}));
});
