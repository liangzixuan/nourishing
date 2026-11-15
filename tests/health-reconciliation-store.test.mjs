import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import sharp from 'sharp';
import {packWorkspace,unpackWorkspace,rowId} from '../server/data-codec.mjs';
import {initialState} from '../server/domain/workspace.mjs';
import {importHealth} from '../server/domain/health-connect.mjs';
import {initializeHealthExportState} from '../server/health-export-state.mjs';
import {previewHealthReconciliation,prepareHealthReconciliation} from '../server/health-reconciliation.mjs';
import {createWorkspaceStore} from '../server/workspace-store.mjs';
const owner='fixture-owner',reviewSecret='fixture-reconciliation-secret-32-characters',context={ownerId:owner,reviewSecret},streamId='11111111-1111-4111-8111-111111111111',at='2026-11-15T12:00:00Z',old='2026-11-14T12:00:00Z';
const snapshot=records=>({format:'nourish-health-connect',version:1,exportedAt:at,range:{from:'2026-11-14',to:'2026-11-15',zone:'UTC'},records});
const measurement=()=>({id:'weight:parent',type:'Weight',date:'2026-11-14',time:'08:00',value:70,unit:'kg',start:'2026-11-14T08:00:00Z',source:{app:'example.health',recordId:'parent',lastModifiedAt:old}});
const batch=(overrides={})=>({format:'nourish-health-reconciliation',version:1,streamId,batchId:randomUUID(),sequence:1,previousReceipt:null,observedAt:at,snapshot:snapshot([]),nativeChanges:[{kind:'delete',type:'Weight',recordId:'parent'}],aggregateObservations:[],gaps:[],...overrides});
function seed(){const state=initialState();initializeHealthExportState(state);importHealth(state,snapshot([measurement()]));return state;}
const reviewed=(state,b=batch())=>({batch:b,reviewToken:previewHealthReconciliation(state,b,context).reviewToken,confirmed:true,allowRemovals:true});

