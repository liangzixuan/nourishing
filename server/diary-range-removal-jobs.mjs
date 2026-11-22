import {ID,Query} from 'node-appwrite';
import {isDeepStrictEqual} from 'node:util';
import {rowId} from './data-codec.mjs';

const table='diary_removal_jobs',databaseId='nourishing',leaseMs=30*60_000;
const args=(tableId,rowId,database=databaseId)=>({databaseId:database,tableId,rowId});
const id=value=>typeof value==='string'&&/^[A-Za-z0-9][A-Za-z0-9._-]{0,35}$/.test(value);
const hash=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const jobId=(owner,fingerprint)=>rowId(owner,'diary-range-removal',fingerprint);
const iso=value=>new Date(value).toISOString();
const fail=(code,message)=>{throw Object.assign(Error(message),{code,publicMessage:message});};
const conflict=()=>fail(409,'Your Diary changed. Review the date range again.');
const optional=async read=>{try{return await read();}catch(error){if(error.code===404)return null;throw error;}};
const validJob=row=>row&&id(row.ownerId)&&id(row.sourceGeneration)&&id(row.generation)&&hash(row.fingerprint)&&
 row.$id===jobId(row.ownerId,row.fingerprint)&&isDeepStrictEqual(row.$permissions,[])&&
 (row.state==='retired'||row.state==='staging'&&row.sourceGeneration!==row.generation)&&
 typeof row.eligibleAt==='string'&&Number.isFinite(Date.parse(row.eligibleAt));
const sameJob=(left,right)=>validJob(right)&&left.$id===right.$id&&left.generation===right.generation&&left.sourceGeneration===right.sourceGeneration&&left.state===right.state;

export async function transaction(db,work){
 const tx=await db.createTransaction({ttl:60});
 try{
  const result=await work(tx.$id);
  await db.updateTransaction({transactionId:tx.$id,commit:true});
  return result;
 }catch(error){
  await db.updateTransaction({transactionId:tx.$id,rollback:true}).catch(()=>{});
  throw error;
 }
}

// Stage the guard first: it prevents a cleanup claim and a writer from committing together.
async function updateOwnedJob(db,job,data,transactionId,database=databaseId){
 const key=args(table,job.$id,database);
 await db.updateRow({...key,data,transactionId});
 const guard=await db.getRow(key);
 if(!sameJob(job,guard))conflict();
 return guard;
}

export async function reserveDiaryRemovalJob({db,owner,generation,fingerprint,now,verifyHead}){
  const key=args(table,jobId(owner,fingerprint));
  const existing=await optional(()=>db.getRow(key));
  if(!existing){
   await transaction(db,async transactionId=>{
    await db.createRow({...key,data:{ownerId:owner,fingerprint,state:'staging',sourceGeneration:generation,generation:ID.unique(),eligibleAt:iso(now()+leaseMs)},permissions:[],transactionId});
    await verifyHead();
   }).catch(error=>{if(error.code!==409||error.publicMessage)throw error;});
  }
  const job=await optional(()=>db.getRow(key));
  if(!validJob(job)||job.state!=='staging'||job.sourceGeneration!==generation||job.fingerprint!==fingerprint)conflict();
  return job;
 }

export const renewDiaryRemovalJob=(db,job,now,transactionId)=>
 updateOwnedJob(db,job,{eligibleAt:iso(now+leaseMs)},transactionId);
export const retireDiaryRemovalJob=(db,job,now,transactionId)=>
 updateOwnedJob(db,job,{state:'retired',generation:job.sourceGeneration,eligibleAt:iso(now)},transactionId);

/** Drain only this feature's retired generations. Explicit recovery snapshots retain their own data. */
export async function pruneDiaryRemovalJobs({db,database=databaseId,now=Date.now(),limit=5,timeLeft=()=>true}){
 if(!id(database)||!Number.isFinite(now)||!Number.isInteger(limit)||limit<1||limit>25)throw Error('Invalid Diary cleanup bounds.');
 const result={examined:0,pruned:0,rowsRemoved:0,skipped:0,failed:0};
 if(!timeLeft())return result;
 const jobs=await db.listRows({databaseId:database,tableId:table,queries:[Query.lessThanEqual('eligibleAt',iso(now)),Query.orderAsc('eligibleAt'),Query.limit(limit)],total:false});
 // Give every eligible job one page before using spare worker time on larger generations.
 const queue=[...jobs.rows],maxPages=25;
 for(let i=0;i<queue.length&&i<maxPages;i++){
  if(!timeLeft())break;
  const job=queue[i];
  if(i<jobs.rows.length)result.examined++;
  if(!validJob(job)||Date.parse(job.eligibleAt)>now){result.skipped++;continue;}
  try{
   const step=await transaction(db,async transactionId=>{
    const guard=await updateOwnedJob(db,job,{state:'retired',eligibleAt:iso(now)},transactionId,database);
    if(Date.parse(guard.eligibleAt)>now)conflict();
    const owner=job.ownerId,generation=job.generation;
    const head=await db.getRow(args('workspace_heads',owner,database));
    if(head.ownerId!==owner||head.$id!==owner||head.generation===generation)conflict();
    const retained=await optional(()=>db.getRow(args('workspace_recoveries',rowId(owner,generation),database)));
    if(retained&&(retained.ownerId!==owner||retained.generation!==generation))conflict();
    if(!retained){
     for(const tableId of ['workspace_records','workspace_media']){
      const scope=[Query.equal('ownerId',owner),Query.equal('generation',generation)];
      const page=await db.listRows({databaseId:database,tableId,queries:[...scope,Query.select(['$id','ownerId','generation','sourceId',tableId==='workspace_records'?'family':'namespace']),Query.limit(90)],total:false});
      if(!page.rows.length)continue;
      for(const row of page.rows){
       const family=tableId==='workspace_records'?row.family:row.namespace;
       if(row.ownerId!==owner||row.generation!==generation||row.$id!==rowId(owner,generation,family,row.sourceId))conflict();
      }
      // Restrict the bulk mutation to exactly the inspected rows.
      await db.deleteRows({databaseId:database,tableId,queries:[...scope,Query.equal('$id',page.rows.map(row=>row.$id)),Query.limit(90)],transactionId});
      return {count:page.rows.length,done:false};
     }
    }
    await db.deleteRow({...args(table,job.$id,database),transactionId});
    return {count:0,done:true};
   });
   result.rowsRemoved+=step.count;
   if(step.done)result.pruned++;
   else queue.push({...job,state:'retired',eligibleAt:iso(now)});
  }catch(error){
   if([404,409].includes(error.code))result.skipped++;else result.failed++;
  }
 }
 return result;
}
