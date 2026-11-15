import {workspaceMediaRows,describeWorkspaceMedia,copyWorkspaceMediaRow} from './workspace-media.mjs';
import {ID,Permission,Role} from 'node-appwrite';
import {isDeepStrictEqual} from 'node:util';
import {digest,rowId,packWorkspace,unpackWorkspace} from './data-codec.mjs';
import {createWorkspaceStore} from './workspace-store.mjs';
import {workspaceRows,stageWorkspaceRows,assertStagedRows,recoveryMarker} from './workspace-generations.mjs';
import {stagePhotoMedia} from './photo-storage.mjs';
import {backupReferences,backupManifest,inspectBackup,validateBackupMedia,prepareBackupRestore} from './backup.mjs';
import {createRecoveryView} from './recovery-view.mjs';
import {stageFastingDispatch} from './scheduler-dispatch.mjs';
import {stageReminderDispatch} from './reminder-schedules-dispatch.mjs';

const databaseId='nourishing',args=(tableId,id)=>({databaseId,tableId,rowId:id});
const fail=(message,code=409)=>{throw Object.assign(Error(message),{code,publicMessage:message});};
const conflict=()=>fail('Your workspace changed. Inspect the backup again.');
const token=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const permissions=owner=>[Permission.read(Role.user(owner))];
const optional=async operation=>{try{return await operation();}catch(error){if(error.code===404)return null;throw error;}};
const fields=(value,keys)=>{if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).length!==keys.length||keys.some(key=>!Object.hasOwn(value,key)))fail('Invalid backup request.',400);};
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
 const mediaRows=generation=>workspaceMediaRows(db,owner,generation);
 const mediaDescriptor=(row,ref,generation)=>describeWorkspaceMedia(row,ref,{owner,generation});
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
  const packed=packWorkspace(prepared.state,owner,row.generation);await stageWorkspaceRows(db,packed.rows);
  const verified=await workspaceRows(db,owner,row.generation);assertStagedRows(packed.rows,verified);unpackWorkspace(packed.head,verified);
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
   await stageFastingDispatch({db,owner,state:prepared.state,generation:row.generation,transactionId:tx.$id,now:new Date(clock()),timeZone:'UTC'});
   await stageReminderDispatch({db,owner,state:prepared.state,generation:row.generation,transactionId:tx.$id,now:new Date(clock())});
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
     const {$id:id,$permissions:acl,...data}=copyWorkspaceMediaRow(media,{owner,generation:row.generation});
     await db.createRow({...args('workspace_media',id),data,permissions:acl,transactionId:tx.$id});
    }
    await db.updateTransaction({transactionId:tx.$id,commit:true});
   }catch(error){await db.updateTransaction({transactionId:tx.$id,rollback:true}).catch(()=>{});throw error;}
  }
  return inspection;
 }
 return {export:exportBackup,inspect,upload,restore,listRecoveries:recovery.list,inspectRecovery};
}