function fixture(state=seed(),counter=0){
 const tables=new Map(),transactions=new Map();let serial=0,createdTransactions=0,commitFailure=false,lostReply=false,beforeGuard=null;
 const table=name=>{if(!tables.has(name))tables.set(name,new Map());return tables.get(name);};
 const save=(name,id,value)=>table(name).set(id,{...structuredClone(value),$id:id,$updatedAt:String(++serial)});
 const packed=packWorkspace(state,owner,'initial');for(const row of packed.rows)save('workspace_records',row.$id,row);save('workspace_heads',owner,{...packed.head,recoverySequence:counter,$permissions:[`read("user:${owner}")`]});
 const missing=()=>{throw Object.assign(Error('Missing'),{code:404});};const conflict=()=>{throw Object.assign(Error('Conflict'),{code:409});};
 const write=(action,input)=>{
  const tx=transactions.get(input.transactionId),current=table(input.tableId).get(input.rowId);if(!tx)throw Error('Transaction required');
  if(!tx.versions.has(input.tableId+':'+input.rowId))tx.versions.set(input.tableId+':'+input.rowId,{tableId:input.tableId,id:input.rowId,version:current?.$updatedAt});
  tx.operations.push({action,input:structuredClone(input)});
 };
 const db={
  async getRow({tableId,rowId}){return structuredClone(table(tableId).get(rowId)??missing());},
  async listRows({tableId,queries=[]}){let rows=[...table(tableId).values()].sort((a,b)=>a.$id.localeCompare(b.$id));let limit=100;for(const raw of queries){const q=JSON.parse(raw);if(q.method==='equal')rows=rows.filter(r=>q.values.includes(r[q.attribute]));if(q.method==='cursorAfter')rows=rows.filter(r=>r.$id>q.values[0]);if(q.method==='limit')limit=q.values[0];}return {rows:structuredClone(rows.slice(0,limit))};},
  async createRows({tableId,rows}){for(const row of rows)if(table(tableId).has(row.$id))conflict();for(const row of rows)save(tableId,row.$id,row);return {rows:rows.map(row=>structuredClone(table(tableId).get(row.$id)))};},
  async createTransaction(){createdTransactions++;const id=String(++serial);transactions.set(id,{versions:new Map(),operations:[]});return {$id:id};},
  async createRow(input){write('create',input);},async deleteRow(input){write('delete',input);},
  async updateRow(input){write('update',input);if(input.tableId==='workspace_heads'&&Object.keys(input.data).join(',')==='digest'&&beforeGuard){const run=beforeGuard;beforeGuard=null;run();}},
  async updateTransaction({transactionId,commit}){
   const tx=transactions.get(transactionId);if(!tx)return;if(!commit){transactions.delete(transactionId);return;}
   if(commitFailure){commitFailure=false;throw Error('Commit unavailable');}
   for(const {tableId,id,version}of tx.versions.values())if(table(tableId).get(id)?.$updatedAt!==version)conflict();
   for(const {action,input}of tx.operations){const current=table(input.tableId).get(input.rowId);if(action==='create'&&current)conflict();if(action==='update'&&!current)missing();}
   for(const {action,input}of tx.operations){if(action==='delete')table(input.tableId).delete(input.rowId);else save(input.tableId,input.rowId,{...(table(input.tableId).get(input.rowId)??{}),...input.data,...(input.permissions?{$permissions:input.permissions}:{})});}
   transactions.delete(transactionId);if(lostReply){lostReply=false;throw Error('Lost commit reply');}
  }
 };
 const api={db,table,head:()=>structuredClone(table('workspace_heads').get(owner)),state:()=>{const h=api.head();return unpackWorkspace(h,[...table('workspace_records').values()].filter(r=>r.generation===h.generation));},get transactions(){return createdTransactions;},failCommit(){commitFailure=true;},loseReply(){lostReply=true;},interleave(change){beforeGuard=()=>{const state=api.state();change(state);const h=api.head(),next=packWorkspace(state,owner,h.generation);for(const [id,row]of table('workspace_records'))if(row.generation===h.generation)table('workspace_records').delete(id);for(const row of next.rows)save('workspace_records',row.$id,row);save('workspace_heads',owner,{...h,...next.head});};}};
 return api;
}
async function withPhoto(){const bytes=await sharp({create:{width:20,height:30,channels:3,background:'#92a883'}}).jpeg().toBuffer(),id=createHash('sha256').update(bytes).digest('hex'),state=seed();state.notes=[{id:'photo-note',date:'2026-11-14',text:'Photo fixture',imageId:id}];const f=fixture(state),fileId=rowId(owner,'note_photos',id),media={$id:rowId(owner,'initial','note_photos',id),$permissions:[`read("user:${owner}")`],ownerId:owner,generation:'initial',namespace:'note_photos',sourceId:id,fileId,digest:id,width:20,height:30,bytes:bytes.length};f.table('workspace_media').set(media.$id,media);f.storage={async getFile(){return {$permissions:media.$permissions,name:fileId+'.jpg',sizeOriginal:bytes.length};},async getFileView(){return bytes;}};return {...f,media,bytes};}

