import {Query} from 'node-appwrite';

// PC server/reminders.mjs: HISTORY_MS and MAX_DELIVERIES, shared by tests and schedules.
export const REMINDER_HISTORY_MS=90*86400000,MAX_REMINDER_RECEIPTS=20000;
const receiptTable=database=>({databaseId:database,tableId:'push_deliveries'});
const fail=(message='Notification history is unavailable.')=>{throw Object.assign(Error(message),{code:503,status:503,publicMessage:message});};
function ownerId(owner){if(typeof owner!=='string'||!owner||owner.length>36)fail();}
function owned(row,owner){if(row.ownerId!==owner||typeof row.$id!=='string'||!row.$id||row.$permissions?.length!==0||!Number.isFinite(Date.parse(row.createdAt)))fail();return row;}
const newest=[Query.orderDesc('createdAt'),Query.orderDesc('$id')];

/** One database page per owner; the cleanup caller repeats when more is true. */
export async function pruneReminderReceipts({db,owner,now=new Date(),limit=100,database='nourishing',timeLeft=()=>true}){
 ownerId(owner);if(!(now instanceof Date)||!Number.isFinite(+now)||!Number.isInteger(limit)||limit<1||limit>100)fail();
 const table=receiptTable(database),cutoff=new Date(+now-REMINDER_HISTORY_MS).toISOString();
 const aged=await db.listRows({...table,queries:[Query.equal('ownerId',owner),Query.lessThan('createdAt',cutoff),Query.orderAsc('createdAt'),Query.limit(limit)],total:false});
 let removed=0,interrupted=false;
 async function remove(rows){for(const row of rows){if(!timeLeft()){interrupted=true;break;}owned(row,owner);try{await db.deleteRow({...table,rowId:row.$id});removed++;}catch(error){if(error.code!==404)throw error;}}}
 await remove(aged.rows);
 if(interrupted||aged.rows.length===limit)return {removed,more:true};
 const remaining=limit-aged.rows.length;
 const excess=await db.listRows({...table,queries:[Query.equal('ownerId',owner),...newest,Query.offset(MAX_REMINDER_RECEIPTS),Query.limit(remaining)],total:false});
 await remove(excess.rows);return {removed,more:interrupted||excess.rows.length===remaining};
}

/** Call inside the push-account guarded claim transaction, immediately before createRow. */
export async function stageReminderReceiptCapacity({db,owner,transactionId}){
 const table=receiptTable('nourishing');ownerId(owner);if(typeof transactionId!=='string'||!transactionId)fail();
 const page=await db.listRows({...table,queries:[Query.equal('ownerId',owner),...newest,Query.offset(MAX_REMINDER_RECEIPTS-1),Query.limit(2)],total:false});
 // Normal writes reserve one slot. A pre-existing oversized history is repaired in bounded pages.
 if(page.rows.length>1)fail('Notification history cleanup is pending. Try again shortly.');
 for(const row of page.rows){owned(row,owner);await db.deleteRow({...table,rowId:row.$id,transactionId});}
}
