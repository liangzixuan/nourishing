import {randomInt,randomUUID} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import {Query} from 'node-appwrite';
const fail=(message='Account deletion is pending.',code=409)=>{throw Object.assign(Error(message),{code,publicMessage:message});};
const optional=async work=>{try{return await work();}catch(error){if(error.code===404)return null;throw error;}};

/** Server-only ownership of requests which can still finish account work. Never expire an operation. */
export function createAccountLifecycle({db,database='nourishing',now=()=>Date.now()}){
 const args=(tableId,rowId)=>({databaseId:database,tableId,rowId}),at=()=>new Date(now()).toISOString();
 function ownerId(owner){if(typeof owner!=='string'||!owner||owner.length>36)fail('Account identity is unavailable.',503);return owner;}
 async function initialize(owner){
  ownerId(owner);const input={...args('account_lifecycle',owner),data:{ownerId:owner,state:'active',jobId:'',version:0},permissions:[]};
  try{await db.createRow(input);}catch(error){
   const ambiguous=!Number.isInteger(error.code)||error.code>=500||error.code===408;
   if(error.code!==409&&!ambiguous)throw error;
   const row=await optional(()=>db.getRow(args('account_lifecycle',owner)));if(!row)throw error;
   if(row.ownerId!==owner||row.state!=='active'||row.jobId!==''||!Number.isSafeInteger(row.version))fail();
  }
 }
 async function enter(owner,label){
  ownerId(owner);
  if(typeof label!=='string'||!label||label.length>80)fail('Operation identity is unavailable.',503);
  const id=randomUUID(),operation={id,owner,uncertain:false,markUncertain(){this.uncertain=true;}};
  const marker=args('account_operations',id);
  const registration={ownerId:owner,label,state:'registering',createdAt:at(),reason:''};
  async function confirmed(write,state){
   try{await write();}catch(error){
    if(Number.isInteger(error.code)&&error.code<500&&![408,409].includes(error.code))throw error;
    const saved=await owned(operation);
    if(saved?.label!==label || saved.state!==state || saved.createdAt!==registration.createdAt)throw error;
   }
  }
  // Publish before checking the gate. A later deletion must drain this marker;
  // an earlier deletion makes the gate check fail before any account work starts.
  await confirmed(()=>db.createRow({...marker,data:registration,permissions:[]}), 'registering');
  try{
   const gate=await optional(()=>db.getRow(args('account_lifecycle',owner)));
   if(gate?.ownerId!==owner||gate.state!=='active'||gate.jobId!==''||!Number.isSafeInteger(gate.version))fail();
  }catch(error){
   // No activation was attempted. If removal is interrupted, the hourly cleanup
   // can still recognize this registration as never having started account work.
   await optional(()=>db.deleteRow(marker));
   throw error;
  }
  try{
   await confirmed(()=>db.updateRow({...marker,data:{state:'active'}}),'active');
   return operation;
  }catch(error){
   await settle(operation);
   throw error;
  }
 }
 async function owned(operation){const row=await optional(()=>db.getRow(args('account_operations',operation.id)));if(row&&row.ownerId!==operation.owner)fail('Operation ownership differs.',503);return row;}
 async function settle(operation){
  const rowArgs=args('account_operations',operation.id);
  for(let attempt=0;;attempt++){
   try{
    const row=await owned(operation);
    if(!row)return;
    // A lost update reply can leave a durable marker for the deletion worker.
    if(row.state!=='settled')await optional(()=>db.updateRow({...rowArgs,data:{state:'settled',reason:''}}));
    break;
   }catch(error){
    const transient=error instanceof TypeError && error.message==='fetch failed' ||
     error.code===408 || error.code===429 || error.code>=500 && error.code<600;
    if(!transient || error.publicMessage || attempt>=2)throw error;
    await delay(100*2**attempt);
   }
  }
  // If removal fails the worker can use the settled marker to finish cleanup.
  await db.deleteRow(rowArgs).catch(()=>{});
 }
 async function hold(operation,reason='mutation_outcome_unknown'){
  if(!await owned(operation))fail('Operation ownership is missing.',503);
  await db.updateRow({...args('account_operations',operation.id),data:{state:'uncertain',reason}});
 }
 async function run(owner,label,work){
  const operation=await enter(owner,label);let result;
  try{result=await work(operation);}catch(error){if(operation.uncertain)await hold(operation).catch(()=>{});else await settle(operation);throw error;}
  await settle(operation);return result;
 }
 async function claim(owner,jobId){
  if(typeof jobId!=='string'||!jobId||jobId.length>36)fail('Deletion identity is unavailable.',503);
  ownerId(owner);
  const deadline=performance.now()+8000;
  let backoff=80;
  for(;;){
   const row=await optional(()=>db.getRow(args('account_lifecycle',owner)));
   if(!row||row.ownerId!==owner||!Number.isSafeInteger(row.version))fail();
   if(row.state==='deleting' && row.jobId===jobId)return true;
   if(row.state!=='active')fail();
   const tx=await db.createTransaction({ttl:60});
   try{
    await db.updateRow({...args('account_lifecycle',owner),data:{state:'deleting',jobId,version:row.version+1},transactionId:tx.$id});
    const current=await db.getRow(args('account_lifecycle',owner));
    if(current.version!==row.version||current.$updatedAt!==row.$updatedAt){
     throw Object.assign(Error('Lifecycle revision changed.'),{code:409,type:'lifecycle_revision_conflict'});
    }
    await db.updateTransaction({transactionId:tx.$id,commit:true});return true;
   }catch(error){
    // Appwrite ends a conflicting commit itself; a second rollback returns transaction_not_ready.
    let rolledBack=error.code===409&&error.type==='transaction_conflict';
    if(!rolledBack)try{await db.updateTransaction({transactionId:tx.$id,rollback:true});rolledBack=true;}catch{}
    const saved=await optional(()=>db.getRow(args('account_lifecycle',owner)));
    if(saved?.ownerId===owner && saved.state==='deleting' && saved.jobId===jobId)return true;
    if(error.code!==409||!rolledBack||error.publicMessage)throw error;
    if(performance.now()>=deadline)fail('The account is busy. Please try again.',503);
    await delay(randomInt(backoff/2,backoff+1));backoff=Math.min(640,backoff*2);
   }
  }
 }
 async function pending(owner){
  const page=await db.listRows({databaseId:database,tableId:'account_operations',queries:[Query.equal('ownerId',ownerId(owner)),Query.limit(100)],total:false});let active=0,uncertain=0;
  for(const row of page.rows){if(row.ownerId!==owner)fail('Operation ownership differs.',503);if(row.state==='settled'){await db.deleteRow(args('account_operations',row.$id)).catch(error=>{if(error.code!==404)throw error;});}else{active++;if(row.state==='uncertain')uncertain++;}}
  return {active,uncertain,more:page.rows.length===100};
 }
 async function remove(owner,jobId){
  const row=await optional(()=>db.getRow(args('account_lifecycle',owner)));if(!row)return;if(row.ownerId!==owner||row.state!=='deleting'||row.jobId!==jobId)fail('Deletion ownership differs.',503);
  const waiting=await pending(owner);if(waiting.active||waiting.more)fail();await db.deleteRow(args('account_lifecycle',owner));
 }
 return {initialize,enter,settle,hold,run,claim,pending,remove};
}

