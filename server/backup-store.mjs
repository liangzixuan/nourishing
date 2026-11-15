import {ID,Permission,Role,Query} from 'node-appwrite';
import {isDeepStrictEqual} from 'node:util';
import {digest,rowId,packWorkspace,unpackWorkspace} from './data-codec.mjs';
import {workspaceRows,createWorkspaceStore} from './workspace-store.mjs';
import {stagePhotoMedia} from './photo-storage.mjs';
import {backupReferences,backupManifest,inspectBackup,validateBackupMedia,prepareBackupRestore} from './backup.mjs';
import {createRecoveryView,recoveryMarker} from './recovery-view.mjs';

const databaseId='nourishing',args=(tableId,id)=>({databaseId,tableId,rowId:id});
const fail=(message,code=409)=>{throw Object.assign(Error(message),{code,publicMessage:message});};
const conflict=()=>fail('Your workspace changed. Inspect the backup again.');
const token=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const permissions=owner=>[Permission.read(Role.user(owner))];
const optional=async operation=>{try{return await operation();}catch(error){if(error.code===404)return null;throw error;}};
const fields=(value,keys)=>{if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).length!==keys.length||keys.some(key=>!Object.hasOwn(value,key)))fail('Invalid backup request.',400);};
const sameRows=(expected,actual)=>{
 const byId=new Map(actual.map(row=>[row.$id,row]));if(byId.size!==expected.length||actual.length!==expected.length)fail('Backup staging is incomplete. Try again.');
 for(const row of expected){const saved=byId.get(row.$id);if(!saved||Object.entries(row).some(([key,value])=>!isDeepStrictEqual(value,saved[key])))fail('Staged backup records differ from the reviewed backup.');}
};

/** Create-only writes permit retries without replacing an earlier staged or active row. */
export async function stageBackupRows(db,rows){
 const batches=[];let batch=[],bytes=0;
 for(const row of rows){const size=Buffer.byteLength(JSON.stringify(row));if(batch.length&&(batch.length===100||bytes+size>2*1024*1024)){batches.push(batch);batch=[];bytes=0;}batch.push(row);bytes+=size;}if(batch.length)batches.push(batch);
 for(const expected of batches){
  const read=()=>db.listRows({databaseId,tableId:'workspace_records',queries:[Query.equal('$id',expected.map(row=>row.$id)),Query.limit(100)],total:false});
  const existing=(await read()).rows,known=new Set(existing.map(row=>row.$id));sameRows(expected.filter(row=>known.has(row.$id)),existing);
  const pending=expected.filter(row=>!known.has(row.$id));if(!pending.length)continue;
  try{sameRows(pending,(await db.createRows({databaseId,tableId:'workspace_records',rows:pending})).rows);}
  catch(error){if(error.code!==409)throw error;sameRows(expected,(await read()).rows);}
 }
}

