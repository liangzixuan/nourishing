import {workspaceRows,stageWorkspaceRows,assertStagedRows,recoveryMarker} from './workspace-generations.mjs';
import {verifiedWorkspaceMedia,workspaceMediaRows,copyWorkspaceMediaRow} from './workspace-media.mjs';
import {backupReferences,backupManifest} from './backup.mjs';
import {previewHealthReconciliation,prepareHealthReconciliation} from './health-reconciliation.mjs';
import {tickCloudFasting} from './fasting.mjs';
import {beginCloudLogging,finishCloudLogging,loggingCalendar} from './cloud-logging.mjs';
import {ID,Permission,Role} from 'node-appwrite';
import {digest,packWorkspace,rowId,unpackWorkspace} from './data-codec.mjs';
import {initialState} from './domain/workspace.mjs';
import {initializeHealthExportState,installHealthExportMetadata} from './health-export-state.mjs';
import {applyWorkspaceCommand,parseCommand,readActionFoods,captureActionFoods} from './workspace-commands.mjs';
const databaseId='nourishing',args=(tableId,id)=>({databaseId,tableId,rowId:id});
const conflict=()=>{throw Object.assign(Error('This diary changed. Refresh it before saving.'),{code:409,publicMessage:'This diary changed. Refresh it before saving.'});};
const permissions=owner=>[Permission.read(Role.user(owner))];
async function optional(db,table,id){try{return await db.getRow(args(table,id));}catch(error){if(error.code===404)return null;throw error;}}
const dataOf=({$id,$permissions,...data})=>data;
function nextRecoverySnapshot(head,state){
 let current=head.recoverySequence??0;
 if(!Number.isSafeInteger(current)||current<0)throw Object.assign(Error('Recovery sequence is invalid.'),{code:503});
 for(const receipt of state.healthSync?.streams??[])current=Math.max(current,receipt.recoverySnapshotId??0);
 if(!Number.isSafeInteger(current)||current>=Number.MAX_SAFE_INTEGER)throw Object.assign(Error('Recovery sequence is exhausted.'),{code:503});
 return current+1;
}
export function createWorkspaceStore(db,owner){
 async function create(){
  if(await optional(db,'workspace_heads',owner))return;
  const state=initialState();initializeHealthExportState(state);
  const packed=packWorkspace(state,owner,ID.unique()),tx=await db.createTransaction({ttl:60});
  try{
   for(const row of packed.rows)await db.createRow({...args('workspace_records',row.$id),data:dataOf(row),permissions:row.$permissions,transactionId:tx.$id});
   await db.createRow({...args('workspace_heads',owner),data:packed.head,permissions:permissions(owner),transactionId:tx.$id});
   await db.updateTransaction({transactionId:tx.$id,commit:true});
  }catch(error){await db.updateTransaction({transactionId:tx.$id,rollback:true}).catch(()=>{});if(error.code===409&&await optional(db,'workspace_heads',owner))return;throw error;}
 }
 async function persist(state,before,h,transactionId){
   const packed=packWorkspace(state,owner,h.generation),old=new Map(before.map(row=>[row.$id,row]));
   for(const row of packed.rows){const prior=old.get(row.$id);old.delete(row.$id);if(prior&&prior.digest===row.digest&&prior.position===row.position&&prior.day===row.day)continue;
    await db[prior?'updateRow':'createRow']({...args('workspace_records',row.$id),data:dataOf(row),...(prior?{}:{permissions:row.$permissions}),transactionId:transactionId});
   }
   for(const id of old.keys())await db.deleteRow({...args('workspace_records',id),transactionId:transactionId});
   await db.updateRow({...args('workspace_heads',owner),data:packed.head,transactionId:transactionId});
   return packed.head.digest;
 }
 async function command(raw,readCatalog,context={}){
  const input=parseCommand(raw),receiptId=rowId(owner,input.requestId),fingerprint=digest(input),receipt=await optional(db,'command_receipts',receiptId);
  if(receipt){if(receipt.ownerId!==owner||receipt.fingerprint!==fingerprint)conflict();return JSON.parse(receipt.result);}
  const h=await db.getRow(args('workspace_heads',owner));if(h.ownerId!==owner||h.digest!==input.revision)conflict();
  // Resolve catalog facts before opening the short-lived write transaction.
  const catalogFoods=await readActionFoods(input,readCatalog);
  const tx=await db.createTransaction({ttl:60});
  try{
   // Stage this shared guard first. Any later concurrent commit changes it and conflicts.
   await db.updateRow({...args('workspace_heads',owner),data:{digest:h.digest},transactionId:tx.$id});
   const guard=await db.getRow(args('workspace_heads',owner));if(guard.digest!==h.digest||guard.$updatedAt!==h.$updatedAt)conflict();
   const before=await workspaceRows(db,owner,h.generation);let state;
   try{state=unpackWorkspace(h,before);}catch(error){const latest=await db.getRow(args('workspace_heads',owner));if(latest.digest!==h.digest)conflict();throw error;}
   context.beforeApply?.();
   const loggingBefore=beginCloudLogging(state,input.type);
   const calendar=loggingBefore?await loggingCalendar(db,owner,context):null;
   const action=captureActionFoods(state,{type:input.type,payload:input.payload},catalogFoods);
   const saved=applyWorkspaceCommand(state,action,context);
   finishCloudLogging(state,loggingBefore,input.type,calendar);
   if(context.stageMedia)await context.stageMedia({transactionId:tx.$id,generation:h.generation});
   const revision=await persist(state,before,h,tx.$id);
   const result={ok:true,revision,...(saved?.counts?{counts:saved.counts}:{}),...(saved?.entryIds?{entryIds:saved.entryIds}:{}),...(saved?.photoId?{photoId:saved.photoId}:{}),...(saved?.id?{item:{kind:saved.kind,id:saved.id}}:{})};
   await db.createRow({...args('command_receipts',receiptId),data:{ownerId:owner,fingerprint,result:JSON.stringify(result)},permissions:permissions(owner),transactionId:tx.$id});
   await db.updateTransaction({transactionId:tx.$id,commit:true});return result;
  }catch(error){
   await db.updateTransaction({transactionId:tx.$id,rollback:true}).catch(()=>{});
   const saved=await optional(db,'command_receipts',receiptId);if(saved&&saved.ownerId===owner&&saved.fingerprint===fingerprint)return JSON.parse(saved.result);
   if(error.code===409)conflict();throw error;
  }
 }
 async function tickFasting(context){
  const h=await db.getRow(args('workspace_heads',owner));if(h.ownerId!==owner)conflict();
  const before=await workspaceRows(db,owner,h.generation);let state;
  try{state=unpackWorkspace(h,before);}catch(error){const latest=await db.getRow(args('workspace_heads',owner));if(latest.digest!==h.digest)conflict();throw error;}
  tickCloudFasting(state,context);if(digest(state)===h.digest)return {changed:false};
  const tx=await db.createTransaction({ttl:60});
  try{
   await db.updateRow({...args('workspace_heads',owner),data:{digest:h.digest},transactionId:tx.$id});
   const guard=await db.getRow(args('workspace_heads',owner));if(guard.digest!==h.digest||guard.$updatedAt!==h.$updatedAt)conflict();
   const revision=await persist(state,before,h,tx.$id);await db.updateTransaction({transactionId:tx.$id,commit:true});return {changed:true,revision};
  }catch(error){await db.updateTransaction({transactionId:tx.$id,rollback:true}).catch(()=>{});if(error.code===409)conflict();throw error;}
 }
 /** Operator-only migration. Existing heads never acquire a generated namespace on read. */
 async function importHealthExportMetadata(metadata,{revision}={}){
  if(typeof revision!=='string'||!/^[a-f0-9]{64}$/.test(revision))conflict();
  const h=await db.getRow(args('workspace_heads',owner));if(h.ownerId!==owner)conflict();
  const before=await workspaceRows(db,owner,h.generation),state=unpackWorkspace(h,before);
  const result=installHealthExportMetadata(state,metadata);
  if(!result.changed)return {changed:false,revision:h.digest};
  if(h.digest!==revision)conflict();
  const tx=await db.createTransaction({ttl:60});
  try{
   await db.updateRow({...args('workspace_heads',owner),data:{digest:h.digest},transactionId:tx.$id});
   const guard=await db.getRow(args('workspace_heads',owner));if(guard.digest!==h.digest||guard.$updatedAt!==h.$updatedAt)conflict();
   const next=await persist(state,before,h,tx.$id);await db.updateTransaction({transactionId:tx.$id,commit:true});return {changed:true,revision:next};
  }catch(error){await db.updateTransaction({transactionId:tx.$id,rollback:true}).catch(()=>{});if(error.code===409)conflict();throw error;}
 }
 async function reconcileHealth(input,{reviewSecret,storage}={}){
  const head=await db.getRow(args('workspace_heads',owner));if(head.ownerId!==owner)conflict();
  const before=await workspaceRows(db,owner,head.generation),state=unpackWorkspace(head,before),context={ownerId:owner,reviewSecret};
  const preview=previewHealthReconciliation(state,input?.batch,context);
  const removes=!preview.replayed&&preview.counts.deleted+preview.counts.replaced+preview.counts.invalidated>0;
  const snapshotId=removes?nextRecoverySnapshot(head,state):undefined;
  const prepared=prepareHealthReconciliation(state,input,{...context,snapshotId});
  if(prepared.result.replayed)return prepared.result;
  let packed,retained;
  if(prepared.needsSnapshot){
   // The recovery marker is a promise that this exact old generation can be restored.
   // Verify every referenced photo and record permission before staging that promise.
   if(before.some(row=>JSON.stringify(row.$permissions)!==JSON.stringify(permissions(owner))))throw Object.assign(Error('Recovery record ownership is invalid.'),{code:409});
   const media=await verifiedWorkspaceMedia({db,storage,owner,generation:head.generation,references:backupReferences(state)});
   const retainedAt=new Date().toISOString();backupManifest(state,media.descriptors,{asOf:retainedAt});
   retained=recoveryMarker(head,retainedAt,{snapshotId});
   const generation=rowId(owner,'health-reconciliation',head.generation,head.digest,preview.batchDigest,snapshotId);
   packed=packWorkspace(prepared.state,owner,generation);await stageWorkspaceRows(db,packed.rows);
   const staged=await workspaceRows(db,owner,generation);assertStagedRows(packed.rows,staged);unpackWorkspace(packed.head,staged);
   const copied=media.rows.map(row=>copyWorkspaceMediaRow(row,{owner,generation}));
   await stageWorkspaceRows(db,copied,{tableId:'workspace_media'});assertStagedRows(copied,await workspaceMediaRows(db,owner,generation));
  }
  const tx=await db.createTransaction({ttl:60});
  try{
   await db.updateRow({...args('workspace_heads',owner),data:{digest:head.digest},transactionId:tx.$id});
   const guard=await db.getRow(args('workspace_heads',owner));if(guard.ownerId!==owner||guard.generation!==head.generation||guard.digest!==head.digest||guard.$updatedAt!==head.$updatedAt)conflict();
   if(prepared.needsSnapshot){
    const {$id,$permissions,...data}=retained;
    await db.createRow({...args('workspace_recoveries',$id),data,permissions:$permissions,transactionId:tx.$id});
    await db.updateRow({...args('workspace_heads',owner),data:{...packed.head,recoverySequence:snapshotId},transactionId:tx.$id});
   }else await persist(prepared.state,before,head,tx.$id);
   await db.updateTransaction({transactionId:tx.$id,commit:true});return prepared.result;
  }catch(error){
   await db.updateTransaction({transactionId:tx.$id,rollback:true}).catch(()=>{});
   // The source receipt is committed inside healthSync with the same head. It is
   // the sole authority for exact lost-response replay, including removal IDs.
   try{const latest=await db.getRow(args('workspace_heads',owner));if(latest.ownerId===owner){const current=unpackWorkspace(latest,await workspaceRows(db,owner,latest.generation)),replay=prepareHealthReconciliation(current,input,context);if(replay.result.replayed)return replay.result;}}catch{}
   if(error.code===409)conflict();throw error;
  }
 }
 return {create,command,tickFasting,importHealthExportMetadata,reconcileHealth};
}
