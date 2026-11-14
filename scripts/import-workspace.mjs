import {DatabaseSync} from 'node:sqlite';
import {readFileSync,writeFileSync,createReadStream} from 'node:fs';
import {dirname,join,resolve} from 'node:path';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {Query,Permission,Role} from 'node-appwrite';
import {InputFile} from 'node-appwrite/file';
import {operator,databaseId,maybeGet,allRows} from './operator.mjs';
import {packWorkspace,unpackWorkspace,digest,rowId} from '../server/data-codec.mjs';
import {calculateSummary} from '../server/domain/nutrition.mjs';
import {batches,importRows} from './import-rows.mjs';
const manifestPath=resolve(process.argv[2]??''),manifest=JSON.parse(readFileSync(manifestPath,'utf8'));
const snapshot=join(dirname(manifestPath),'recovery-local-only.sqlite');
const confirmed=JSON.parse(readFileSync(new URL('../.local/migration-destination.json',import.meta.url),'utf8').replace(/^\uFEFF/,''));
assert.deepEqual(manifest.destination,Object.fromEntries(Object.keys(manifest.destination).map(k=>[k,confirmed[k]])),'Baseline destination differs from confirmed account.');
const {db,users,storage,config}=operator();
assert.equal(confirmed.projectId,config.projectId);assert.equal(confirmed.endpoint,config.endpoint);
const account=await users.get({userId:confirmed.accountId});
assert.equal(account.email,confirmed.email);assert.equal(account.emailVerification,true);assert.equal(account.status,true);
const hash=createHash('sha256');for await(const chunk of createReadStream(snapshot))hash.update(chunk);assert.equal(hash.digest('hex'),manifest.snapshotSha256,'Recovery snapshot changed.');
const source=new DatabaseSync(snapshot,{readOnly:true});
try{
 const state=JSON.parse(source.prepare('SELECT body FROM workspace WHERE id=1').get().body);
 assert.equal(digest(state),manifest.workspaceSha256);
 const ownerId=account.$id,generation=rowId(ownerId,manifest.snapshotSha256),packed=packWorkspace(state,ownerId,generation);
 const old=await maybeGet(db,'workspace_heads',ownerId);
 if(old&&old.generation!==generation)throw Error('This account already has a different workspace. A reconciled cutover is required.');
 for await(const batch of batches(packed.rows))await importRows(db,'workspace_records',batch);
 const media=[];
 for(const [namespace,images]of Object.entries(manifest.photos)){
   if(!['meal_photos','note_photos','progress_photos'].includes(namespace))throw Error('Unknown image namespace.');
   for(const image of images){
     const saved=source.prepare(`SELECT image,width,height FROM ${namespace} WHERE id=?`).get(image.id);
     assert.ok(saved);const bytes=Buffer.from(saved.image);assert.equal(createHash('sha256').update(bytes).digest('hex'),image.sha256);
     const fileId=rowId(ownerId,namespace,image.id),permissions=[Permission.read(Role.user(ownerId))];
     try{await storage.getFile({bucketId:'private-media',fileId});}catch(error){if(error.code!==404)throw error;await storage.createFile({bucketId:'private-media',fileId,file:InputFile.fromBuffer(bytes,`${fileId}.jpg`),permissions});}
     const file=await storage.getFile({bucketId:'private-media',fileId});assert.deepEqual(file.$permissions,permissions);
     const returned=await storage.getFileView({bucketId:'private-media',fileId});assert.equal(createHash('sha256').update(Buffer.from(returned)).digest('hex'),image.sha256);
     media.push({$id:rowId(ownerId,generation,namespace,image.id),$permissions:permissions,ownerId,generation,namespace,sourceId:image.id,fileId,digest:image.sha256,width:image.width,height:image.height,bytes:image.bytes});
   }
 }
 for await(const batch of batches(media))await importRows(db,'workspace_media',batch);
 const rows=await allRows(db,'workspace_records',[Query.equal('ownerId',ownerId),Query.equal('generation',generation)]);
 const restored=unpackWorkspace(packed.head,rows);assert.deepEqual(restored,state);
 let dates=0;for(const [day,expected]of Object.entries(manifest.days)){assert.deepEqual(calculateSummary(restored,day),expected.source,`Nutrition changed for ${day}.`);dates++;}
 if(old)assert.equal(old.digest,packed.head.digest);
 else await db.createRow({databaseId,tableId:'workspace_heads',rowId:ownerId,data:packed.head,permissions:[Permission.read(Role.user(ownerId))]});
 const report={at:new Date().toISOString(),status:'verified',generation,recordRows:rows.length,imagesVerified:media.length,datesCompared:dates,workspaceDigest:packed.head.digest,accountVerified:true,fullJsonRoundTrip:true,dailyNutritionUnchanged:true,pcCredentialsUploaded:false,auxiliaryStateMigrated:false,pcIsLiveWritableSource:true};
 writeFileSync(new URL('../.local/workspace-import.json',import.meta.url),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{source.close();}
