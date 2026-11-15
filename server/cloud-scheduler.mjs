import {Query} from 'node-appwrite';

/** Bounded repair of durable dispatch intents. A continuation handles additional due rows. */
export async function runCloudScheduler({db,dispatch,defer,clock=()=>new Date(),monotonic=()=>performance.now(),enabled=false,pageSize=20,concurrency=4,budgetMs=45000}={}){
 const result={enabled:enabled===true,examined:0,queued:0,unchanged:0,failed:0,blocked:0,more:false};if(enabled!==true)return result;
 if(!db||typeof dispatch!=='function'||typeof defer!=='function'||typeof clock!=='function'||typeof monotonic!=='function'||!Number.isInteger(pageSize)||pageSize<1||pageSize>100||!Number.isInteger(concurrency)||concurrency<1||concurrency>4||!Number.isFinite(budgetMs)||budgetMs<=0||budgetMs>45000)throw Error('Invalid scheduler limits.');
 const now=clock(),started=monotonic();if(!(now instanceof Date)||!Number.isFinite(+now)||!Number.isFinite(started))throw Error('Scheduler clock unavailable.');
 const page=await db.listRows({databaseId:'nourishing',tableId:'fasting_dispatch',queries:[Query.lessThanEqual('repairAt',now.toISOString()),Query.orderAsc('repairAt'),Query.limit(pageSize)],total:false});
 for(let offset=0;offset<page.rows.length;offset+=concurrency){
  if(monotonic()-started>=budgetMs){result.more=true;break;}
  await Promise.all(page.rows.slice(offset,offset+concurrency).map(async row=>{
   result.examined++;
   if(typeof row.ownerId!=='string'||!row.ownerId||row.ownerId!==row.$id){result.failed++;result.blocked++;return;}
   try{const saved=await dispatch(row.ownerId);if(saved.queued===true)result.queued++;else result.unchanged++;}
   catch{result.failed++;try{await defer(row.ownerId,row.token);}catch{result.blocked++;}}
  }));
 }
 result.more ||= page.rows.length===pageSize;
 return result;
}
