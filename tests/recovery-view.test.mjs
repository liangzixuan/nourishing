import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import sharp from 'sharp';
import {Permission,Role} from 'node-appwrite';
import {createRecoveryView} from '../server/recovery-view.mjs';
import {recoveryMarker} from '../server/workspace-generations.mjs';
import {createBackupStore} from '../server/backup-store.mjs';
import {packWorkspace,rowId,unpackWorkspace} from '../server/data-codec.mjs';
import {initialState,act} from '../server/domain/workspace.mjs';
import {normalizePhoto,validateStoredPhoto} from '../server/domain/photo-images.mjs';
import {applyFastingCommand} from '../server/fasting.mjs';
import {planFastingDispatch} from '../server/scheduler-dispatch.mjs';

const owner='fixture-owner',asOf='2026-11-15T06:00:00.000Z',permissions=[Permission.read(Role.user(owner))];
const missing=()=>Object.assign(Error('Missing'),{code:404});
function fixture(){
 const tables=new Map(['workspace_heads','workspace_records','workspace_media','workspace_recoveries','backup_reviews','command_receipts','fasting_dispatch','reminder_dispatch','push_accounts'].map(table=>[table,new Map()])),transactions=new Map(),reads=[];let tick=0;
 const get=table=>tables.get(table),copy=value=>structuredClone(value);
 const db={
  async getRow({tableId,rowId}){const value=get(tableId).get(rowId);if(!value)throw missing();return copy(value);},
  async listRows({tableId,queries=[]}){reads.push(tableId);let rows=[...get(tableId).values()].sort((a,b)=>a.$id.localeCompare(b.$id)),limit=25;
   for(const query of queries.map(JSON.parse)){if(query.method==='equal')rows=rows.filter(row=>query.values.includes(row[query.attribute]));if(query.method==='cursorAfter'){const index=rows.findIndex(row=>row.$id===query.values[0]);rows=rows.slice(index+1);}if(query.method==='limit')limit=query.values[0];}
   return {rows:copy(rows.slice(0,limit))};},
  async createTransaction(){const id=randomUUID();transactions.set(id,[]);return {$id:id};},
  async createRow({tableId,rowId,data,permissions=[],transactionId}){const row={$id:rowId,$permissions:permissions,$updatedAt:String(++tick),...copy(data)},write=()=>{assert.equal(get(tableId).has(rowId),false);get(tableId).set(rowId,row);};if(transactionId)transactions.get(transactionId).push(write);else write();return copy(row);},
  async createRows({tableId,rows}){for(const row of rows){assert.equal(get(tableId).has(row.$id),false);get(tableId).set(row.$id,copy(row));}return {rows:copy(rows)};},
  async updateRow({tableId,rowId,data,transactionId}){const write=()=>get(tableId).set(rowId,{...get(tableId).get(rowId),...copy(data),$updatedAt:String(++tick)});if(transactionId)transactions.get(transactionId).push(write);else write();return {};},
  async deleteRow({tableId,rowId,transactionId}){const write=()=>{if(!get(tableId).has(rowId))throw missing();get(tableId).delete(rowId);};if(transactionId)transactions.get(transactionId).push(write);else write();return {};},
  async updateTransaction({transactionId,commit}){if(commit)for(const write of transactions.get(transactionId))write();transactions.delete(transactionId);}
 };
 function add(generation,state,{active=false,marker=false}={}){const packed=packWorkspace(state,owner,generation);for(const row of packed.rows)get('workspace_records').set(row.$id,row);if(active)get('workspace_heads').set(owner,{$id:owner,$permissions:permissions,$updatedAt:'0',...packed.head});if(marker){const row=recoveryMarker(packed.head,asOf);get('workspace_recoveries').set(row.$id,row);}return packed;}
 const current=add('current',initialState(),{active:true}),files=new Map();
 const storage={async getFile({fileId}){if(!files.has(fileId))throw missing();return files.get(fileId).metadata;},async getFileView({fileId}){if(!files.has(fileId))throw missing();return files.get(fileId).bytes;},async createFile(){throw Error('Recovery must not upload existing files.');}};
 return {db,storage,files,tables,reads,add,current,view:createRecoveryView({db,storage,ownerId:owner})};
}

