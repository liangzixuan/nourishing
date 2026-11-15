// Disposable Appwrite service check. Synthetic photos only; no owner health data.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {randomUUID,createHash} from 'node:crypto';
import {Client,ID,Query,Storage,TablesDB} from 'node-appwrite';
import sharp from 'sharp';
import {operator,allRows,databaseId} from './operator.mjs';
import {createAppwriteService} from '../server/appwrite-service.mjs';
import {rowId} from '../server/data-codec.mjs';

const {users,db,storage,config}=operator(),ids=[ID.unique(),ID.unique()],owner=ids[0];
const key=JSON.parse(readFileSync(new URL('../.local/data-key.json',import.meta.url),'utf8').replace(/^\uFEFF/,''));
const api=createAppwriteService({endpoint:config.endpoint,project:config.projectId,database:databaseId,profileTable:'profiles'},key.secret);
const args=(tableId,id)=>({databaseId,tableId,rowId:id}),report={at:new Date().toISOString(),checks:[]},cleanupFailures=[],fileIds=[];
const fixturePath=new URL('../.local/snapshots-cloud-fixture.json',import.meta.url),reportPath=new URL('../.local/snapshots-cloud-verification.json',import.meta.url);
const remember=()=>writeFileSync(fixturePath,JSON.stringify({accounts:ids,fileIds,createdAt:report.at,cleanupFailures}));remember();
const denied=operation=>assert.rejects(operation,error=>[401,403,404].includes(error.code));
try{
 const sessions=[];for(const userId of ids){await users.create({userId,email:`snapshot-${userId}@example.com`,password:randomUUID()+'Aa1!',name:'Snapshot verification fixture'});sessions.push((await users.createSession({userId})).secret);}
 const [secret,otherSecret]=sessions,otherClient=new Client().setEndpoint(config.endpoint).setProject(config.projectId).setSession(otherSecret);
 const otherDb=new TablesDB(otherClient),otherStorage=new Storage(otherClient);
 const png=await sharp({create:{width:32,height:24,channels:3,background:'#92a883'}}).png().toBuffer();
 const prepared=await api.prepareSnapshot(secret,{dataUrl:'data:image/png;base64,'+png.toString('base64'),date:'2026-11-14',time:'09:00',title:'Synthetic snapshot',note:'Fixture only',captureMeasurements:true});
 assert.equal((await api.snapshots(secret)).items.length,0);
 const save={requestId:randomUUID(),revision:prepared.revision,photo:prepared.photo,...prepared.metadata};
 fileIds.push(rowId(owner,'progress_photos',prepared.photo.id));remember();
 const saved=await api.saveSnapshot(secret,save),first=(await api.snapshots(secret)).items[0];
 assert.equal(saved.item.id,first.id);assert.equal(first.note,'Fixture only');assert.deepEqual(first.vitals,{});
 const bytes=Buffer.from(await api.readMedia(secret,'progress_photos',first.imageId));
 assert.equal(createHash('sha256').update(bytes).digest('hex'),first.imageId);
 const file=await storage.getFile({bucketId:'private-media',fileId:fileIds[0]});assert.deepEqual(file.$permissions,[`read("user:${owner}")`]);
 const head=await db.getRow(args('workspace_heads',owner)),mediaId=rowId(owner,head.generation,'progress_photos',first.imageId);
 const media=await db.getRow(args('workspace_media',mediaId));assert.equal(media.ownerId,owner);assert.deepEqual(media.$permissions,file.$permissions);
 assert.deepEqual(await api.saveSnapshot(secret,save),saved);assert.equal((await api.snapshots(secret)).items.length,1);
 await api.snapshots(otherSecret);
 await denied(()=>api.readMedia(otherSecret,'progress_photos',first.imageId));
 await denied(()=>otherStorage.getFileView({bucketId:'private-media',fileId:fileIds[0]}));
 await denied(()=>otherDb.getRow(args('workspace_media',mediaId)));
 report.checks.push('prepare leaves no snapshot','normalized private JPEG saved atomically','retry returns same snapshot','other account denied by service and storage');
 const view=await api.snapshots(secret);
 await api.workspaceCommand(secret,{requestId:randomUUID(),revision:view.revision,type:'snapshot.update',payload:{id:first.id,date:'2026-11-13',time:'10:00',title:'Updated fixture',note:'Edited caption',vitals:{weight:{value:70,unit:'kg'},height:{value:175,unit:'cm'}}}});
 const edited=(await api.snapshots(secret)).items[0];assert.equal(edited.imageId,first.imageId);assert.equal(edited.createdAt,first.createdAt);assert.equal(edited.bmi,22.86);assert.equal(edited.note,'Edited caption');
 await assert.rejects(()=>api.workspaceCommand(secret,{requestId:randomUUID(),revision:view.revision,type:'snapshot.delete',payload:{id:first.id}}),error=>error.code===409);
 const latest=await api.snapshots(secret),remove={requestId:randomUUID(),revision:latest.revision,type:'snapshot.delete',payload:{id:first.id}};
 const removed=await api.workspaceCommand(secret,remove);assert.deepEqual(await api.workspaceCommand(secret,remove),removed);
 assert.equal((await api.snapshots(secret)).items.length,0);
 await denied(()=>api.readMedia(secret,'progress_photos',first.imageId));
 // Deletion removes the app reference. Nontransactional blobs stay private until cleanup.
 assert.deepEqual((await storage.getFile({bucketId:'private-media',fileId:fileIds[0]})).$permissions,file.$permissions);
 report.checks.push('caption/date/measurements edit preserves image identity','stale revision denied','delete retry is idempotent','deleted snapshot cannot be read through media service','retained blob stays private pending cleanup');
}finally{
 const clean=async(label,operation)=>{try{await operation();}catch(error){if(error.code!==404)cleanupFailures.push({resource:label,code:error.code??'unknown'});}};
 for(const userId of ids){
  for(const tableId of ['command_receipts','workspace_media','workspace_records']){
   let rows=[];await clean(`${tableId}:${userId}:list`,async()=>{rows=await allRows(db,tableId,[Query.equal('ownerId',userId)]);});
   for(const row of rows){assert.equal(row.ownerId,userId);await clean(`${tableId}:${row.$id}`,()=>db.deleteRow(args(tableId,row.$id)));}
  }
  for(const tableId of ['workspace_heads','profiles'])await clean(`${tableId}:${userId}`,()=>db.deleteRow(args(tableId,userId)));
  await clean(`users:${userId}`,()=>users.delete({userId}));
 }
 for(const fileId of fileIds)await clean(`private-media:${fileId}`,()=>storage.deleteFile({bucketId:'private-media',fileId}));
 report.fixtureRemoved=cleanupFailures.length===0;remember();writeFileSync(reportPath,JSON.stringify({...report,status:'verification-incomplete'},null,2));
 if(cleanupFailures.length)throw Error('Snapshot fixture cleanup incomplete; see .local/snapshots-cloud-fixture.json.');
}
report.status='passed';writeFileSync(reportPath,JSON.stringify(report,null,2));console.log(JSON.stringify(report));
