// Disposable Appwrite accounts and synthetic records/photos only.
import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {Client,ID,Query,Storage,TablesDB} from 'node-appwrite';
import sharp from 'sharp';
import {operator,allRows,databaseId} from './operator.mjs';
import {createBackupStore} from '../server/backup-store.mjs';
import {backupManifest,backupReferences} from '../server/backup.mjs';
import {initialState,act} from '../server/domain/workspace.mjs';
import {normalizePhoto,validateStoredPhoto} from '../server/domain/photo-images.mjs';
import {calculateSummary} from '../server/domain/nutrition.mjs';
import {createWorkspaceStore,workspaceRows} from '../server/workspace-store.mjs';
import {digest,rowId,unpackWorkspace} from '../server/data-codec.mjs';
const {users,db,storage,config}=operator(),ids=[ID.unique(),ID.unique()],owner=ids[0],fileIds=[],cleanupFailures=[];
const report={at:new Date().toISOString(),checks:[]},fixturePath=new URL('../.local/backup-cloud-fixture.json',import.meta.url),reportPath=new URL('../.local/backup-cloud-verification.json',import.meta.url),args=(tableId,id)=>({databaseId,tableId,rowId:id});
const remember=()=>writeFileSync(fixturePath,JSON.stringify({accounts:ids,fileIds,createdAt:report.at,cleanupFailures}));remember();
const denied=operation=>assert.rejects(operation,error=>[401,403,404].includes(error.code));
try{
 const clients=[];for(const userId of ids){await users.create({userId,email:`backup-${userId}@example.com`,password:randomUUID()+'Aa1!',name:'Backup verification fixture'});const session=await users.createSession({userId});clients.push(new Client().setEndpoint(config.endpoint).setProject(config.projectId).setSession(session.secret));}
 const store=createBackupStore({db,storage,ownerId:owner}),other=createBackupStore({db,storage,ownerId:ids[1]}),otherDb=new TablesDB(clients[1]),userDb=new TablesDB(clients[0]),otherStorage=new Storage(clients[1]);
 const initial=await store.export();await createWorkspaceStore(db,owner).command({requestId:randomUUID(),revision:initial.revision,type:'note.add',payload:{date:'2026-11-14',text:'Recovery generation fixture'}},async()=>null);
 const previous=await store.export(),oldHead=await db.getRow(args('workspace_heads',owner));
 const normalized=await normalizePhoto('data:image/png;base64,'+(await sharp({create:{width:24,height:30,channels:3,background:'#92a883'}}).png().toBuffer()).toString('base64')),photo=await validateStoredPhoto(normalized),transport={id:photo.id,dataUrl:normalized.dataUrl},source=initialState();
 act(source,'food.save',{name:'Synthetic backup food',grams:100,serving:'100 g',nutrients:{calories:200,protein:10}});act(source,'entry.add',{date:'2026-11-14',foodId:source.foods[0].id,amount:0.5,group:'Lunch',time:'12:00'});source.entries[0].photo={id:photo.id,description:'Fixture food',provider:'Manual review',analysis:null};
 act(source,'note.add',{date:'2026-11-14',text:'Synthetic photo note'});source.notes[0].imageId=photo.id;source.progressSnapshots.push({id:randomUUID(),imageId:photo.id,createdAt:'2026-11-14T12:00:00.000Z',date:'2026-11-14',title:'Fixture snapshot',note:'',vitals:{}});
 const media=backupReferences(source).map(ref=>({...ref,bytes:photo.bytes.length,width:photo.width,height:photo.height})),manifest=backupManifest(source,media);
 for(const row of media)fileIds.push(rowId(owner,row.namespace,row.id));remember();
 const inspected=await store.inspect({manifest,revision:previous.revision}),reviewToken=inspected.reviewToken,request={requestId:randomUUID(),reviewToken,confirmation:'replace'};
 await denied(()=>userDb.getRow(args('backup_reviews',rowId(owner,reviewToken))));
 await assert.rejects(()=>other.upload({reviewToken,namespace:media[0].namespace,photo:transport}),{code:409});
 await assert.rejects(()=>store.restore(request),/every backup photo/);assert.equal((await store.export()).revision,previous.revision);
 for(const row of media)await store.upload({reviewToken,namespace:row.namespace,photo:transport});await store.upload({reviewToken,namespace:media[0].namespace,photo:transport});
 assert.equal((await store.export()).revision,previous.revision);const restored=await store.restore(request),exported=await store.export();
 assert.equal(exported.manifest.workspace.entries.length,1);assert.deepEqual(exported.manifest.workspace,manifest.workspace);assert.deepEqual(calculateSummary(exported.manifest.workspace,'2026-11-14'),calculateSummary(source,'2026-11-14'));assert.equal(exported.manifest.media.length,3);
 const oldRows=await workspaceRows(db,owner,oldHead.generation),recovery=unpackWorkspace(oldHead,oldRows);assert.equal(recovery.notes[0].text,'Recovery generation fixture');assert.equal(restored.recoveryGeneration,oldHead.generation);
 for(const fileId of fileIds){assert.deepEqual((await storage.getFile({bucketId:'private-media',fileId})).$permissions,[`read("user:${owner}")`]);await denied(()=>otherStorage.getFileView({bucketId:'private-media',fileId}));}
 const currentHead=await db.getRow(args('workspace_heads',owner)),currentRows=await workspaceRows(db,owner,currentHead.generation);await denied(()=>otherDb.getRow(args('workspace_heads',owner)));await denied(()=>otherDb.getRow(args('workspace_records',currentRows[0].$id)));
 report.checks.push('private review cannot be read by browser sessions','cross-account review rejected','missing photos block replacement','uploads leave active head unchanged','all photo namespaces and nutrition preserved','old generation retained for recovery','other account denied by row and image permissions');
 const expired=createBackupStore({db,storage,ownerId:owner,now:()=>Date.now()+3600000});assert.deepEqual(await expired.restore(request),restored);await assert.rejects(()=>store.restore({...request,requestId:randomUUID()}),{code:409});
 const fresh=await store.inspect({manifest,revision:exported.revision});await createWorkspaceStore(db,owner).command({requestId:randomUUID(),revision:exported.revision,type:'note.add',payload:{date:'2026-11-14',text:'Concurrent diary edit'}},async()=>null);
 await assert.rejects(()=>store.upload({reviewToken:fresh.reviewToken,namespace:media[0].namespace,photo:transport}),{code:409});await assert.rejects(()=>store.restore({requestId:randomUUID(),reviewToken:fresh.reviewToken,confirmation:'replace'}),{code:409});
 assert.equal((await store.export()).manifest.workspace.notes.at(-1).text,'Concurrent diary edit');report.checks.push('expired-review receipt replay returns same result','consumed review cannot replace active generation again','stale review preserves newer diary changes');
 // A diary write after restoration staging must also survive the final head guard.
 const raceStart=await store.export(),raceReview=await store.inspect({manifest,revision:raceStart.revision});for(const row of media)await store.upload({reviewToken:raceReview.reviewToken,namespace:row.namespace,photo:transport});let injected=false;
 const racedDb=new Proxy(db,{get(target,name){const value=target[name];if(typeof value!=='function')return value;return async(...parameters)=>{const input=parameters[0];if(name==='updateRow'&&!injected&&input.tableId==='workspace_heads'&&input.transactionId&&Object.keys(input.data).join(',')==='digest'){injected=true;await createWorkspaceStore(db,owner).command({requestId:randomUUID(),revision:raceStart.revision,type:'note.add',payload:{date:'2026-11-14',text:'Final guard fixture'}},async()=>null);}return value.apply(target,parameters);};}});
 await assert.rejects(()=>createBackupStore({db:racedDb,storage,ownerId:owner}).restore({requestId:randomUUID(),reviewToken:raceReview.reviewToken,confirmation:'replace'}),{code:409});assert.equal(injected,true);assert.equal((await store.export()).manifest.workspace.notes.at(-1).text,'Final guard fixture');report.checks.push('concurrent diary commit during staging survives final atomic head guard');
}finally{
 const clean=async(label,operation)=>{try{await operation();}catch(error){if(error.code!==404)cleanupFailures.push({resource:label,code:error.code??'unknown'});}};
 for(const userId of ids){for(const tableId of ['backup_reviews','command_receipts','workspace_media','workspace_records']){let rows=[];await clean(`${tableId}:${userId}:list`,async()=>{rows=await allRows(db,tableId,[Query.equal('ownerId',userId)]);});for(const row of rows){assert.equal(row.ownerId,userId);await clean(`${tableId}:${row.$id}`,()=>db.deleteRow(args(tableId,row.$id)));}}
  for(const tableId of ['workspace_heads','profiles'])await clean(`${tableId}:${userId}`,()=>db.deleteRow(args(tableId,userId)));await clean(`users:${userId}`,()=>users.delete({userId}));}
 for(const fileId of fileIds)await clean(`private-media:${fileId}`,()=>storage.deleteFile({bucketId:'private-media',fileId}));report.fixtureRemoved=cleanupFailures.length===0;remember();writeFileSync(reportPath,JSON.stringify({...report,status:'verification-incomplete'},null,2));if(cleanupFailures.length)throw Error('Backup fixture cleanup incomplete; see .local/backup-cloud-fixture.json.');
}
report.status='passed';writeFileSync(reportPath,JSON.stringify(report,null,2));console.log(JSON.stringify(report));