test('inventory covers all pages and metadata-only stages, with no inferred historical completeness',async()=>{
 const f=fixture();for(let i=0;i<105;i++)f.add('old-'+String(i).padStart(3,'0'),initialState());
 f.add('verified',initialState(),{marker:true});f.tables.get('workspace_media').set('media-only',{$id:'media-only',ownerId:owner,generation:'media-only'});f.tables.get('backup_reviews').set('staged',{$id:'staged',ownerId:owner,generation:'staged'});
 const result=await f.view.list();assert.equal(result.generations.length,108);assert.equal(result.currentGeneration,'current');assert.equal(result.generations.find(row=>row.generation==='verified').status,'available');
 assert.equal(result.generations.find(row=>row.generation==='old-104').status,'unverified');assert.equal(result.generations.find(row=>row.generation==='media-only').status,'unverified');assert.equal(result.generations.find(row=>row.generation==='staged').status,'incomplete');assert.ok(f.reads.filter(table=>table==='workspace_records').length>2);
 await assert.rejects(()=>f.view.preview({generation:'old-104',revision:f.current.head.digest}),/no verified recovery/);
});

test('missing records, altered manifests, foreign permissions and read failures cannot look available or empty',async()=>{
 const f=fixture(),old=f.add('broken',initialState(),{marker:true});f.tables.get('workspace_records').delete(old.rows[0].$id);
 assert.equal((await f.view.list()).generations[0].status,'incomplete');
 await assert.rejects(()=>f.view.preview({generation:'broken',revision:f.current.head.digest}),/do not match/);
 f.tables.get('workspace_records').set(old.rows[0].$id,{...old.rows[0],$permissions:[Permission.read(Role.any())]});assert.equal((await f.view.list()).generations[0].status,'invalid');
 const get=f.db.listRows;f.db.listRows=async args=>{if(args.tableId==='workspace_media')throw Object.assign(Error('Unavailable'),{code:503});return get(args);};await assert.rejects(()=>f.view.list(),{code:503});
});

test('preview checks photo ownership and bytes while inventory leaves bytes untouched',async()=>{
 const f=fixture(),png=await sharp({create:{width:12,height:12,channels:3,background:'#889977'}}).png().toBuffer(),normalized=await normalizePhoto('data:image/png;base64,'+png.toString('base64')),photo=await validateStoredPhoto(normalized),state=initialState();act(state,'note.add',{date:'2026-11-14',text:'Fixture photo',time:'12:00'});state.notes[0].imageId=photo.id;delete state.capabilities;
 f.add('photo-version',state,{marker:true});const fileId=rowId(owner,'note_photos',photo.id),media={$id:rowId(owner,'photo-version','note_photos',photo.id),$permissions:permissions,ownerId:owner,generation:'photo-version',namespace:'note_photos',sourceId:photo.id,digest:photo.id,fileId,bytes:photo.bytes.length,width:photo.width,height:photo.height};f.tables.get('workspace_media').set(media.$id,media);
 assert.equal((await f.view.list()).generations[0].status,'available');await assert.rejects(()=>f.view.preview({generation:'photo-version',revision:f.current.head.digest}),/photo is missing/);
 f.files.set(fileId,{metadata:{$permissions:permissions,sizeOriginal:photo.bytes.length,name:fileId+'.jpg'},bytes:photo.bytes});const preview=await f.view.preview({generation:'photo-version',revision:f.current.head.digest});assert.equal(preview.summary.photos,1);assert.deepEqual(preview.manifest.workspace,state);
 f.files.get(fileId).bytes=Buffer.from('wrong');await assert.rejects(()=>f.view.preview({generation:'photo-version',revision:f.current.head.digest}),/failed verification/);
 f.files.get(fileId).bytes=photo.bytes;
 const store=createBackupStore({db:f.db,storage:f.storage,ownerId:owner,now:()=>Date.parse(asOf)}),inspection=await store.inspectRecovery({generation:'photo-version',revision:f.current.head.digest});
 const review=[...f.tables.get('backup_reviews').values()][0],staged=[...f.tables.get('workspace_media').values()].find(row=>row.generation===review.generation);assert.equal(staged.fileId,fileId);assert.equal(inspection.summary.photos,1);assert.equal(f.files.size,1);
 const result=await store.restore({requestId:randomUUID(),reviewToken:inspection.reviewToken,confirmation:'replace'});assert.equal(result.recoveryGeneration,'current');assert.deepEqual(unpackWorkspace(f.tables.get('workspace_heads').get(owner),[...f.tables.get('workspace_records').values()].filter(row=>row.generation===review.generation)),state);
 const retained=f.tables.get('workspace_recoveries').get(rowId(owner,'current'));assert.deepEqual(JSON.parse(retained.head),f.current.head);assert.deepEqual(retained.$permissions,[]);
});

