import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {initialState} from '../server/domain/workspace.mjs';
import {packWorkspace,unpackWorkspace,digest} from '../server/data-codec.mjs';
import {createWorkspaceStore} from '../server/workspace-store.mjs';
import {backupManifest,inspectBackup,prepareBackupRestore} from '../server/backup.mjs';
import {stageBackupRows} from '../server/backup-store.mjs';
import {installHealthExportMetadata,readHealthExportState,HEALTH_EXPORT_FAMILIES} from '../server/health-export-state.mjs';
const namespace='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222',scope='33333333-3333-4333-8333-333333333333';
const metadata=()=>({version:1,namespace,drafts:[],policies:[{namespace,kind:'nutrition',date:'2026-11-14',timeZone:'UTC',revision:1,groups:[{anchorId:'a',entryIds:['a','b']}],memberIds:['a','b']}]});
const installed=()=>{const state=initialState();installHealthExportMetadata(state,metadata(),{saveScope:scope});return state;};
const owner='fixture-owner';
async function restore(current,incoming){
 const manifest=backupManifest(incoming,[]),{review}=inspectBackup(current,{manifest,revision:digest(current)},{ownerId:owner});
 const input={requestId:randomUUID(),reviewToken:review.token,confirmation:'replace'};
 const context={ownerId:owner,review,readMedia:async()=>{throw Error('No photos expected');}};
 const result=await prepareBackupRestore(current,manifest,input,context),retry=await prepareBackupRestore(current,manifest,input,context);assert.deepEqual(result,retry);
 return result.state;
}
test('backup preserves metadata, rotates scope deterministically and retains native history',async()=>{
 const current=installed(),incoming=installed();incoming.healthIntakePolicies=[];
 const before=structuredClone(current),result=await restore(current,incoming);
 assert.equal(result.healthExportState.namespace,namespace);assert.notEqual(result.healthExportState.saveScope,scope);
 assert.deepEqual(result.healthIntakePolicies,[{...metadata().policies[0],revision:2,groups:[]}]);assert.deepEqual(current,before);
});
test('older backups preserve current lineage and grouping; unknown migrated lineage stays absent',async()=>{
 const current=installed(),result=await restore(current,initialState());
 assert.equal(result.healthExportState.namespace,namespace);assert.notEqual(result.healthExportState.saveScope,scope);
 assert.deepEqual(result.healthIntakePolicies[0].groups,current.healthIntakePolicies[0].groups);
 const old=await restore(initialState(),initialState());assert.equal(readHealthExportState(old),null);
});
test('foreign and incomplete metadata fail at backup inspection before writes',()=>{
 const current=installed(),incoming=installed();incoming.healthExportState.namespace=other;
 assert.throws(()=>inspectBackup(current,{manifest:backupManifest(incoming,[]),revision:digest(current)},{ownerId:owner}),{code:409});
 for(const family of HEALTH_EXPORT_FAMILIES){const bad=installed();delete bad[family];assert.throws(()=>backupManifest(bad,[]),{code:400});}
});
test('partially committed staging retries the same restored scope and immutable generation rows',async()=>{
 const current=installed(),incoming=initialState();incoming.notes=Array.from({length:205},(_,n)=>({id:'fixture-'+n,date:'2026-11-14',text:'Fixture note'}));
 const manifest=backupManifest(incoming,[]),{review}=inspectBackup(current,{manifest,revision:digest(current)},{ownerId:owner});
 const input={requestId:randomUUID(),reviewToken:review.token,confirmation:'replace'},context={ownerId:owner,review,readMedia:async()=>{throw Error('No photos');}};
 const staged=new Map();let drop=true;
 const db={async listRows({queries}){return {rows:JSON.parse(queries[0]).values.filter(id=>staged.has(id)).map(id=>structuredClone(staged.get(id)))};},async createRows({rows}){for(const row of rows){assert.equal(staged.has(row.$id),false);staged.set(row.$id,structuredClone(row));}if(drop){drop=false;throw Error('Lost staging reply');}return {rows};}};
 const first=await prepareBackupRestore(current,manifest,input,context),packed=packWorkspace(first.state,owner,'staged-generation');
 await assert.rejects(()=>stageBackupRows(db,packed.rows),/Lost staging reply/);assert.ok(staged.size>0&&staged.size<packed.rows.length);
 const second=await prepareBackupRestore(current,manifest,input,context),retried=packWorkspace(second.state,owner,'staged-generation');assert.deepEqual(retried,packed);
 await stageBackupRows(db,retried.rows);assert.deepEqual(unpackWorkspace(retried.head,[...staged.values()]),first.state);
});