/** db/storage are server clients; ownerId comes only from the authenticated account. */
export function createBackupStore({db,storage,ownerId,now=()=>Date.now()}){
 if(typeof ownerId!=='string'||!ownerId||ownerId.length>36)fail('Sign in to use backups.',401);
 const owner=ownerId;
 const clock=()=>{const value=Number(now());if(!Number.isFinite(value))fail('Backup clock is unavailable.',503);return value;};
 async function snapshot(){
  await createWorkspaceStore(db,owner).create();
  for(let attempt=0;attempt<3;attempt++){
   const head=await db.getRow(args('workspace_heads',owner));if(head.ownerId!==owner)fail('Workspace not found.',404);
   const rows=await workspaceRows(db,owner,head.generation),latest=await db.getRow(args('workspace_heads',owner));
   if(head.digest!==latest.digest||head.generation!==latest.generation)continue;
   return {head,state:unpackWorkspace(head,rows)};
  }
  conflict();
 }
 async function mediaRows(generation){
  const rows=[];let after;
  do{const page=await db.listRows({databaseId,tableId:'workspace_media',queries:[Query.equal('ownerId',owner),Query.equal('generation',generation),Query.orderAsc('$id'),Query.limit(100),...(after?[Query.cursorAfter(after)]:[])],total:false});rows.push(...page.rows);after=page.rows.length===100?page.rows.at(-1).$id:null;}while(after);
  return rows;
 }
 function mediaDescriptor(row,ref,generation){
  if(!row||row.ownerId!==owner||row.generation!==generation||row.namespace!==ref.namespace||row.sourceId!==ref.id||row.digest!==ref.id||row.$id!==rowId(owner,generation,ref.namespace,ref.id)||row.fileId!==rowId(owner,ref.namespace,ref.id)||!isDeepStrictEqual(row.$permissions,permissions(owner)))fail('A backup photo is missing or its ownership is invalid.');
  return {namespace:ref.namespace,id:ref.id,bytes:row.bytes,width:row.width,height:row.height};
 }
 async function exportBackup(){
  const {state,head}=await snapshot(),rows=await mediaRows(head.generation),byKey=new Map(rows.map(row=>[row.namespace+':'+row.sourceId,row]));
  const media=backupReferences(state).map(ref=>mediaDescriptor(byKey.get(ref.namespace+':'+ref.id),ref,head.generation));
  const latest=await db.getRow(args('workspace_heads',owner));if(latest.generation!==head.generation||latest.digest!==head.digest)conflict();
  return {revision:head.digest,manifest:backupManifest(state,media,{asOf:clock()})};
 }
 async function inspect(input){
  const {state,head}=await snapshot(),prepared=inspectBackup(state,input,{ownerId:owner});
  const review={...prepared.review,sourceGeneration:head.generation},generation=ID.unique(),expiresAt=new Date(clock()+30*60*1000).toISOString();
  await db.createRow({...args('backup_reviews',rowId(owner,review.token)),data:{ownerId:owner,review:JSON.stringify(review),manifest:JSON.stringify(prepared.manifest),generation,expiresAt},permissions:[]});
  return {reviewToken:review.token,summary:prepared.summary};
 }
 async function loadReview(reviewToken){
  if(!token(reviewToken))fail('Inspect this backup again.');
  const row=await optional(()=>db.getRow(args('backup_reviews',rowId(owner,reviewToken))));
  if(!row||row.ownerId!==owner||!Array.isArray(row.$permissions)||row.$permissions.length!==0||Date.parse(row.expiresAt)<=clock()||!Number.isFinite(Date.parse(row.expiresAt)))fail('This backup review expired. Inspect it again.');
  let review,manifest;try{review=JSON.parse(row.review);manifest=JSON.parse(row.manifest);}catch{fail('Stored backup review is invalid.');}
  if(review.ownerId!==owner||review.token!==reviewToken||review.manifestDigest!==manifest.digest||typeof review.sourceGeneration!=='string'||typeof row.generation!=='string'||row.generation===review.sourceGeneration)fail('Stored backup review is invalid.');
  return {row,review,manifest};
 }
 function assertSource(head,review){if(head.ownerId!==owner||head.generation!==review.sourceGeneration||head.digest!==review.revision)conflict();}
 async function upload(input){
  fields(input,['reviewToken','namespace','photo']);const {row,review,manifest}=await loadReview(input.reviewToken),head=await db.getRow(args('workspace_heads',owner));assertSource(head,review);
  const {namespace,photo}=await validateBackupMedia(manifest,{namespace:input.namespace,photo:input.photo}),tx=await db.createTransaction({ttl:60});
  try{await stagePhotoMedia({db,storage,owner,generation:row.generation,transactionId:tx.$id,namespace,photo});await db.updateTransaction({transactionId:tx.$id,commit:true});return {ok:true};}
  catch(error){await db.updateTransaction({transactionId:tx.$id,rollback:true}).catch(()=>{});throw error;}
 }
 async function restore(input){
  fields(input,['requestId','reviewToken','confirmation']);
  if(typeof input.requestId!=='string'||!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(input.requestId)||!token(input.reviewToken)||input.confirmation!=='replace')fail('Confirm replacement of this workspace.',400);
  const receiptId=rowId(owner,input.requestId),fingerprint=digest({type:'backup.restore',payload:input});
  const receipt=async()=>{const saved=await optional(()=>db.getRow(args('command_receipts',receiptId)));if(!saved)return null;if(saved.ownerId!==owner||saved.fingerprint!==fingerprint)conflict();return JSON.parse(saved.result);};
  const prior=await receipt();if(prior)return prior;
  const {row,review,manifest}=await loadReview(input.reviewToken),{state,head}=await snapshot();assertSource(head,review);
  const media=await mediaRows(row.generation),byKey=new Map(media.map(item=>[item.namespace+':'+item.sourceId,item]));
  if(media.length!==manifest.media.length)fail('Upload every backup photo before restoring.');
  const prepared=await prepareBackupRestore(state,manifest,input,{ownerId:owner,review,readMedia:async(namespace,id)=>{
   const saved=byKey.get(namespace+':'+id),descriptor=mediaDescriptor(saved,{namespace,id},row.generation),expected=manifest.media.find(item=>item.namespace===namespace&&item.id===id);if(!isDeepStrictEqual(descriptor,expected))fail('Staged photo differs from the reviewed backup.');
   const metadata=await storage.getFile({bucketId:'private-media',fileId:saved.fileId});if(!isDeepStrictEqual(metadata.$permissions,permissions(owner)))fail('Staged photo ownership is invalid.');
   const bytes=Buffer.from(await storage.getFileView({bucketId:'private-media',fileId:saved.fileId}));return {id,dataUrl:'data:image/jpeg;base64,'+bytes.toString('base64')};
  }});
  const packed=packWorkspace(prepared.state,owner,row.generation);await stageBackupRows(db,packed.rows);
  const verified=await workspaceRows(db,owner,row.generation);sameRows(packed.rows,verified);unpackWorkspace(packed.head,verified);
  const tx=await db.createTransaction({ttl:60});
  try{
   if(Date.parse(row.expiresAt)<=clock())fail('This backup review expired. Inspect it again.');
   // Guard first, then re-read the actual head: concurrent diary edits conflict at commit.
   await db.updateRow({...args('workspace_heads',owner),data:{digest:head.digest},transactionId:tx.$id});
   const guard=await db.getRow(args('workspace_heads',owner));assertSource(guard,review);if(guard.$updatedAt!==head.$updatedAt)conflict();
   const retained=recoveryMarker(head,new Date(clock()).toISOString()),{$id:retainedId,$permissions:retainedPermissions,...retainedData}=retained;
   // A prior version is recoverable only when its exact manifest commits with the head swap.
   await db.createRow({...args('workspace_recoveries',retainedId),data:retainedData,permissions:retainedPermissions,transactionId:tx.$id});
   const result={ok:true,revision:packed.head.digest,recoveryGeneration:head.generation};
   await db.updateRow({...args('workspace_heads',owner),data:packed.head,transactionId:tx.$id});
   await db.createRow({...args('command_receipts',receiptId),data:{ownerId:owner,fingerprint,result:JSON.stringify(result)},permissions:permissions(owner),transactionId:tx.$id});
   await db.updateTransaction({transactionId:tx.$id,commit:true});return result;
  }catch(error){await db.updateTransaction({transactionId:tx.$id,rollback:true}).catch(()=>{});const saved=await receipt();if(saved)return saved;throw error;}
 }
 const recovery=createRecoveryView({db,storage,ownerId:owner});
 async function inspectRecovery(input){
  fields(input,['generation','revision']);const value=await recovery.preview(input),inspection=await inspect({manifest:value.manifest,revision:input.revision}),{row}=await loadReview(inspection.reviewToken);
  // Files are immutable, account-scoped and byte-verified by preview. Reuse their references;
  // restore verifies them again before the guarded head swap. No photo upload is needed.
  for(let offset=0;offset<value.mediaRows.length;offset+=100){
   const tx=await db.createTransaction({ttl:60});
   try{
    for(const media of value.mediaRows.slice(offset,offset+100)){
     const id=rowId(owner,row.generation,media.namespace,media.sourceId),data=Object.fromEntries(['ownerId','namespace','sourceId','fileId','digest','width','height','bytes'].map(key=>[key,media[key]]));data.generation=row.generation;
     await db.createRow({...args('workspace_media',id),data,permissions:permissions(owner),transactionId:tx.$id});
    }
    await db.updateTransaction({transactionId:tx.$id,commit:true});
   }catch(error){await db.updateTransaction({transactionId:tx.$id,rollback:true}).catch(()=>{});throw error;}
  }
  return inspection;
 }
 return {export:exportBackup,inspect,upload,restore,listRecoveries:recovery.list,inspectRecovery};
}
