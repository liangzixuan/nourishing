import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,mkdir,readdir,readFile,writeFile,lstat,rename,unlink,rmdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,parse} from 'node:path';
import {Permission,Role} from 'node-appwrite';
import sharp from 'sharp';
import {initialState,act} from '../server/domain/workspace.mjs';
import {normalizePhoto,validateStoredPhoto} from '../server/domain/photo-images.mjs';
import {packWorkspace,rowId,digest} from '../server/data-codec.mjs';
import {backupManifest,inspectBackup,prepareBackupRestore} from '../server/backup.mjs';
import {readCloudBackupSnapshot,validatePortableBackup} from '../server/cloud-backup-snapshot.mjs';
import {createCloudDriveBackup,parseDriveBackupConfig} from '../scripts/cloud-drive-backup.mjs';
const ownerId='fixture-owner',generation='fixture-generation',permission=[Permission.read(Role.user(ownerId))],asOf='2026-11-14T12:00:00.000Z';
const normalized=await normalizePhoto('data:image/png;base64,'+(await sharp({create:{width:20,height:24,channels:3,background:'#92a883'}}).png().toBuffer()).toString('base64')),photo=await validateStoredPhoto(normalized);
function fixture(){const state=initialState();state.notes=Array.from({length:115},(_,i)=>({id:'note-'+i,date:'2026-11-14',text:'Fixture '+i}));state.notes[0].imageId=photo.id;const packed=packWorkspace(state,ownerId,generation),head={$id:ownerId,$permissions:permission,...packed.head},media={$id:rowId(ownerId,generation,'note_photos',photo.id),$permissions:permission,ownerId,generation,namespace:'note_photos',sourceId:photo.id,fileId:rowId(ownerId,'note_photos',photo.id),digest:photo.id,bytes:photo.bytes.length,width:photo.width,height:photo.height};let headReads=0,rowsRead=0;const db={async getRow(input){assert.deepEqual(input,{databaseId:'nourishing',tableId:'workspace_heads',rowId:ownerId});headReads++;return structuredClone(head);},async listRows({databaseId,tableId,queries}){assert.equal(databaseId,'nourishing');rowsRead++;const parsed=queries.map(q=>JSON.parse(q));assert.ok(parsed.some(q=>q.method==='equal'&&q.attribute==='ownerId'&&q.values[0]===ownerId));const source=tableId==='workspace_records'?packed.rows:[media],sorted=source.filter(row=>parsed.filter(q=>q.method==='equal').every(q=>q.values.includes(row[q.attribute]))).sort((a,b)=>a.$id.localeCompare(b.$id)),after=parsed.find(q=>q.method==='cursorAfter')?.values[0],start=after?sorted.findIndex(row=>row.$id===after)+1:0;return {rows:structuredClone(sorted.slice(start,start+100))};}};const storage={async getFile({fileId}){assert.equal(fileId,media.fileId);return {$permissions:permission,sizeOriginal:photo.bytes.length,name:media.fileId+'.jpg'};},async getFileView(){return photo.bytes;}};return {state,head,packed,media,db,storage,reads:()=>({headReads,rowsRead})};}
test('read-only snapshot paginates exact owner records, validates photos and produces a source-restorable portable bundle',async()=>{
 const f=fixture(),before=structuredClone(f.state),result=await readCloudBackupSnapshot({...f,ownerId,now:()=>asOf}),portable=structuredClone(before);delete portable.capabilities;assert.deepEqual(result.manifest.workspace,portable);assert.equal(result.bundle.media[0].id,photo.id);assert.ok(f.reads().rowsRead>=3);assert.equal(result.revision,digest(before));await validatePortableBackup(result.bundle);
 const current=initialState(),review=inspectBackup(current,{manifest:result.manifest,revision:digest(current)},{ownerId}).review;const restored=await prepareBackupRestore(current,result.manifest,{requestId:crypto.randomUUID(),reviewToken:review.token,confirmation:'replace'},{ownerId,review,readMedia:async()=>({id:photo.id,dataUrl:result.bundle.media[0].dataUrl})});assert.deepEqual(restored.state,portable);
});
test('snapshot retries a changed head, fails missing owners and never publishes mixed records or malformed images',async()=>{
 const f=fixture(),original=f.db.getRow;let calls=0;f.db.getRow=async input=>{const row=await original(input);if(++calls===2)row.digest='f'.repeat(64);return row;};const result=await readCloudBackupSnapshot({...f,ownerId,now:()=>asOf});assert.equal(result.revision,f.head.digest);assert.ok(calls>=4);
 const unstable=fixture(),read=unstable.db.getRow;let count=0;unstable.db.getRow=async input=>{const h=await read(input);if(++count%2===0)h.generation='new-generation';return h;};await assert.rejects(()=>readCloudBackupSnapshot({...unstable,ownerId}),{code:409});assert.equal(count,6);
 await assert.rejects(()=>readCloudBackupSnapshot({db:{getRow:async()=>{throw Object.assign(Error('Missing'),{code:404});}},ownerId}),{code:404});
 const malformed=fixture();malformed.storage.getFileView=async()=>Buffer.from('bad');await assert.rejects(()=>readCloudBackupSnapshot({...malformed,ownerId}),/photo failed verification/);
 const foreign=fixture();foreign.media.ownerId='other';await assert.rejects(()=>readCloudBackupSnapshot({...foreign,ownerId}),/ownership is invalid/);
});
const io={readFile,writeFile,mkdir,readdir,rename,unlink,rmdir,lstat};
async function drive(){const base=await mkdtemp(join(tmpdir(),'nourishing-cloud-drive-')),directory=join(base,'NourishCloud'),config={version:1,endpoint:'https://cloud.example/v1',projectId:'fixture-project',ownerId,directory,volume:{root:parse(base).root,label:'T7',serial:'01234567'},timeZone:'UTC'};let clock=Date.parse(asOf),checks=0;const guard={async check(){checks++;}},readSnapshot=async()=>{const state=initialState(),manifest=backupManifest(state,[],{asOf:clock});return {revision:digest(state),generation,manifest,bundle:structuredClone(manifest)};};return {base,directory,config,guard,readSnapshot,now:()=>clock,setClock:value=>{clock=Date.parse(value);},checks:()=>checks,cleanup:()=>rm(base,{recursive:true,force:true})};}
test('drive publication readback validates the whole bundle, catches interrupted writes and retries without affecting unknown files',async()=>{
 const f=await drive();try{
  await mkdir(f.directory);await writeFile(join(f.directory,'foreign.txt'),'keep');let writes=0;const faulty={...io,async writeFile(path,bytes,options){if(++writes===2)throw Object.assign(Error('disk full'),{code:'ENOSPC'});return writeFile(path,bytes,options);}};
  await assert.rejects(()=>createCloudDriveBackup({...f,io:faulty}).capture(),{code:'ENOSPC'});assert.deepEqual(await readdir(f.directory),['foreign.txt']);
  const result=await createCloudDriveBackup(f).capture();assert.equal(result.status,'saved');const file=join(f.directory,result.file);await validatePortableBackup(JSON.parse(await readFile(file)));assert.equal(await readFile(join(f.directory,'foreign.txt'),'utf8'),'keep');assert.ok(f.checks()>=5);
  assert.equal((await createCloudDriveBackup(f).capture()).status,'current');
 }finally{await f.cleanup();}
});
test('readback corruption or a disconnected drive never publishes; abandoned pending and foreign-owner directories stay untouched',async()=>{
 const f=await drive();try{
  const corrupt={...io,async readFile(path,...args){if(path.endsWith('backup.json'))return Buffer.from('{}');return readFile(path,...args);}};await assert.rejects(()=>createCloudDriveBackup({...f,io:corrupt}).capture(),/readback/);assert.deepEqual(await readdir(f.directory),[]);
  let checks=0;const disconnect={async check(){if(++checks>=4)throw Object.assign(Error('disconnected'),{code:503});}};await assert.rejects(()=>createCloudDriveBackup({...f,guard:disconnect}).capture(),{code:503});const pending=(await readdir(f.directory)).find(name=>name.startsWith('.pending-'));assert.ok(pending);
  const good=await createCloudDriveBackup(f).capture();assert.equal(good.status,'saved');assert.ok((await readdir(f.directory)).includes(pending));
  const path=join(f.directory,good.file.replace(/backup\.json$/,'ownership.json')),meta=JSON.parse(await readFile(path,'utf8'));meta.ownerId='other';await writeFile(path,JSON.stringify(meta));assert.equal(await createCloudDriveBackup(f).inspect(good.file.split(/[\\/]/)[0]),null);
  await createCloudDriveBackup(f).capture();assert.ok((await readdir(f.directory)).includes(good.file.split(/[\\/]/)[0]));
 }finally{await f.cleanup();}
});
test('retention keeps 14 verified daily snapshots, preserves unreadable/foreign artifacts, and only rotates after new verification',async()=>{
 const f=await drive();try{const service=createCloudDriveBackup(f);await mkdir(f.directory);const unknown='nourishing-cloud-2026-10-01-11111111-1111-4111-8111-111111111111';await mkdir(join(f.directory,unknown));await writeFile(join(f.directory,unknown,'backup.json'),'unreadable');
  for(let day=1;day<=16;day++){f.setClock(`2026-11-${String(day).padStart(2,'0')}T12:00:00.000Z`);await service.capture();}
  const names=await readdir(f.directory),known=[];for(const name of names){const result=await service.inspect(name);if(result)known.push(result);}assert.equal(known.length,14);assert.equal(known.map(row=>row.day).sort()[0],'2026-11-03');assert.ok(names.includes(unknown));
  await service.capture({force:true});assert.equal((await readdir(f.directory)).length,15);assert.equal(await readFile(join(f.directory,unknown,'backup.json'),'utf8'),'unreadable');
 }finally{await f.cleanup();}
});
test('configuration contains no credential fields and rejects endpoint credentials or non-cloud destination',async()=>{const f=await drive();try{assert.deepEqual(parseDriveBackupConfig(f.config),f.config);for(const input of [{...f.config,apiKey:'not-allowed'},{...f.config,endpoint:'https://name:secret@cloud.example/v1'},{...f.config,directory:join(f.base,'NourishLocal')},{...f.config,ownerId:''}])assert.throws(()=>parseDriveBackupConfig(input),{code:400});}finally{await f.cleanup();}});
test('photo-bearing archive survives readback and concurrent capture calls share one completed publication',async()=>{
 const f=await drive();try{let captures=0;const service=createCloudDriveBackup({...f,readSnapshot:async()=>{captures++;return readCloudBackupSnapshot({...fixture(),ownerId,now:()=>asOf});}}),one=service.capture(),two=service.capture();assert.equal(one,two);const result=await one;assert.equal(captures,1);assert.equal(result.photos,1);const body=JSON.parse(await readFile(join(f.directory,result.file),'utf8'));assert.equal(body.media[0].dataUrl,normalized.dataUrl);await validatePortableBackup(body);assert.equal((await service.inspect(result.file.split(/[\\/]/)[0])).summary.photos,1);
 }finally{await f.cleanup();}
});
test('rename failure preserves earlier archives; destination link rejection occurs before writing',async()=>{
 const f=await drive();try{const saved=await createCloudDriveBackup(f).capture();f.setClock('2026-11-15T12:00:00.000Z');const faulty={...io,rename:async()=>{throw Object.assign(Error('rename failed'),{code:'EIO'});}};await assert.rejects(()=>createCloudDriveBackup({...f,io:faulty}).capture(),{code:'EIO'});assert.equal((await readdir(f.directory)).length,1);assert.ok(await readFile(join(f.directory,saved.file)));
  let writes=0;const linked={...io,lstat:async path=>path===f.base?{isSymbolicLink:()=>true}:lstat(path),mkdir:async(...args)=>{writes++;return mkdir(...args);}};await assert.rejects(()=>createCloudDriveBackup({...f,io:linked}).capture(),/must not be a link/);assert.equal(writes,0);
 }finally{await f.cleanup();}
});
