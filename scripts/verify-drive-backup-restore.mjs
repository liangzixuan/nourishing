// Restore the approved T7 copy into one isolated fixture. Never replace the owner's workspace.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {join,dirname} from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {ID,Query,Permission,Role} from 'node-appwrite';
import {fixtureOperator} from './fixture-operator.mjs';
import {allRows,databaseId} from './operator.mjs';
import {createCloudDriveBackup,parseDriveBackupConfig} from './cloud-drive-backup.mjs';
import {readCloudBackupSnapshot,validatePortableBackup} from '../server/cloud-backup-snapshot.mjs';
import {createBackupStore} from '../server/backup-store.mjs';
import {rowId,packWorkspace} from '../server/data-codec.mjs';
import {initialState} from '../server/domain/workspace.mjs';
import {stageWorkspaceRows} from '../server/workspace-generations.mjs';

const config=parseDriveBackupConfig(JSON.parse(readFileSync('.local/cloud-backup.json','utf8'))),status=JSON.parse(readFileSync('.local/cloud-backup.status.json','utf8'));
const {db,storage,users}=fixtureOperator(),fixture=ID.unique(),files=[],cleanupFailures=[],report={restored:false,photos:0,ownerUnchanged:false,fixtureRemoved:false};
assert.notEqual(fixture,config.ownerId);
const args=(tableId,id)=>({databaseId,tableId,rowId:id}),head=()=>db.getRow(args('workspace_heads',config.ownerId));
const ledger=()=>writeFileSync('.local/drive-restore-fixture.json',JSON.stringify({fixture,files,cleanupFailures}));ledger();
let created=false,before;
try{
 const archive=dirname(status.lastSuccess.file),drive=createCloudDriveBackup({config,readSnapshot:()=>{throw Error('Verification must not capture another backup.');}});
 assert.ok(await drive.inspect(archive),'Backup ownership and integrity must verify before reading.');
 const bundle=JSON.parse(readFileSync(join(config.directory,archive,'backup.json'),'utf8')),checked=await validatePortableBackup(bundle);
 before=await head();
 await users.create({userId:fixture,email:`restore-${fixture}@example.com`,password:randomUUID()+'Aa1!',name:'T7 restore verification fixture'});created=true;
 // Model recovery into an empty workspace before a new native export identity is assigned.
 const packed=packWorkspace(initialState(),fixture,ID.unique());await stageWorkspaceRows(db,packed.rows);await db.createRow({...args('workspace_heads',fixture),data:packed.head,permissions:[Permission.read(Role.user(fixture))]});
 const store=createBackupStore({db,storage,ownerId:fixture}),initial=await store.export(),review=await store.inspect({manifest:checked.manifest,revision:initial.revision});
 for(const photo of bundle.media){files.push(rowId(fixture,photo.namespace,photo.id));ledger();await store.upload({reviewToken:review.reviewToken,namespace:photo.namespace,photo:{id:photo.id,dataUrl:photo.dataUrl}});}
 await store.restore({requestId:randomUUID(),reviewToken:review.reviewToken,confirmation:'replace'});
 const restored=await readCloudBackupSnapshot({db,storage,ownerId:fixture}),expected=structuredClone(checked.restored);
 // Native lineage survives recovery, while outstanding review tokens are invalidated.
 assert.equal(restored.manifest.workspace.healthExportState.namespace,expected.healthExportState.namespace);
 assert.notEqual(restored.manifest.workspace.healthExportState.saveScope,expected.healthExportState.saveScope);
 expected.healthExportState.saveScope=restored.manifest.workspace.healthExportState.saveScope;
 assert.deepEqual(restored.manifest.workspace,expected);
 for(const photo of bundle.media){const actual=restored.bundle.media.find(row=>row.namespace===photo.namespace&&row.id===photo.id);assert.ok(actual);assert.equal(createHash('sha256').update(actual.dataUrl).digest('hex'),createHash('sha256').update(photo.dataUrl).digest('hex'));}
 report.restored=true;report.photos=bundle.media.length;report.rows=Object.values(checked.summary.counts).reduce((sum,n)=>sum+Number(n),0);
}finally{
 const clean=async(work)=>{try{await work();}catch(error){if(error.code!==404)cleanupFailures.push(Number.isInteger(error.code)?error.code:'unknown');}};
 if(created){
  for(const tableId of ['workspace_records','workspace_media','workspace_recoveries','health_reviews','backup_reviews','command_receipts']){
   await clean(async()=>{for(const row of await allRows(db,tableId,[Query.equal('ownerId',fixture)])){assert.equal(row.ownerId,fixture);await db.deleteRow(args(tableId,row.$id));}});
  }
  for(const fileId of files)await clean(async()=>{const file=await storage.getFile({bucketId:'private-media',fileId});assert.deepEqual(file.$permissions,[`read("user:${fixture}")`]);await storage.deleteFile({bucketId:'private-media',fileId});});
  for(const tableId of ['workspace_heads','profiles'])await clean(()=>db.deleteRow(args(tableId,fixture)));
  await clean(()=>users.delete({userId:fixture}));
 }
 if(before){const after=await head();report.ownerUnchanged=before.digest===after.digest&&before.generation===after.generation&&before.$updatedAt===after.$updatedAt;}
 report.fixtureRemoved=cleanupFailures.length===0;ledger();writeFileSync('.local/drive-restore-verification.json',JSON.stringify(report,null,2));
 if(cleanupFailures.length||!report.ownerUnchanged)throw Error('Restore verification requires attention; inspect its private report.');
}
assert.ok(report.restored);console.log(JSON.stringify(report));
