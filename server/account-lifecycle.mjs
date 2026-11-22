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
 async function mutate(owner,work,recover=async()=>null){
  ownerId(owner);
  const deadline=performance.now()+8000;
  let backoff=80;
  for(;;){
   const row=await optional(()=>db.getRow(args('account_lifecycle',owner)));
   if(!row||row.ownerId!==owner||!Number.isSafeInteger(row.version))fail();
   const tx=await db.createTransaction({ttl:60});
   try{
    await db.updateRow({...args('account_lifecycle',owner),data:{version:row.version+1},transactionId:tx.$id});
    const current=await db.getRow(args('account_lifecycle',owner));
    if(current.version!==row.version||current.$updatedAt!==row.$updatedAt){
     throw Object.assign(Error('Lifecycle revision changed.'),{code:409,type:'lifecycle_revision_conflict'});
    }
    const result=await work(row,tx.$id);await db.updateTransaction({transactionId:tx.$id,commit:true});return result;
   }catch(error){
    // Appwrite ends a conflicting commit itself; a second rollback returns transaction_not_ready.
    let rolledBack=error.code===409&&error.type==='transaction_conflict';
    if(!rolledBack)try{await db.updateTransaction({transactionId:tx.$id,rollback:true});rolledBack=true;}catch{}
    const recovered=await recover();if(recovered)return recovered;
    if(error.code!==409||!rolledBack||error.publicMessage)throw error;
    // Diary preload and foreground reads register concurrently, including on different Site instances.
    if(performance.now()>=deadline)fail('The account is busy. Please try again.',503);
    await delay(randomInt(backoff/2,backoff+1));backoff=Math.min(640,backoff*2);
   }
  }
 }
 async function enter(owner,label){
  if(typeof label!=='string'||!label||label.length>80)fail('Operation identity is unavailable.',503);
  const id=randomUUID(),operation={id,owner,uncertain:false,markUncertain(){this.uncertain=true;}};
  return mutate(owner,async(row,transactionId)=>{
   if(row.state!=='active')fail();
   await db.createRow({...args('account_operations',id),data:{ownerId:owner,label,state:'active',createdAt:at(),reason:''},permissions:[],transactionId});
   return operation;
  },async()=>{const saved=await optional(()=>db.getRow(args('account_operations',id)));if(!saved)return null;if(saved.ownerId!==owner||saved.label!==label)fail('Operation ownership differs.',503);return operation;});
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
  return mutate(owner,async(row,transactionId)=>{if(row.state!=='active'&&(row.state!=='deleting'||row.jobId!==jobId))fail();await db.updateRow({...args('account_lifecycle',owner),data:{state:'deleting',jobId},transactionId});return true;},async()=>{const saved=await optional(()=>db.getRow(args('account_lifecycle',owner)));return saved?.ownerId===owner&&saved.state==='deleting'&&saved.jobId===jobId?true:null;});
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
