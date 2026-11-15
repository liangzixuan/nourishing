import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {unpackWorkspace,digest} from '../server/data-codec.mjs';
import {createWorkspaceStore} from '../server/workspace-store.mjs';
import {lookupBarcode} from '../server/barcode.mjs';
const owner='fixture',context={owner,reviewSecret:'fixture-signing-secret-at-least-32-bytes',now:1700000000000,asOf:'2026-11-15T12:00:00Z',timeZone:'UTC'};
function fixture(){
 const tables=new Map(),transactions=new Map();let failCommit=false,lostReply=false;
 const table=name=>{if(!tables.has(name))tables.set(name,new Map());return tables.get(name);},missing=()=>{throw {code:404};};
 const db={async getRow({tableId,rowId}){return structuredClone(table(tableId).get(rowId)??missing());},async listRows({tableId,queries=[]}){let rows=[...table(tableId).values()],limit=100;for(const raw of queries){const q=JSON.parse(raw);if(q.method==='equal')rows=rows.filter(r=>q.values.includes(r[q.attribute]));if(q.method==='limit')limit=q.values[0];}return {rows:structuredClone(rows.slice(0,limit))};},async createTransaction(){const $id=randomUUID();transactions.set($id,[]);return {$id};},async createRow(input){transactions.get(input.transactionId).push(['create',input]);},async updateRow(input){transactions.get(input.transactionId).push(['update',input]);},async deleteRow(input){transactions.get(input.transactionId).push(['delete',input]);},async updateTransaction({transactionId,commit}){const operations=transactions.get(transactionId);if(!commit){transactions.delete(transactionId);return;}if(failCommit){failCommit=false;throw Error('Commit failed');}for(const [op,input]of operations){const rows=table(input.tableId);if(op==='delete')rows.delete(input.rowId);else rows.set(input.rowId,{...(rows.get(input.rowId)??{}),...structuredClone(input.data),$id:input.rowId,...(input.permissions?{$permissions:input.permissions}:{})});}transactions.delete(transactionId);if(lostReply){lostReply=false;throw Error('Lost reply');}}};
 return {db,table,fail(){failCommit=true;},lose(){lostReply=true;},state(){const head=table('workspace_heads').get(owner);return unpackWorkspace(head,[...table('workspace_records').values()].filter(r=>r.generation===head.generation));}};
}
const review=state=>lookupBarcode(state,{code:'4006381333931'},{...context,fetchImpl:async()=>Response.json({product:{code:'4006381333931',product_name:'Fixture',nutrition:{aggregated_set:{per:'100g',preparation:'as_sold',nutrients:{'energy-kcal':{value:100,unit:'kcal',source:'packaging'}}}}}})});
test('real command transaction atomically saves food/entry/streak and replays receipt after token expiry',async()=>{
 const f=fixture(),store=createWorkspaceStore(f.db,owner);await store.create();const state=f.state(),looked=await review(state),input={requestId:randomUUID(),revision:digest(state),type:'barcode.log',payload:{reviewToken:looked.reviewToken,date:'2026-11-15',time:'12:00',group:'Lunch',amount:1}};
 f.lose();const saved=await store.command(input,async()=>null,context);assert.equal(f.state().entries.length,1);assert.equal(saved.entryIds.length,1);assert.equal(f.table('command_receipts').size,1);
 assert.ok(f.state().loggingStreaks.events.length>0);assert.deepEqual(await store.command(input,async()=>{throw Error('No catalog replay');},{...context,now:context.now+99999999}),saved);assert.equal(f.state().entries.length,1);
 await assert.rejects(store.command({...input,requestId:randomUUID()},async()=>null,context),{code:409});
 await assert.rejects(store.command({...input,payload:{...input.payload,amount:2}},async()=>null,context),{code:409});
});
test('failed commit and invalid owner never leave a saved food, diary entry or receipt',async()=>{
 const f=fixture(),store=createWorkspaceStore(f.db,owner);await store.create();const state=f.state(),looked=await review(state),input={requestId:randomUUID(),revision:digest(state),type:'barcode.log',payload:{reviewToken:looked.reviewToken,date:'2026-11-15',time:'12:00',group:'Lunch',amount:1}};
 f.fail();await assert.rejects(store.command(input,async()=>null,context),/Commit failed/);assert.deepEqual(f.state(),state);assert.equal(f.table('command_receipts').size,0);
 await assert.rejects(store.command(input,async()=>null,{...context,owner:'other'}),{code:409});assert.deepEqual(f.state(),state);
 const result=await store.command(input,async()=>null,context);assert.equal(result.entryIds.length,1);assert.equal(f.state().entries.length,1);
});
