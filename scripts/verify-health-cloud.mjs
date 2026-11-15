// Disposable Appwrite accounts and synthetic health data only. Never print transport errors.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {Client,ID,Query,TablesDB,Storage} from 'node-appwrite';
import sharp from 'sharp';
import {operator,allRows,databaseId} from './operator.mjs';
import {createWorkspaceStore} from '../server/workspace-store.mjs';
import {workspaceRows} from '../server/workspace-generations.mjs';
import {createBackupStore} from '../server/backup-store.mjs';
import {backupManifest,backupReferences} from '../server/backup.mjs';
import {rowId,unpackWorkspace} from '../server/data-codec.mjs';
import {act} from '../server/domain/workspace.mjs';
import {normalizePhoto,validateStoredPhoto} from '../server/domain/photo-images.mjs';
import {createHealthExport} from '../server/health-export.mjs';
import {previewHealthReconciliation,healthReconciliationReceipt} from '../server/health-reconciliation.mjs';

const {db,storage,users,config}=operator(),ids=[ID.unique(),ID.unique()],owner=ids[0],created=[],files=[],cleanupFailures=[];
const args=(tableId,id)=>({databaseId,tableId,rowId:id}),reviewSecret=randomUUID()+randomUUID(),context={ownerId:owner,reviewSecret};
const report={at:new Date().toISOString(),checks:[]};let phase='create fixtures';
const ledger=()=>writeFileSync('.local/health-cloud-fixture.json',JSON.stringify({accounts:ids,created,files,cleanupFailures}));ledger();
const read=async(id=owner)=>{const head=await db.getRow(args('workspace_heads',id));return {head,state:unpackWorkspace(head,await workspaceRows(db,id,head.generation))};};
const identity=head=>Object.fromEntries(['generation','digest','$updatedAt'].map(key=>[key,head[key]]));
const realOwner=JSON.parse(readFileSync('.local/migration-destination.json','utf8').replace(/^\uFEFF/,'')).accountId;
const realBefore=identity(await db.getRow(args('workspace_heads',realOwner)));
const day='2026-11-14',at='2026-11-15T01:00:00Z',streamId=randomUUID();
const record={id:'weight:fixture-native',type:'Weight',date:day,time:'08:00',value:70,unit:'kg',start:day+'T08:00:00Z',source:{app:'example.health',recordId:'fixture-native',lastModifiedAt:day+'T09:00:00Z'}};
const batch=(previous=null,extra={})=>({format:'nourish-health-reconciliation',version:1,streamId,batchId:randomUUID(),sequence:(previous?.sequence??0)+1,previousReceipt:previous?.receiptId??null,observedAt:at,snapshot:{format:'nourish-health-connect',version:1,exportedAt:at,range:{from:day,to:'2026-11-15',zone:'UTC'},records:[]},nativeChanges:[],aggregateObservations:[],gaps:[],...extra});
const input=async(b,allowRemovals=false)=>({batch:b,reviewToken:previewHealthReconciliation((await read()).state,b,context).reviewToken,confirmed:true,allowRemovals});
const lookup=r=>Object.fromEntries(['streamId','sequence','batchId','batchDigest'].map(key=>[key,r[key]]));
const denied=fn=>assert.rejects(fn,error=>[401,403,404].includes(error.code));
try{
 const clients=[];
 for(const id of ids){await users.create({userId:id,email:`health-${id}@example.com`,password:randomUUID()+'Aa1!',name:'Health migration test'});created.push(id);ledger();const session=await users.createSession({userId:id});clients.push(new Client().setEndpoint(config.endpoint).setProject(config.projectId).setSession(session.secret));await createWorkspaceStore(db,id).create();}
 const store=createWorkspaceStore(db,owner),backups=createBackupStore({db,storage,ownerId:owner}),otherDb=new TablesDB(clients[1]),userDb=new TablesDB(clients[0]);
 phase='seed synthetic photo and diary';
 const normalized=await normalizePhoto('data:image/png;base64,'+(await sharp({create:{width:24,height:28,channels:3,background:'#92a883'}}).png().toBuffer()).toString('base64')),photo=await validateStoredPhoto(normalized),base=(await read()).state;
 act(base,'note.add',{date:day,text:'Synthetic recovery photo',time:'12:00'});base.notes.at(-1).imageId=photo.id;
 base.biometrics.push({id:randomUUID(),date:day,time:'09:00',type:'Weight',unit:'lb',value:200});
 act(base,'food.save',{name:'Synthetic measured food',grams:100,serving:'100 g',nutrients:{calories:200,protein:10}});act(base,'entry.add',{date:day,foodId:base.foods.at(-1).id,amount:0.5,group:'Lunch',time:'12:00'});
 const media=backupReferences(base).map(ref=>({...ref,bytes:photo.bytes.length,width:photo.width,height:photo.height}));for(const ref of media)files.push(rowId(owner,ref.namespace,ref.id));ledger();
 const review=await backups.inspect({manifest:backupManifest(base,media),revision:(await read()).head.digest});for(const ref of media)await backups.upload({reviewToken:review.reviewToken,namespace:ref.namespace,photo:{id:photo.id,dataUrl:normalized.dataUrl}});await backups.restore({requestId:randomUUID(),reviewToken:review.reviewToken,confirmation:'replace'});
 phase='ordinary native export';
 const exports=createHealthExport({readState:async()=>(await read()).state,ownerId:owner,reviewSecret,timeZone:'UTC'}),selection={kind:'weight',from:day,to:day,metric:{type:'Weight',unit:'lb'},timeZone:'UTC'};
 const plan=await exports.biometric.preview(selection);assert.equal(plan.accountId,owner);assert.equal(plan.records.length,1);assert.equal(plan.records[0].nativeValue,90.718474);await exports.biometric.verify({selection,reviewToken:plan.reviewToken});
 const intake={kind:'nutrition',from:day,to:day,timeZone:'UTC',interval:'recorded-minute'},nutrition=await exports.intake.preview(intake);assert.equal(nutrition.records[0].nutrients.energy,100);assert.equal(Object.hasOwn(nutrition.records[0].nutrients,'dietaryFiber'),false);
 report.checks.push('real database exports preserve units, known nutrients and account lineage');
 phase='native import and absence';
 const first=batch();first.snapshot.records=[record];const imported=await store.reconcileHealth(await input(first),{reviewSecret,storage});assert.equal(imported.receipt.recoverySnapshotId,null);assert.ok((await read()).state.biometrics.some(r=>r.source?.recordId==='fixture-native'));
 const empty=batch(imported.receipt),unchanged=await store.reconcileHealth(await input(empty),{reviewSecret,storage});assert.ok((await read()).state.biometrics.some(r=>r.source?.recordId==='fixture-native'));assert.equal(unchanged.receipt.recoverySnapshotId,null);
 report.checks.push('native import commits and an empty snapshot never removes data');
 phase='destructive consent and lost response';
 const remove=batch(unchanged.receipt,{nativeChanges:[{kind:'delete',type:'Weight',recordId:'fixture-native'}]}),confirmed=await input(remove,true),prior=await read();await assert.rejects(()=>store.reconcileHealth({...confirmed,allowRemovals:false},{reviewSecret,storage}),{code:400});assert.deepEqual(identity((await read()).head),identity(prior.head));
 let dropped=false;const lostDb=new Proxy(db,{get(target,name){const value=target[name];if(typeof value!=='function')return value;return async(...parameters)=>{const result=await value.apply(target,parameters);if(name==='updateTransaction'&&parameters[0].commit&&!dropped){dropped=true;throw Object.assign(Error('Synthetic lost response'),{code:503});}return result;};}});
 const removed=await createWorkspaceStore(lostDb,owner).reconcileHealth(confirmed,{reviewSecret,storage});assert.ok(dropped);assert.ok(Number.isSafeInteger(removed.receipt.recoverySnapshotId));assert.ok(removed.receipt.recoverySnapshotId>0);
 const after=await read();assert.notEqual(after.head.generation,prior.head.generation);assert.equal(after.head.recoverySequence,removed.receipt.recoverySnapshotId);assert.equal(after.state.biometrics.some(r=>r.source?.recordId==='fixture-native'),false);assert.equal(after.state.biometrics.length,1);
 const marker=await db.getRow(args('workspace_recoveries',rowId(owner,prior.head.generation)));assert.equal(marker.snapshotId,removed.receipt.recoverySnapshotId);assert.deepEqual(JSON.parse(marker.head),Object.fromEntries(['ownerId','generation','layout','digest'].map(k=>[k,prior.head[k]])));assert.deepEqual(unpackWorkspace(JSON.parse(marker.head),await workspaceRows(db,owner,prior.head.generation)),prior.state);
 const repeated=await store.reconcileHealth(confirmed,{reviewSecret,storage});assert.deepEqual(repeated.receipt,removed.receipt);assert.deepEqual(identity((await read()).head),identity(after.head));assert.deepEqual(healthReconciliationReceipt(after.state,lookup(removed.receipt)).receipt,removed.receipt);
 report.checks.push('explicit deletion, immutable recovery, atomic receipt and lost-response retry');
 phase='recovery photo and privacy';
 const inventory=await backups.listRecoveries();assert.equal(inventory.generations.find(g=>g.generation===prior.head.generation).status,'available');const recovered=await backups.inspectRecovery({generation:prior.head.generation,revision:after.head.digest});assert.equal(recovered.summary.photos,1);
 await denied(()=>userDb.getRow(args('workspace_recoveries',marker.$id)));await denied(()=>otherDb.getRow(args('workspace_recoveries',marker.$id)));await denied(()=>otherDb.getRow(args('workspace_heads',owner)));await denied(async()=>otherDb.getRow(args('workspace_records',(await workspaceRows(db,owner,after.head.generation))[0].$id)));await denied(()=>new Storage(clients[1]).getFile({bucketId:'private-media',fileId:files[0]}));
 report.checks.push('retained photo verifies and another account cannot read diary, receipt marker or photo');
 phase='restore counter monotonicity';
 await backups.restore({requestId:randomUUID(),reviewToken:recovered.reviewToken,confirmation:'replace'});assert.equal((await read()).head.recoverySequence,removed.receipt.recoverySnapshotId);
 const removeAgain=batch(unchanged.receipt,{nativeChanges:remove.nativeChanges}),again=await store.reconcileHealth(await input(removeAgain,true),{reviewSecret,storage});assert.ok(again.receipt.recoverySnapshotId>removed.receipt.recoverySnapshotId);
 report.checks.push('backup restore preserves the recovery counter and new removals get a distinct snapshot');
 phase='concurrent diary change';
 const next=batch(again.receipt),request=await input(next),start=await read();let injected=false;
 const racedDb=new Proxy(db,{get(target,name){const value=target[name];if(typeof value!=='function')return value;return async(...parameters)=>{const p=parameters[0];if(name==='updateRow'&&!injected&&p.tableId==='workspace_heads'&&p.transactionId&&Object.keys(p.data).join(',')==='digest'){injected=true;await store.command({requestId:randomUUID(),revision:start.head.digest,type:'note.add',payload:{date:day,text:'Concurrent synthetic note'}},async()=>null);}return value.apply(target,parameters);};}});
 await assert.rejects(()=>createWorkspaceStore(racedDb,owner).reconcileHealth(request,{reviewSecret,storage}),{code:409});assert.ok(injected);assert.ok((await read()).state.notes.some(n=>n.text==='Concurrent synthetic note'));assert.equal(healthReconciliationReceipt((await read()).state,lookup(again.receipt)).receipt.receiptId,again.receipt.receiptId);
 report.checks.push('concurrent diary edits survive a rejected health commit');
 assert.deepEqual(identity(await db.getRow(args('workspace_heads',realOwner))),realBefore);report.checks.push('real owner workspace unchanged');report.status='passed';
}catch(error){report.status='failed';report.phase=phase;report.error={name:error.name,code:error.code??null};throw Object.assign(Error(`Health cloud verification failed at ${phase} (${error.name}, ${error.code??'assertion'}).`),{code:error.code});}
finally{
 const clean=async(label,operation)=>{try{await operation();}catch(error){if(error.code!==404)cleanupFailures.push({label,code:error.code??null});}};
 for(const id of created){const account=await users.get({userId:id}).catch(()=>null);if(!account||account.email!==`health-${id}@example.com`){cleanupFailures.push({label:'fixture-identity',code:null});continue;}for(const tableId of ['workspace_recoveries','backup_reviews','health_reviews','command_receipts','workspace_media','workspace_records']){let rows=[];await clean(tableId+':list',async()=>{rows=await allRows(db,tableId,[Query.equal('ownerId',id)]);});for(const row of rows)if(row.ownerId===id)await clean(tableId,()=>db.deleteRow(args(tableId,row.$id)));}for(const tableId of ['workspace_heads','profiles'])await clean(tableId,()=>db.deleteRow(args(tableId,id)));await clean('account',()=>users.delete({userId:id}));await clean('account:verify',async()=>{try{await users.get({userId:id});throw Object.assign(Error('Account remains'),{code:409});}catch(error){if(error.code!==404)throw error;}});}
 for(const fileId of files)await clean('private-media',()=>storage.deleteFile({bucketId:'private-media',fileId}));ledger();report.cleanup=cleanupFailures.length?'incomplete':'complete';writeFileSync('.local/health-cloud-verification.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));if(cleanupFailures.length)process.exitCode=1;
}