test('removal commits receipt, private media mapping and exact immutable recovery generation atomically; replay allocates nothing',async()=>{
 const f=await withPhoto(),before=f.state(),head=f.head(),oldRows=structuredClone([...f.table('workspace_records').values()]),input=reviewed(before),store=createWorkspaceStore(f.db,owner),result=await store.reconcileHealth(input,{reviewSecret,storage:f.storage});
 assert.equal(result.receipt.recoverySnapshotId,1);assert.equal(f.head().recoverySequence,1);assert.notEqual(f.head().generation,head.generation);assert.equal(f.state().biometrics.length,0);assert.deepEqual(f.state().notes,before.notes);
 assert.deepEqual([...f.table('workspace_records').values()].filter(r=>r.generation===head.generation),oldRows);
 const marker=[...f.table('workspace_recoveries').values()][0];assert.equal(marker.snapshotId,1);assert.deepEqual(marker.$permissions,[]);assert.equal(JSON.parse(marker.head).digest,head.digest);
 const copied=[...f.table('workspace_media').values()].find(r=>r.generation===f.head().generation);assert.equal(copied.fileId,f.media.fileId);assert.deepEqual(copied.$permissions,[`read("user:${owner}")`]);assert.equal(f.table('workspace_media').size,2);
 const count=f.transactions,replay=await store.reconcileHealth(input,{reviewSecret,storage:f.storage});assert.equal(replay.replayed,true);assert.deepEqual(replay.receipt,result.receipt);assert.equal(f.transactions,count);assert.equal(f.table('workspace_recoveries').size,1);
});
test('nonremoval persists source receipt in the current generation without snapshots or command receipts',async()=>{
 const f=fixture(),input=reviewed(f.state(),batch({nativeChanges:[]})),store=createWorkspaceStore(f.db,owner),result=await store.reconcileHealth(input,{reviewSecret});assert.equal(result.receipt.recoverySnapshotId,null);assert.equal(f.head().generation,'initial');assert.equal(f.head().recoverySequence,0);assert.equal(f.table('workspace_recoveries').size,0);assert.equal(f.table('command_receipts').size,0);assert.equal(f.state().healthSync.streams.length,1);
});
test('failed final commit exposes no recovery promise and retry reuses staged generation safely',async()=>{
 const f=fixture(),before=f.state(),input=reviewed(before),store=createWorkspaceStore(f.db,owner);f.failCommit();await assert.rejects(()=>store.reconcileHealth(input,{reviewSecret}),/Commit unavailable/);assert.deepEqual(f.state(),before);assert.equal(f.table('workspace_recoveries').size,0);assert.equal(f.head().recoverySequence,0);const staged=new Set([...f.table('workspace_records').values()].map(r=>r.generation));assert.equal(staged.size,2);
 const result=await store.reconcileHealth(input,{reviewSecret});assert.equal(result.receipt.recoverySnapshotId,1);assert.equal(new Set([...f.table('workspace_records').values()].map(r=>r.generation)).size,2);
});
test('lost commit reply returns durable receipt without taking a second snapshot',async()=>{
 const f=fixture(),input=reviewed(f.state()),store=createWorkspaceStore(f.db,owner);f.loseReply();const result=await store.reconcileHealth(input,{reviewSecret});assert.equal(result.replayed,true);assert.equal(result.receipt.recoverySnapshotId,1);assert.equal(f.table('workspace_recoveries').size,1);assert.equal(f.head().recoverySequence,1);
});
test('concurrent diary edit rejects final guard, preserves edit and leaves staging unverified',async()=>{
 const f=fixture(),input=reviewed(f.state()),store=createWorkspaceStore(f.db,owner);f.interleave(state=>state.notes.push({id:'concurrent',date:'2026-11-14',text:'Keep me'}));await assert.rejects(()=>store.reconcileHealth(input,{reviewSecret}),{code:409});assert.equal(f.head().generation,'initial');assert.equal(f.state().notes[0].text,'Keep me');assert.equal(f.state().biometrics.length,1);assert.equal(f.table('workspace_recoveries').size,0);
 const result=await store.reconcileHealth(input,{reviewSecret});assert.equal(result.receipt.recoverySnapshotId,1);assert.equal(f.state().notes[0].text,'Keep me');
});
test('snapshot allocation exceeds both the durable head counter and imported legacy receipt IDs',async()=>{
 for(const counter of [7,90]){const state=seed(),first=reviewed(state),previous=prepareHealthReconciliation(state,first,{...context,snapshotId:41});const row=measurement();row.id='weight:second';row.source.recordId='second';importHealth(previous.state,snapshot([row]));const f=fixture(previous.state,counter),b=batch({sequence:2,previousReceipt:previous.result.receipt.receiptId,nativeChanges:[{kind:'delete',type:'Weight',recordId:'second'}]}),input=reviewed(f.state(),b),result=await createWorkspaceStore(f.db,owner).reconcileHealth(input,{reviewSecret});assert.equal(result.receipt.recoverySnapshotId,Math.max(counter,41)+1);assert.equal(f.head().recoverySequence,result.receipt.recoverySnapshotId);}
});
test('unverified photo content or ownership blocks destructive reconciliation before recovery or head mutation',async()=>{
 for(const damage of ['missing','acl','bytes','dimensions']){const f=await withPhoto(),before=f.state(),input=reviewed(before);if(damage==='missing')f.table('workspace_media').clear();if(damage==='acl')f.media.$permissions=[];if(damage==='bytes')f.storage.getFileView=async()=>Buffer.from('wrong');if(damage==='dimensions')f.media.width=21;await assert.rejects(()=>createWorkspaceStore(f.db,owner).reconcileHealth(input,{reviewSecret,storage:f.storage}));assert.deepEqual(f.state(),before);assert.equal(f.table('workspace_recoveries').size,0);assert.equal(f.head().recoverySequence,0);}
});