// Activation updates this exact row before work begins. If activation wins after
// the delete is staged, Appwrite rejects the cleanup commit on the changed row.
export async function pruneAbandonedRegistrations({db,database,now,limit,timeLeft}){
 const cutoff=now-60*60*1000;
 const table={databaseId:database,tableId:'account_operations'};
 const page=await db.listRows({...table,queries:[Query.equal('state','registering'),Query.orderAsc('$createdAt'),Query.limit(limit)],total:false});
 const expired=row=>row?.state==='registering' && Date.parse(row.createdAt)<=cutoff;
 let pruned=0;
 for(const row of page.rows){
  if(!timeLeft())break;
  if(!expired(row))continue;
  const args={...table,rowId:row.$id};
  const tx=await db.createTransaction({ttl:60});
  try{
   await db.deleteRow({...args,transactionId:tx.$id});
   const current=await optional(()=>db.getRow(args));
   if(!expired(current)||current.ownerId!==row.ownerId||current.$updatedAt!==row.$updatedAt){
    await db.updateTransaction({transactionId:tx.$id,rollback:true});
    continue;
   }
   await db.updateTransaction({transactionId:tx.$id,commit:true});
   pruned++;
  }catch(error){
   await db.updateTransaction({transactionId:tx.$id,rollback:true}).catch(()=>{});
   if(![404,409].includes(error.code))throw error;
  }
 }
 return pruned;
}
