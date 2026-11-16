import {Query} from 'node-appwrite';
import {withinAccountOperation} from './account-operation-context.mjs';
import {REMINDER_HISTORY_MS,pruneReminderReceipts} from './reminder-receipt-retention.mjs';

/** Private maintenance only. Oldest receipts make paused accounts discoverable without a cursor. */
export async function pruneExpiredReminderReceipts({db,lifecycle,database='nourishing',now,limit=25,timeLeft=()=>true}){
 const result={pruned:0,skipped:0,failed:0};
 if(!Number.isFinite(now)||!Number.isInteger(limit)||limit<1||limit>100)throw Error('Invalid receipt cleanup limits.');
 const cutoff=new Date(now-REMINDER_HISTORY_MS).toISOString();
 const page=await db.listRows({databaseId:database,tableId:'push_deliveries',queries:[Query.lessThan('createdAt',cutoff),Query.orderAsc('createdAt'),Query.limit(limit)],total:false}),owners=new Set();
 for(const candidate of page.rows){
  if(!timeLeft()||result.pruned>=limit)break;
  if(typeof candidate.ownerId!=='string'||!candidate.ownerId||candidate.ownerId.length>36||candidate.$permissions?.length!==0||!Number.isFinite(Date.parse(candidate.createdAt))||candidate.createdAt>=cutoff){result.failed++;continue;}
  const owner=candidate.ownerId;if(owners.has(owner))continue;owners.add(owner);
  try{
   const value=await lifecycle.run(owner,'reminders.prune',operation=>withinAccountOperation(operation,()=>pruneReminderReceipts({db,owner,database,now:new Date(now),limit:limit-result.pruned,timeLeft})));
   result.pruned+=value.removed;
  }catch(error){if([404,409].includes(error.code))result.skipped++;else result.failed++;}
 }
 return result;
}
