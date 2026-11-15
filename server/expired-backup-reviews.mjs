import {Query} from 'node-appwrite';

const identity=value=>typeof value==='string'&&/^[A-Za-z0-9][A-Za-z0-9._-]{0,35}$/.test(value);
const eligible=(row,now)=>{
 const expires=Date.parse(row?.expiresAt);
 return identity(row?.$id)&&identity(row.ownerId)&&identity(row.generation)
  &&Array.isArray(row.$permissions)&&row.$permissions.length===0
  &&typeof row.$updatedAt==='string'&&row.$updatedAt.length>0
  &&Number.isFinite(expires)&&new Date(expires).toISOString()===row.expiresAt&&expires<=now;
};
const same=(a,b)=>['$id','ownerId','generation','expiresAt','$updatedAt'].every(key=>a[key]===b[key]);

/** Remove expired review metadata only. A review's generation may still be active or retained. */
export async function pruneExpiredBackupReviews({db,database='nourishing',now,limit=25,timeLeft=()=>true}){
 if(!db||!Number.isFinite(now)||!Number.isInteger(limit)||limit<1||limit>25||typeof timeLeft!=='function')throw Error('Invalid backup review cleanup limits.');
 const result={pruned:0,skipped:0,failed:0};if(!timeLeft())return result;
 const args=id=>({databaseId:database,tableId:'backup_reviews',rowId:id});
 const page=await db.listRows({databaseId:database,tableId:'backup_reviews',queries:[Query.lessThanEqual('expiresAt',new Date(now).toISOString()),Query.orderAsc('expiresAt'),Query.limit(limit)],total:false});
 for(const candidate of page.rows){
  if(!timeLeft())break;
  if(!eligible(candidate,now)){result.skipped++;continue;}
  let tx;
  try{
   tx=await db.createTransaction({ttl:60});
   const current=await db.getRow(args(candidate.$id));
   if(!eligible(current,now)||!same(candidate,current)){await db.updateTransaction({transactionId:tx.$id,rollback:true});result.skipped++;continue;}
   await db.deleteRow({...args(current.$id),transactionId:tx.$id});
   const guard=await db.getRow(args(current.$id));
   if(!eligible(guard,now)||!same(current,guard))throw {code:409};
   await db.updateTransaction({transactionId:tx.$id,commit:true});result.pruned++;
  }catch(error){
   if(tx)await db.updateTransaction({transactionId:tx.$id,rollback:true}).catch(()=>{});
   if(![404,409].includes(error.code))result.failed++;
  }
 }
 return result;
}
