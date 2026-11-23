import test from 'node:test';
import assert from 'node:assert/strict';
import {createDataRepository} from '../server/data-repository.mjs';
test('catalog pagination ignores provider count caps and detects the last page',async()=>{
 let size=6;
 const db={async getRow(){return {generation:'catalog',count:34885};},async listRows(){return {total:5000,rows:Array.from({length:size},(_,i)=>({compact:JSON.stringify({id:`food-${i}`})}))};}};
 const repo=createDataRepository(db,'owner');
 const beyondCap=await repo.search({query:'rice',offset:5000,limit:5});
 assert.equal(beyondCap.items.length,5);assert.equal(beyondCap.nextOffset,5005);assert.equal(beyondCap.total,null);
 size=5;const last=await repo.search({query:'',offset:34880,limit:5});assert.equal(last.nextOffset,null);assert.equal(last.total,34885);
});

test('catalog page details cap canonical bytes and preserve each selected source record',async()=>{
 const {diaryStoreFixture}=await import('./fixtures/diary-store.mjs');
 const {initialState}=await import('../server/domain/workspace.mjs');
 const {rowId}=await import('../server/data-codec.mjs');
 const store=diaryStoreFixture(initialState()),head='gen';
 store.table('catalog_heads').set('active',{generation:head});
 const foods=[{id:'a',nutrients:{sodium:0},source:{attribution:'source'},portions:[]},{id:'b',notes:'x'.repeat(1024*1024)}];
 for(const food of foods){
   const id=rowId(head,food.id);
   store.table('catalog_foods').set(id,{$id:id,generation:head,sourceId:food.id,payload:JSON.stringify(food)});
 }
 const repo=createDataRepository(store.db,'fixture');
 assert.deepEqual(await repo.catalogFoodDetails(['a','b','missing']),{generation:head,foods:[foods[0]]});
});
