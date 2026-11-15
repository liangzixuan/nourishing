import {randomUUID,randomBytes,createHash,timingSafeEqual} from 'node:crypto';
import {Query} from 'node-appwrite';
const fail=(message,code=409)=>{throw Object.assign(Error(message),{code,publicMessage:message});};
const hash=value=>createHash('sha256').update(value).digest('hex');
const optional=async work=>{try{return await work();}catch(error){if(error.code===404)return null;throw error;}};
// Active deletion jobs persist table indexes. Append tables to preserve those cursors.
const ownerTables=['workspace_records','workspace_media','workspace_recoveries','health_reviews','backup_reviews','command_receipts','account_deletions','push_deliveries'];
const singletonTables=['push_accounts','fasting_dispatch','workspace_heads','profiles'];

/** Bounded, resumable cleanup. Caller has already confirmed the account password before prepare. */
export function createAccountDeletion({db,storage,users,lifecycle,database='nourishing',now=()=>Date.now(),pageSize=25}){
 if(!Number.isInteger(pageSize)||pageSize<1||pageSize>100)throw Error('Deletion page size must be between 1 and 100.');
 const args=(tableId,rowId)=>({databaseId:database,tableId,rowId}),at=()=>new Date(now()).toISOString();
 const load=id=>db.getRow(args('account_deletions',id));
 function creationIdentity(user,owner){
  if(user?.$id!==owner||typeof user.$createdAt!=='string'||!user.$createdAt||user.$createdAt.length>40||!Number.isFinite(Date.parse(user.$createdAt)))fail('Account identity is unavailable.',503);
  return user.$createdAt;
 }
 async function originalUser(job){
  if(typeof job.userCreatedAt!=='string'||!job.userCreatedAt)fail('Deletion account identity is missing.',409);
  const user=await optional(()=>users.get({userId:job.ownerId}));if(!user)return null;
  if(user.$id!==job.ownerId||user.$createdAt!==job.userCreatedAt)fail('Deletion account identity differs.',409);
  return user;
 }
 function projection(job){return {status:job.state==='complete'?'deleted':job.state==='prepared'?'ready':job.error?'needs_attention':'pending',phase:job.phase,counts:JSON.parse(job.counts),updatedAt:job.updatedAt};}
 async function ticketJob(ticket){
  if(!ticket||typeof ticket.id!=='string'||!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(ticket.id)||typeof ticket.secret!=='string'||!/^[a-f0-9]{64}$/.test(ticket.secret))fail('Deletion status is unavailable.',403);
  const job=await optional(()=>load(ticket.id));if(!job||!timingSafeEqual(Buffer.from(hash(ticket.secret),'hex'),Buffer.from(job.tokenHash,'hex')))fail('Deletion status is unavailable.',403);
  if(job.state!=='pending'&&Date.parse(job.expiresAt)<=now())fail('Deletion status expired.',403);return job;
 }
 async function save(job,patch){
  const tx=await db.createTransaction({ttl:60});
  try{
   const current=await load(job.$id);if(current.version!==job.version)fail('Deletion progress changed. Retry.',409);
   await db.updateRow({...args('account_deletions',job.$id),data:{...patch,version:job.version+1,updatedAt:at()},transactionId:tx.$id});
   const guard=await load(job.$id);if(guard.version!==job.version||guard.$updatedAt!==job.$updatedAt)fail('Deletion progress changed. Retry.',409);
   await db.updateTransaction({transactionId:tx.$id,commit:true});return await load(job.$id);
  }catch(error){await db.updateTransaction({transactionId:tx.$id,rollback:true}).catch(()=>{});throw error;}
 }
 async function prepare(owner){
  const id=randomUUID(),secret=randomBytes(32).toString('hex');
  await lifecycle.run(owner,'deletion.prepare',async operation=>{
   const userCreatedAt=creationIdentity(await users.get({userId:owner}),owner);
   try{await db.createRow({...args('account_deletions',id),data:{ownerId:owner,userCreatedAt,tokenHash:hash(secret),state:'prepared',phase:'ready',cursor:'',version:0,expiresAt:new Date(now()+10*60*1000).toISOString(),updatedAt:at(),error:'',counts:JSON.stringify({files:0,rows:0})},permissions:[]});}
   catch(error){
    const saved=await optional(()=>load(id));if(saved?.ownerId===owner&&saved.userCreatedAt===userCreatedAt&&saved.tokenHash===hash(secret)&&saved.state==='prepared')return;
    if(!Number.isInteger(error.code)||error.code>=500||error.code===408)operation.markUncertain();throw error;
   }
  });
  return {ticket:{id,secret},status:projection(await load(id))};
 }
 async function begin(ticket,owner){
  let job=await ticketJob(ticket);if(job.state==='complete')return projection(job);if(job.ownerId!==owner)fail('This deletion belongs to another account.',403);
  // Persist consent before the lifecycle claim. A crash between these awaits is resumable by the worker.
  if(job.state==='prepared')job=await save(job,{state:'pending',phase:'block',expiresAt:new Date(now()+30*86400000).toISOString(),error:''});
  await lifecycle.claim(owner,job.$id);return projection(job);
 }
 function ownedFile(file,owner){
  const exact=`read("user:${owner}")`,permissions=file.$permissions;
  if(!Array.isArray(permissions))fail('File ownership is unavailable.',503);
  const mentions=permissions.some(value=>{const match=/^(?:read|write|update|delete)\("user:([^"/]+)(?:\/[^"/]*)?"\)$/.exec(value);return match?.[1]===owner;});
  if(!mentions)return false;if(permissions.length!==1||permissions[0]!==exact)fail('File ownership needs attention.',409);return true;
 }
 async function deleteOwned(fileId,owner,{required=false}={}){
  const file=await optional(()=>storage.getFile({bucketId:'private-media',fileId}));if(!file)return 0;
  if(!ownedFile(file,owner)){if(required)fail('A mapped photo belongs to another account.',409);return 0;}
  await optional(()=>storage.deleteFile({bucketId:'private-media',fileId}));return 1;
 }
 const rows=(tableId,owner)=>db.listRows({databaseId:database,tableId,queries:[Query.equal('ownerId',owner),Query.limit(pageSize)],total:false});
 async function filePage(cursor){return storage.listFiles({bucketId:'private-media',queries:[Query.orderAsc('$id'),Query.limit(pageSize),...(cursor?[Query.cursorAfter(cursor)]:[])],total:false});}
 async function step(id){
  let job=await load(id);if(job.state!=='pending')return projection(job);const owner=job.ownerId;if(!owner)fail('Deletion ownership is missing.',503);
  const counts=JSON.parse(job.counts),next=patch=>save(job,{error:'',...patch,counts:JSON.stringify(counts)});
  try{
   // Appwrite permits a deleted user ID to be reused. Retried work belongs to the captured account only.
   await originalUser(job);
   if(job.phase==='block'){
    await lifecycle.claim(owner,id);
    if(await originalUser(job))await optional(()=>users.updateStatus({userId:owner,status:false}));
    if(await originalUser(job))await optional(()=>users.deleteSessions({userId:owner}));job=await next({phase:'drain'});
   }else if(job.phase==='drain'){
    const waiting=await lifecycle.pending(owner);job=await next(waiting.active||waiting.more?{error:waiting.uncertain?'operation_outcome_unknown':''}:{phase:'media'});
   }else{
    const gate=await optional(()=>db.getRow(args('account_lifecycle',owner)));
    if(job.phase!=='finish'&&(!gate||gate.ownerId!==owner||gate.state!=='deleting'||gate.jobId!==id))fail('Deletion ownership differs.',409);
    if(job.phase==='media'){
     const page=await rows('workspace_media',owner);for(const row of page.rows){if(row.ownerId!==owner||typeof row.fileId!=='string')fail('Photo mapping ownership is invalid.',409);counts.files+=await deleteOwned(row.fileId,owner,{required:true});await optional(()=>db.deleteRow(args('workspace_media',row.$id)));counts.rows++;}
     job=await next(page.rows.length?{}:{phase:'files',cursor:''});
    }else if(job.phase==='files'||job.phase==='verifyFiles'){
     let page;try{page=await filePage(job.cursor);}catch(error){if(error.code===400&&job.cursor)return projection(await next({cursor:''}));throw error;}
     const verify=job.phase==='verifyFiles';
     if(verify){
      if(page.files.some(file=>ownedFile(file,owner)))job=await next({phase:'files',cursor:''});
      else job=await next(page.files.length===pageSize?{cursor:page.files.at(-1).$id}:{phase:'user',cursor:''});
     }else{
      // Keep the last file as a cursor anchor until the following page has been read.
      if(job.cursor)counts.files+=await deleteOwned(job.cursor,owner);
      const full=page.files.length===pageSize,items=full?page.files.slice(0,-1):page.files;
      for(const file of items)if(ownedFile(file,owner))counts.files+=await deleteOwned(file.$id,owner);
      job=await next(full?{cursor:page.files.at(-1).$id}:{phase:'rows:0',cursor:''});
     }
    }else if(job.phase.startsWith('rows:')||job.phase.startsWith('verifyRows:')){
     const verify=job.phase.startsWith('verify'),index=Number(job.phase.split(':')[1]),tableId=ownerTables[index];
     if(tableId){
      const page=await rows(tableId,owner),items=page.rows.filter(row=>tableId!=='account_deletions'||row.$id!==id);for(const row of items)if(row.ownerId!==owner)fail('Row ownership differs.',409);
      if(verify&&items.length)job=await next({phase:'rows:'+index});
      else{if(!verify)for(const row of items){await optional(()=>db.deleteRow(args(tableId,row.$id)));counts.rows++;}job=await next(items.length?{}:{phase:(verify?'verifyRows:':'rows:')+(index+1)});}
     }else{
      let found=false;for(const table of singletonTables){const row=await optional(()=>db.getRow(args(table,owner)));if(!row)continue;if(table==='workspace_heads'&&row.ownerId!==owner)fail('Workspace ownership differs.',409);found=true;if(!verify){await optional(()=>db.deleteRow(args(table,owner)));counts.rows++;}}
      job=await next(verify&&found?{phase:'rows:'+ownerTables.length}:verify?{phase:'verifyFiles',cursor:''}:{phase:'verifyRows:0'});
     }
    }else if(job.phase==='user'){
     const waiting=await lifecycle.pending(owner);if(waiting.active||waiting.more)job=await next({phase:'drain'});
     else{if(await originalUser(job))await optional(()=>users.delete({userId:owner}));if(await originalUser(job))fail('Account removal is not confirmed.',503);job=await next({phase:'finish'});}
    }else if(job.phase==='finish'){
     if(await originalUser(job))fail('Account removal is not confirmed.',503);
     await lifecycle.remove(owner,id);
     if(await originalUser(job))fail('Account removal is not confirmed.',503);
     job=await next({state:'complete',phase:'done',ownerId:'',userCreatedAt:'',cursor:'',expiresAt:new Date(now()+7*86400000).toISOString()});
    }else fail('Deletion stage is invalid.',503);
   }
  }catch(error){
   const latest=await load(id);if(latest.version!==job.version||latest.state==='complete')return projection(latest);
   try{job=await save(job,{error:error.code===409?'ownership_needs_attention':'cleanup_retry_needed'});}
   catch(progressError){if(progressError.code===409)return projection(await load(id));throw progressError;}
  }
  return projection(job);
 }
 async function status(ticket,{advance=false}={}){const job=await ticketJob(ticket);return advance&&job.state==='pending'?step(job.$id):projection(job);}
 return {prepare,begin,status,step};
}
