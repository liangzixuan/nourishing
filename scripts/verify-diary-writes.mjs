import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {ID,Query} from 'node-appwrite';
import {operator,allRows,databaseId} from './operator.mjs';
import {createWorkspaceStore} from '../server/workspace-store.mjs';
import {createDataRepository} from '../server/data-repository.mjs';
import {digest} from '../server/data-codec.mjs';
const {users,db}=operator(),owner=ID.unique(),store=createWorkspaceStore(db,owner),repo=createDataRepository(db,owner),report={at:new Date().toISOString(),checks:[]};let created=false;
writeFileSync('.local/diary-write-fixture.json',JSON.stringify({owner}));
try{
 await users.create({userId:owner,email:`diary-${owner}@example.com`,password:randomUUID()+'Aa1!',name:'Diary write fixture'});created=true;
 await store.create();await store.create();let state=await repo.readState();assert.equal(state.foods.length,0);assert.equal(state.entries.length,0);
 const selected=(await repo.search({query:'rice cooked',limit:1})).items[0];assert.ok(selected);
 const readFood=async id=>(await repo.food(id)).food;
 const command={requestId:randomUUID(),revision:digest(state),type:'entry.add',payload:{foodId:selected.id,date:'2026-11-14',group:'Lunch',time:'12:00',quantity:150,unit:'g'}};
 const result=await store.command(command,readFood);assert.equal((await repo.readState()).entries.length,1);
 assert.deepEqual(await store.command(command,readFood),result);assert.equal((await repo.readState()).entries.length,1);
 await assert.rejects(()=>store.command({...command,requestId:randomUUID()},readFood),error=>error.code===409);
 state=await repo.readState();const entry=state.entries[0],revision=digest(state);
 await assert.rejects(()=>store.command({requestId:randomUUID(),revision,type:'entry.update',payload:{id:entry.id,quantity:100,unit:'invented'}},readFood));assert.equal(digest(await repo.readState()),revision);
 const base={revision,type:'entry.update'};
 const parallel=await Promise.allSettled([100,200].map(quantity=>store.command({...base,requestId:randomUUID(),payload:{id:entry.id,quantity,unit:'g'}},readFood)));
 assert.equal(parallel.filter(r=>r.status==='fulfilled').length,1);assert.equal(parallel.filter(r=>r.status==='rejected'&&r.reason.code===409).length,1);
 state=await repo.readState();assert.ok([100,200].includes(state.entries[0].quantity));
 await store.command({requestId:randomUUID(),revision:digest(state),type:'entry.delete',payload:{id:entry.id}},readFood);assert.equal((await repo.readState()).entries.length,0);
 report.checks=['empty account initialization','add and immutable catalog capture','retry without duplicate','stale revision rejection','invalid edit rollback','concurrent edit conflict','delete'];
}finally{
 for(const tableId of ['command_receipts','workspace_records','workspace_media']){for(const row of await allRows(db,tableId,[Query.equal('ownerId',owner)]))await db.deleteRow({databaseId,tableId,rowId:row.$id});}
 try{await db.deleteRow({databaseId,tableId:'workspace_heads',rowId:owner});}catch(error){if(error.code!==404)throw error;}
 if(created)await users.delete({userId:owner});
}
report.status='passed';report.fixtureRemoved=true;writeFileSync('.local/diary-write-verification.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