test('recovery stays account-scoped, rejects stale selection and checks current head again after reading',async()=>{
 const f=fixture();f.add('old',initialState(),{marker:true});
 await assert.rejects(()=>f.view.preview({generation:'old',revision:'f'.repeat(64)}),/changed/);
 await assert.rejects(()=>f.view.preview({generation:'old',revision:f.current.head.digest,ownerId:'other'}),{code:400});
 const foreign=createRecoveryView({db:f.db,storage:f.storage,ownerId:'other'});await assert.rejects(()=>foreign.list(),{code:404});
 const original=f.db.getRow;let calls=0;f.db.getRow=async args=>{const row=await original(args);if(args.tableId==='workspace_heads'&&++calls===2)row.digest='f'.repeat(64);return row;};await assert.rejects(()=>f.view.preview({generation:'old',revision:f.current.head.digest}),/changed/);
});

test('restore removes the previous schedule intent atomically with its workspace generation',async()=>{
 const f=fixture(),state=initialState(),now=new Date(asOf);
 applyFastingCommand(state,{type:'fasting.schedule.save',payload:{id:randomUUID(),revision:0,label:'Current schedule',startDate:'2026-11-15',time:'07:00',recurrence:'once',interval:1,days:[],untilDate:null,goalHours:16,enabled:true}},{now,timeZone:'UTC'});
 const active=f.add('current',state,{active:true});f.add('prior',initialState(),{marker:true});
 const plan=planFastingDispatch(state,{generation:'current',now,timeZone:'UTC'}),intent={$id:owner,$permissions:[],ownerId:owner,...plan,repairAt:asOf,executionId:''};f.tables.get('fasting_dispatch').set(owner,intent);f.tables.get('reminder_dispatch').set(owner,structuredClone(intent));
 const store=createBackupStore({db:f.db,storage:f.storage,ownerId:owner,now:()=>Date.parse(asOf)}),inspection=await store.inspectRecovery({generation:'prior',revision:active.head.digest}),request={requestId:randomUUID(),reviewToken:inspection.reviewToken,confirmation:'replace'};
 const commit=f.db.updateTransaction;let fail=true;f.db.updateTransaction=async input=>{if(input.commit&&fail){fail=false;throw Error('Fixture commit failed');}return commit(input);};
 await assert.rejects(()=>store.restore(request),/Fixture commit failed/);assert.equal(f.tables.get('workspace_heads').get(owner).generation,'current');assert.deepEqual(f.tables.get('fasting_dispatch').get(owner),intent);assert.deepEqual(f.tables.get('reminder_dispatch').get(owner),intent);
 await store.restore(request);assert.notEqual(f.tables.get('workspace_heads').get(owner).generation,'current');assert.equal(f.tables.get('fasting_dispatch').has(owner),false);assert.equal(f.tables.get('reminder_dispatch').has(owner),false);
});

test('retained health snapshot numbers identify the exact version and reject malformed markers',async()=>{
 const f=fixture(),state=initialState();delete state.capabilities;const old=f.add('health-version',state,{marker:true}),marker=f.tables.get('workspace_recoveries').get(rowId(owner,'health-version'));
 marker.snapshotId=17;
 const item=(await f.view.list()).generations.find(row=>row.generation==='health-version');assert.equal(item.recoverySnapshotId,17);assert.equal(item.status,'available');
 assert.deepEqual((await f.view.preview({generation:'health-version',revision:f.current.head.digest})).manifest.workspace,unpackWorkspace(old.head,old.rows));
 marker.snapshotId=-1;const broken=(await f.view.list()).generations[0];assert.equal(broken.status,'invalid');assert.equal(broken.recoverySnapshotId,null);
 await assert.rejects(()=>f.view.preview({generation:'health-version',revision:f.current.head.digest}),/snapshot identity/);
});
