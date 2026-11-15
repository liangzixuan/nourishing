import {ID,Permission,Role} from 'node-appwrite';
import {digest,rowId,packWorkspace,unpackWorkspace} from './data-codec.mjs';
import {createWorkspaceStore} from './workspace-store.mjs';
import {workspaceRows,stageWorkspaceRows,assertStagedRows,recoveryMarker} from './workspace-generations.mjs';
import {workspaceMediaRows,describeWorkspaceMedia,copyWorkspaceMediaRow} from './workspace-media.mjs';
import {backupReferences} from './backup.mjs';
import {validateCsvInput,prepareCsvImport,csvReview,verifyCsvReview} from './csv-import.mjs';
import {stageFastingDispatch} from './scheduler-dispatch.mjs';

const args=(tableId,id)=>({databaseId:'nourishing',tableId,rowId:id});
const fail=(message,code=409)=>{throw Object.assign(Error(message),{code,publicMessage:message});};
const conflict=()=>fail('Your workspace changed. Preview the CSV again.');
const permissions=owner=>[Permission.read(Role.user(owner))];
const optional=async read=>{try{return await read();}catch(error){if(error.code===404)return null;throw error;}};

/** Server database client; the owner comes from the authenticated account. */
export function createCsvImportStore({db,ownerId:owner,reviewSecret,now=()=>Date.now()}){
 if(typeof owner!=='string'||!owner||owner.length>36)fail('Sign in to import CSV.',401);
 const clock=()=>{const value=Number(now());if(!Number.isFinite(value))fail('CSV import clock is unavailable.',503);return value;};
 async function snapshot(){
  await createWorkspaceStore(db,owner).create();
  for(let attempt=0;attempt<3;attempt++){
   const head=await db.getRow(args('workspace_heads',owner));if(head.ownerId!==owner)fail('Workspace not found.',404);
   const rows=await workspaceRows(db,owner,head.generation),latest=await db.getRow(args('workspace_heads',owner));
   if(head.digest!==latest.digest||head.generation!==latest.generation||head.$updatedAt!==latest.$updatedAt)continue;
   return {head,state:unpackWorkspace(head,rows)};
  }
  conflict();
 }
 async function preview(input){
  validateCsvInput(input);const {head,state}=await snapshot(),{count}=prepareCsvImport(state,input);
  return {revision:head.digest,kind:input.kind,count,reviewToken:csvReview(input,{owner,revision:head.digest,count,reviewSecret,now:clock()})};
 }
 async function save(input){
  validateCsvInput(input,{saving:true});
  const receiptId=rowId(owner,input.requestId),fingerprint=digest({type:'csv.import',payload:input});
  const receipt=async()=>{const row=await optional(()=>db.getRow(args('command_receipts',receiptId)));if(!row)return null;if(row.ownerId!==owner||row.fingerprint!==fingerprint)conflict();return JSON.parse(row.result);};
  const prior=await receipt();if(prior)return prior;
  const review=verifyCsvReview(input,{owner,reviewSecret,now:clock()}),{head,state}=await snapshot();
  if(head.digest!==input.revision)conflict();
  const prepared=prepareCsvImport(state,input);if(prepared.count!==review.count)conflict();
  const generation=ID.unique(),packed=packWorkspace(prepared.state,owner,generation);
  // Staging remains invisible until the head and receipt commit together.
  await stageWorkspaceRows(db,packed.rows);
  const verified=await workspaceRows(db,owner,generation);assertStagedRows(packed.rows,verified);unpackWorkspace(packed.head,verified);
  const media=await workspaceMediaRows(db,owner,head.generation),byKey=new Map(media.map(row=>[row.namespace+':'+row.sourceId,row]));
  const copied=backupReferences(state).map(ref=>{const row=byKey.get(ref.namespace+':'+ref.id);describeWorkspaceMedia(row,ref,{owner,generation:head.generation});return copyWorkspaceMediaRow(row,{owner,generation});});
  await stageWorkspaceRows(db,copied,{tableId:'workspace_media'});
  assertStagedRows(copied,await workspaceMediaRows(db,owner,generation));
  const tx=await db.createTransaction({ttl:60});
  try{
   verifyCsvReview(input,{owner,reviewSecret,now:clock()});
   await db.updateRow({...args('workspace_heads',owner),data:{digest:head.digest},transactionId:tx.$id});
   const guard=await db.getRow(args('workspace_heads',owner));
   if(guard.ownerId!==owner||guard.generation!==head.generation||guard.digest!==head.digest||guard.$updatedAt!==head.$updatedAt)conflict();
   const {$id,$permissions,...retained}=recoveryMarker(head,new Date(clock()).toISOString());
   await db.createRow({...args('workspace_recoveries',$id),data:retained,permissions:$permissions,transactionId:tx.$id});
   const result={ok:true,revision:packed.head.digest,count:prepared.count};
   await db.updateRow({...args('workspace_heads',owner),data:packed.head,transactionId:tx.$id});
   await stageFastingDispatch({db,owner,state:prepared.state,generation,transactionId:tx.$id,now:new Date(clock()),timeZone:'UTC'});
   await db.createRow({...args('command_receipts',receiptId),data:{ownerId:owner,fingerprint,result:JSON.stringify(result)},permissions:permissions(owner),transactionId:tx.$id});
   await db.updateTransaction({transactionId:tx.$id,commit:true});return result;
  }catch(error){await db.updateTransaction({transactionId:tx.$id,rollback:true}).catch(()=>{});const saved=await receipt();if(saved)return saved;throw error;}
 }
 return {preview,import:save};
}