// Transaction adapter executes the production store and can interleave an independent commit.
function database(seed){
 const tables=new Map(),pending=new Map();let sequence=0,transactions=0,onGuard;
 const key=(table,id)=>table+':'+id;
 if(seed){const packed=packWorkspace(seed,owner,'fixture-generation');tables.set(key('workspace_heads',owner),{$id:owner,$updatedAt:'seed',...packed.head});for(const row of packed.rows)tables.set(key('workspace_records',row.$id),row);}
 const db={
  async getRow({tableId,rowId}){const row=tables.get(key(tableId,rowId));if(!row)throw Object.assign(Error('Missing'),{code:404});return structuredClone(row);},
  async listRows({tableId,queries}){let rows=[...tables.entries()].filter(([k])=>k.startsWith(tableId+':')).map(([,v])=>v);for(const query of queries){const q=JSON.parse(query);if(q.method==='equal')rows=rows.filter(row=>q.values.includes(row[q.attribute]));}return {rows:structuredClone(rows)};},
  async createTransaction(){transactions++;const id=String(++sequence);pending.set(id,[]);return {$id:id};},
  async createRow(input){pending.get(input.transactionId).push({kind:'create',input});},
  async updateRow(input){if(input.tableId==='workspace_heads'&&onGuard){const run=onGuard;onGuard=null;run();}pending.get(input.transactionId).push({kind:'update',input});},
  async deleteRow(input){pending.get(input.transactionId).push({kind:'delete',input});},
  async updateTransaction({transactionId,commit}){if(commit)for(const {kind,input}of pending.get(transactionId)){const k=key(input.tableId,input.rowId);if(kind==='delete'){tables.delete(k);continue;}if(kind==='create'&&tables.has(k))throw Object.assign(Error('Exists'),{code:409});tables.set(k,{...(tables.get(k)??{}),...structuredClone(input.data),$id:input.rowId,$updatedAt:String(++sequence),...(input.permissions?{$permissions:input.permissions}:{})});}pending.delete(transactionId);}
 };
 return {db,get transactions(){return transactions;},interleave(fn){onGuard=()=>{const state=this.state();fn(state);const packed=packWorkspace(state,owner,'fixture-generation');tables.set(key('workspace_heads',owner),{$id:owner,$updatedAt:'concurrent',...packed.head});for(const row of packed.rows)tables.set(key('workspace_records',row.$id),row);};},state(){const head=tables.get(key('workspace_heads',owner));return unpackWorkspace(head,[...tables.entries()].filter(([k])=>k.startsWith('workspace_records:')).map(([,v])=>v));}};
}
test('new account initializes once; existing imported heads do not get a generated namespace',async()=>{
 const fresh=database();await createWorkspaceStore(fresh.db,owner).create();assert.ok(readHealthExportState(fresh.state()));const before=fresh.state();await createWorkspaceStore(fresh.db,owner).create();assert.deepEqual(fresh.state(),before);
 const existing=database(initialState());await createWorkspaceStore(existing.db,owner).create();assert.equal(readHealthExportState(existing.state()),null);assert.equal(existing.transactions,0);
});
test('operator migration persists exact lineage atomically and exact retries need no transaction',async()=>{
 const source=initialState();source.notes=[{id:'keep',text:'Unrelated',date:'2026-11-14'}];const fixture=database(source),store=createWorkspaceStore(fixture.db,owner),revision=digest(source);
 assert.equal((await store.importHealthExportMetadata(metadata(),{revision})).changed,true);assert.deepEqual(fixture.state().notes,source.notes);assert.equal(fixture.state().healthExportState.namespace,namespace);
 const before=fixture.transactions;assert.equal((await store.importHealthExportMetadata(metadata(),{revision})).changed,false);assert.equal(fixture.transactions,before);
 await assert.rejects(()=>store.importHealthExportMetadata({...metadata(),namespace:other},{revision}),{code:409});
});
test('stale revision and interleaved diary edits reject migration without replacing user changes',async()=>{
 const source=initialState(),fixture=database(source),store=createWorkspaceStore(fixture.db,owner);
 await assert.rejects(()=>store.importHealthExportMetadata(metadata(),{revision:'0'.repeat(64)}),{code:409});assert.equal(fixture.transactions,0);
 fixture.interleave(state=>state.profile.name='Newer name');await assert.rejects(()=>store.importHealthExportMetadata(metadata(),{revision:digest(source)}),{code:409});
 assert.equal(fixture.state().profile.name,'Newer name');assert.equal(readHealthExportState(fixture.state()),null);
});
