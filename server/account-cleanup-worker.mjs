import {pruneDiaryRemovalJobs} from './diary-range-removal-jobs.mjs';
import {pruneExpiredReminderReceipts} from './expired-reminder-receipts.mjs';
import {createAccountLifecycle} from './account-lifecycle.mjs';
import {Query} from 'node-appwrite';
import {pruneExpiredBackupReviews} from './expired-backup-reviews.mjs';
const eligible=(row,now)=>['prepared','complete'].includes(row.state)&&Number.isFinite(Date.parse(row.expiresAt))&&Date.parse(row.expiresAt)<=now&&(row.state!=='complete'||row.ownerId==='');
/** Private worker only. Pending deletion jobs and unresolved operations never expire here. */
export async function runAccountCleanup({db,deletion,lifecycle,database='nourishing',enabled=false,jobId,clock=()=>Date.now(),maxJobs=5,maxStepsPerJob=4,maxPrune=25,budgetMs=45000}={}){
 const result={enabled:enabled===true,examined:0,steps:0,deleted:0,needsAttention:0,failed:0,pruned:0,reviewsPruned:0,reviewsSkipped:0,reminderReceiptsPruned:0,reminderOwnersSkipped:0};if(enabled!==true)return result;
 if(!db||typeof deletion?.step!=='function'||typeof clock!=='function'||![maxJobs,maxStepsPerJob,maxPrune].every(value=>Number.isInteger(value)&&value>0&&value<=25)||!Number.isFinite(budgetMs)||budgetMs<=0||budgetMs>45000)throw Error('Invalid account cleanup limits.');
 if(jobId!==undefined&&(typeof jobId!=='string'||!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(jobId)))throw Error('Invalid cleanup job.');
 const started=Number(clock());if(!Number.isFinite(started))throw Error('Cleanup clock is unavailable.');const timeLeft=()=>Number(clock())-started<budgetMs,args=id=>({databaseId:database,tableId:'account_deletions',rowId:id});
 // Work is ordered by the last checkpoint so a stalled account does not starve newer jobs.
 const jobs=jobId?{rows:[await db.getRow(args(jobId))]}:await db.listRows({databaseId:database,tableId:'account_deletions',queries:[Query.equal('state','pending'),Query.orderAsc('updatedAt'),Query.limit(maxJobs)],total:false});
 for(const job of jobs.rows){
  if(jobId&&job.$id!==jobId)throw Error('Cleanup job identity differs.');
  if(job.state!=='pending')continue;
  if(!timeLeft())break;result.examined++;let previous=JSON.stringify({phase:job.phase,counts:JSON.parse(job.counts)});
  for(let index=0;index<maxStepsPerJob&&timeLeft();index++){
   try{
    const state=await deletion.step(job.$id);result.steps++;
    if(state.status==='deleted'){result.deleted++;break;}
    if(state.status==='needs_attention'){result.needsAttention++;break;}
    const progress=JSON.stringify({phase:state.phase,counts:state.counts});if(progress===previous||state.status!=='pending')break;previous=progress;
   }catch{result.failed++;break;}
  }
 }
 if(jobId||!timeLeft())return result;
 const expired=await db.listRows({databaseId:database,tableId:'account_deletions',queries:[Query.equal('state',['prepared','complete']),Query.lessThanEqual('expiresAt',new Date(started).toISOString()),Query.orderAsc('expiresAt'),Query.limit(maxPrune)],total:false});
 for(const candidate of expired.rows){
  if(!timeLeft())break;if(!eligible(candidate,started))continue;let tx;
  try{
   tx=await db.createTransaction({ttl:60});const current=await db.getRow(args(candidate.$id));
   if(!eligible(current,started)){await db.updateTransaction({transactionId:tx.$id,rollback:true});continue;}
   await db.deleteRow({...args(candidate.$id),transactionId:tx.$id});
   const guard=await db.getRow(args(candidate.$id));if(guard.version!==current.version||guard.$updatedAt!==current.$updatedAt||!eligible(guard,started))throw {code:409};
   await db.updateTransaction({transactionId:tx.$id,commit:true});result.pruned++;
  }catch(error){if(tx)await db.updateTransaction({transactionId:tx.$id,rollback:true}).catch(()=>{});if(![404,409].includes(error.code))result.failed++;}
 }
 if(timeLeft()){
  try{const reviews=await pruneExpiredBackupReviews({db,database,now:started,limit:maxPrune,timeLeft});result.reviewsPruned=reviews.pruned;result.reviewsSkipped=reviews.skipped;result.failed+=reviews.failed;}
  catch{result.failed++;}
 }
 if(timeLeft()){
  try{const receipts=await pruneExpiredReminderReceipts({db,lifecycle:lifecycle??createAccountLifecycle({db,database,now:clock}),database,now:started,limit:maxPrune,timeLeft});result.reminderReceiptsPruned=receipts.pruned;result.reminderOwnersSkipped=receipts.skipped;result.failed+=receipts.failed;}
  catch{result.failed++;}
 }
 if(timeLeft()){
  try{
   const removal=await pruneDiaryRemovalJobs({db,database,now:started,limit:maxJobs,timeLeft});
   if(removal.examined)result.diaryRemoval=removal;
   result.failed+=removal.failed;
  }catch{result.failed++;}
 }
 return result;
}
