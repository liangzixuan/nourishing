import {Permission,Query,Role} from 'node-appwrite';
import {isDeepStrictEqual} from 'node:util';
import {createWorkspaceStore} from './workspace-store.mjs';
import {digest,rowId,packWorkspace,unpackWorkspace} from './data-codec.mjs';
import {encodeCommandReceipt,decodeCommandReceipt} from './command-receipt-codec.mjs';
import {workspaceRows,stageWorkspaceRows,assertStagedRows} from './workspace-generations.mjs';
import {workspaceMediaRows,copyWorkspaceMediaRow,describeWorkspaceMedia} from './workspace-media.mjs';
import {backupReferences} from './backup.mjs';
import {stageFastingDispatch} from './scheduler-dispatch.mjs';
import {stageReminderDispatch} from './reminder-schedules-dispatch.mjs';
import {parseDiaryRangeRemoval,removeDiaryRange} from './domain/diary-range-removal.mjs';

import {reserveDiaryRemovalJob,renewDiaryRemovalJob,retireDiaryRemovalJob,transaction} from './diary-range-removal-jobs.mjs';

const databaseId='nourishing';
const args=(tableId,rowId)=>({databaseId,tableId,rowId});
const acl=owner=>[Permission.read(Role.user(owner))];
const id=value=>typeof value==='string'&&/^[A-Za-z0-9][A-Za-z0-9._-]{0,35}$/.test(value);
const hash=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const fail=(code,message)=>{throw Object.assign(Error(message),{code,publicMessage:message});};
const conflict=()=>fail(409,'Your Diary changed. Review the date range again.');
const optional=async read=>{try{return await read();}catch(error){if(error.code===404)return null;throw error;}};
const sameHead=(left,right)=>left.$id===right.$id&&left.ownerId===right.ownerId&&left.generation===right.generation&&left.digest===right.digest&&left.$updatedAt===right.$updatedAt;

export function createDiaryRangeRemovalStore({db,ownerId:owner,now=()=>Date.now()}){
 if(!id(owner))fail(401,'Sign in to manage your Diary.');
 const headKey=args('workspace_heads',owner);
 async function snapshot(){
  await createWorkspaceStore(db,owner).create();
  const head=await db.getRow(headKey);
  if(head.$id!==owner||head.ownerId!==owner||!id(head.generation)||!isDeepStrictEqual(head.$permissions,acl(owner)))fail(409,'The Diary owner could not be verified.');
  const rows=await workspaceRows(db,owner,head.generation);
  if(!sameHead(head,await db.getRow(headKey)))conflict();
  if(rows.some(row=>!isDeepStrictEqual(row.$permissions,acl(owner))))fail(409,'Diary record ownership could not be verified.');
  return {head,state:unpackWorkspace(head,rows)};
 }
 async function preview(input){
  const range=parseDiaryRangeRemoval(input),{head,state}=await snapshot();
  return {revision:head.digest,removed:removeDiaryRange(state,range)};
 }
 async function remove(input){
  if(!input||typeof input!=='object'||Array.isArray(input))fail(400,'Invalid Diary deletion.');
  const {requestId,revision,...fields}=input,range=parseDiaryRangeRemoval(fields);
  if(typeof requestId!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestId)||!hash(revision))fail(400,'Review the current Diary before deleting data.');
  const fingerprint=digest({type:'diary.range.remove',requestId,revision,range});
  const receiptKey=args('command_receipts',rowId(owner,requestId));
  const receipt=async()=>{
   const record=await optional(()=>db.getRow(receiptKey));
   if(!record)return null;
   if(record.ownerId!==owner||record.fingerprint!==fingerprint)conflict();
   return decodeCommandReceipt(record.result);
  };
  const prior=await receipt();if(prior)return prior;
  try{
   const {head,state}=await snapshot();if(head.digest!==revision)conflict();
   const removed=removeDiaryRange(state,range);
   let job,packed;
   if(Object.values(removed).some(count=>count>0)){
    job=await reserveDiaryRemovalJob({db,owner,generation:head.generation,fingerprint,now,verifyHead:async()=>{
     if(!sameHead(head,await db.getRow(headKey)))conflict();
    }});
    packed=packWorkspace(state,owner,job.generation);
    // Reuse verified batches after interruption. Each new batch and renewal are atomic.
    const stagedDb={
     listRows:input=>db.listRows(input),
     createRows:async input=>{
      await transaction(db,async transactionId=>{
       await renewDiaryRemovalJob(db,job,now(),transactionId);
       await db.createRows({...input,transactionId});
      });
      // Transactional bulk writes can acknowledge staging before materializing rows.
      return db.listRows({databaseId,tableId:input.tableId,queries:[
       Query.equal('$id',input.rows.map(row=>row.$id)),Query.limit(input.rows.length),
      ],total:false});
     },
    };
    await stageWorkspaceRows(stagedDb,packed.rows);
    const staged=await workspaceRows(db,owner,job.generation);
    assertStagedRows(packed.rows,staged);
    const media=await workspaceMediaRows(db,owner,head.generation);
    const byKey=new Map(media.map(row=>[row.namespace+':'+row.sourceId,row]));
    const copied=backupReferences(state).map(ref=>{
     const row=byKey.get(ref.namespace+':'+ref.id);
     describeWorkspaceMedia(row,ref,{owner,generation:head.generation});
     return copyWorkspaceMediaRow(row,{owner,generation:job.generation});
    });
    await stageWorkspaceRows(stagedDb,copied,{tableId:'workspace_media'});
    assertStagedRows(copied,await workspaceMediaRows(db,owner,job.generation));
   }
   return await transaction(db,async transactionId=>{
    await db.updateRow({...headKey,data:{digest:head.digest},transactionId});
    if(!sameHead(head,await db.getRow(headKey)))conflict();
    if(job){
     await retireDiaryRemovalJob(db,job,now(),transactionId);
     await db.updateRow({...headKey,data:packed.head,transactionId});
     const when=new Date(now());
     await stageFastingDispatch({db,owner,state,generation:job.generation,transactionId,now:when,timeZone:range.timeZone});
     await stageReminderDispatch({db,owner,state,generation:job.generation,transactionId,now:when});
    }
    const result={ok:true,revision:packed?.head.digest??revision,removed};
    await db.createRow({...receiptKey,data:{ownerId:owner,fingerprint,result:encodeCommandReceipt(result)},permissions:acl(owner),transactionId});
    return result;
   });
  }catch(error){
   const saved=await receipt();if(saved)return saved;
   throw error;
  }
 }
 return {preview,remove};
}
