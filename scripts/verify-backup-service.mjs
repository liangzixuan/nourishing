// Actual HTTP handler + account/session service against disposable Appwrite data.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {randomUUID,createHash} from 'node:crypto';
import {ID,Query} from 'node-appwrite';
import sharp from 'sharp';
import {operator,allRows,databaseId} from './operator.mjs';
import {createAppwriteService} from '../server/appwrite-service.mjs';
import {createWebHandler} from '../server/http.mjs';
const {users,db,storage,config}=operator(),ids=[ID.unique(),ID.unique()],origin='https://nourishing-cloud.appwrite.network';
const key=JSON.parse(readFileSync(new URL('../.local/data-key.json',import.meta.url),'utf8').replace(/^\uFEFF/,'')),settings={endpoint:config.endpoint,project:config.projectId,database:databaseId,profileTable:'profiles',origin};
const service=createAppwriteService(settings,key.secret),handle=createWebHandler({config:settings,service}),failures=[],report={at:new Date().toISOString(),checks:[]},files=new Set();
const fixturePath=new URL('../.local/backup-service-fixture.json',import.meta.url),reportPath=new URL('../.local/backup-service-verification.json',import.meta.url);
const remember=()=>writeFileSync(fixturePath,JSON.stringify({accounts:ids,fileIds:[...files],cleanupFailures:failures}));remember();
const request=(secret,path,body,extra={})=>handle(new Request(origin+path,{method:body===undefined?'GET':'POST',headers:{...(secret?{Cookie:'__Host-nourishing_session='+encodeURIComponent(secret)}:{}),...(body===undefined?{}:{Origin:origin,'Content-Type':'application/json'}),...extra},...(body===undefined?{}:{body:JSON.stringify(body)})}));
const ok=async(...input)=>{const response=await request(...input),body=await response.json();assert.equal(response.status,200,JSON.stringify(body));return body;};
try{
 const sessions=[];for(const userId of ids){await users.create({userId,email:`backup-service-${userId}@example.com`,password:randomUUID()+'Aa1!',name:'Backup HTTP fixture'});sessions.push((await users.createSession({userId})).secret);}const [secret,other]=sessions;
 assert.equal((await request(null,'/api/backup/export')).status,401);assert.equal((await request(secret,'/api/backup/inspect',{}, {Origin:'https://other.example'})).status,403);
 const empty=await ok(secret,'/api/backup/export'),note={requestId:randomUUID(),revision:empty.revision,type:'note.add',payload:{date:'2026-11-14',text:'Backup HTTP note'}};await ok(secret,'/api/workspace/command',note);
 const png=await sharp({create:{width:20,height:25,channels:3,background:'#92a883'}}).png().toBuffer(),prepared=await ok(secret,'/api/snapshots/prepare',{dataUrl:'data:image/png;base64,'+png.toString('base64'),date:'2026-11-14',title:'HTTP fixture',note:'',vitals:{}});
 await ok(secret,'/api/snapshots/save',{requestId:randomUUID(),revision:prepared.revision,photo:prepared.photo,...prepared.metadata});
 const exported=await ok(secret,'/api/backup/export');assert.equal(exported.manifest.media.length,1);assert.equal(exported.manifest.workspace.notes.length,1);
 const metadata=exported.manifest.media[0],image=await request(secret,'/api/media?'+new URLSearchParams({namespace:metadata.namespace,id:metadata.id}));assert.equal(image.status,200);const bytes=Buffer.from(await image.arrayBuffer());assert.equal(createHash('sha256').update(bytes).digest('hex'),metadata.id);const photo={id:metadata.id,dataUrl:'data:image/jpeg;base64,'+bytes.toString('base64')};
 await ok(secret,'/api/workspace/command',{requestId:randomUUID(),revision:exported.revision,type:'note.add',payload:{date:'2026-11-14',text:'Replace this fixture note'}});
 const current=await ok(secret,'/api/backup/export'),inspected=await ok(secret,'/api/backup/inspect',{manifest:exported.manifest,revision:current.revision});assert.equal(inspected.summary.current.counts.notes,2);assert.equal(inspected.summary.counts.notes,1);
 assert.equal((await request(other,'/api/backup/media',{reviewToken:inspected.reviewToken,namespace:metadata.namespace,photo})).status,409);
 await ok(secret,'/api/backup/media',{reviewToken:inspected.reviewToken,namespace:metadata.namespace,photo});
 const restore={requestId:randomUUID(),reviewToken:inspected.reviewToken,confirmation:'replace'},result=await ok(secret,'/api/backup/restore',restore);assert.deepEqual(await ok(secret,'/api/backup/restore',restore),result);
 const final=await ok(secret,'/api/backup/export');assert.deepEqual(final.manifest.workspace,exported.manifest.workspace);assert.equal((await ok(secret,'/api/account')).id,ids[0]);
 assert.equal((await request(other,'/api/media?'+new URLSearchParams({namespace:metadata.namespace,id:metadata.id}))).status,404);
 report.checks.push('HTTP session and Origin guards','actual snapshot/media export','reviewed replacement counts','cross-account upload rejected','service restore and receipt replay','workspace and account identity preserved');
}finally{
 const clean=async(label,work)=>{try{await work();}catch(error){if(error.code!==404)failures.push({resource:label,code:error.code??'unknown'});}};
 for(const userId of ids){for(const tableId of ['backup_reviews','command_receipts','workspace_media','workspace_records']){let rows=[];await clean(`${tableId}:list`,async()=>{rows=await allRows(db,tableId,[Query.equal('ownerId',userId)]);});for(const row of rows){assert.equal(row.ownerId,userId);if(tableId==='workspace_media'){files.add(row.fileId);remember();}await clean(`${tableId}:${row.$id}`,()=>db.deleteRow({databaseId,tableId,rowId:row.$id}));}}
  for(const tableId of ['workspace_heads','profiles'])await clean(`${tableId}:${userId}`,()=>db.deleteRow({databaseId,tableId,rowId:userId}));await clean(`user:${userId}`,()=>users.delete({userId}));}
 for(const fileId of files)await clean(`image:${fileId}`,()=>storage.deleteFile({bucketId:'private-media',fileId}));report.fixtureRemoved=failures.length===0;remember();writeFileSync(reportPath,JSON.stringify({...report,status:'verification-incomplete'},null,2));if(failures.length)throw Error('Backup service fixture cleanup incomplete.');
}
report.status='passed';writeFileSync(reportPath,JSON.stringify(report,null,2));console.log(JSON.stringify(report));
