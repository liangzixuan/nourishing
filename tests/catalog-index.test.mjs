import test from 'node:test';
import assert from 'node:assert/strict';
import {gzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {createCatalogIndexLoader,decodeCatalogIndex,encodeCatalogIndex} from '../server/catalog-index.mjs';
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
 await load({head,storage,namespace:'another project'});assert.equal(reads,2);
 assert.throws(()=>decodeCatalogIndex(Buffer.from('corrupt'),head));assert.throws(()=>decodeCatalogIndex(bytes,{...head,generation:'wrong'}));
 const bad={...head,metadata:JSON.stringify({...JSON.parse(head.metadata),insightIndex:{...JSON.parse(head.metadata).insightIndex,expandedBytes:1}})};assert.throws(()=>decodeCatalogIndex(bytes,bad));
});
test('meal logging validates entire batch before changing the diary',()=>{
 const state=initialState(),{food}=fixture();state.foods.push(food);const input={type:'meal.log',payload:{date:'2026-11-14',group:'Lunch',time:'12:00',rows:[{foodId:food.id,quantity:50,unit:'g'},{foodId:'missing',quantity:20,unit:'g'}]}};
 assert.throws(()=>applyWorkspaceCommand(state,input));assert.equal(state.entries.length,0);input.payload.rows.pop();assert.equal(applyWorkspaceCommand(state,input).entryIds.length,1);assert.equal(state.entries[0].quantity,50);
 assert.throws(()=>applyWorkspaceCommand(state,{...input,payload:{...input.payload,rows:[{foodId:food.id,quantity:50,unit:'g',nutrients:{protein:100}}]}}));
});
