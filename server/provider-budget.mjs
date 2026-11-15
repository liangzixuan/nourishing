import {Query} from 'node-appwrite';
import {rowId} from './data-codec.mjs';
/** Atomic shared budgets survive parallel requests and server restarts. No user data is retained. */
export async function takeBrandedBudget(db,{database,owner,operation,now=Date.now()}){
 if(!owner||!['product','search'].includes(operation))throw Error('Provider budget identity required.');
 const minute=Math.floor(now/60000),limit=operation==='search'?10:15,base={databaseId:database,tableId:'login_limits'};
 for(const scope of ['owner:'+owner,'provider']){
  const args={...base,rowId:rowId('open-food-facts',operation,scope,minute)};let row;
  try{row=await db.createRow({...args,data:{attempts:1,expiresAt:new Date((minute+2)*60000).toISOString()},permissions:[]});}
  catch(error){if(error.code!==409)throw error;row=await db.incrementRowColumn({...args,column:'attempts',value:1});}
  if(row.attempts>limit)throw Object.assign(Error('Too many food lookups. Try again in a minute.'),{code:429,publicMessage:'Too many food lookups. Try again in a minute.'});
 }
 const expired=await db.listRows({...base,queries:[Query.lessThan('expiresAt',new Date(now).toISOString()),Query.limit(25)]});
 for(const row of expired.rows)try{await db.deleteRow({...base,rowId:row.$id});}catch(error){if(error.code!==404)throw error;}
}
