import {Query} from 'node-appwrite';
import {isDeepStrictEqual} from 'node:util';
import {databaseId,delay} from './operator.mjs';
export function verifyRows(expected,actual){
 const found=new Map(actual.map(row=>[row.$id,row]));
 if(found.size!==expected.length||actual.length!==expected.length)throw Error('Stored row count differs.');
 for(const row of expected){const saved=found.get(row.$id);if(!saved)throw Error('Stored row is missing.');for(const [key,value]of Object.entries(row))if(!isDeepStrictEqual(saved[key],value))throw Error(`Stored row field differs: ${key}`);}
}
/** Create-only batches. A retried request can observe its prior successful write,
 * but can never overwrite different facts at a previously used identity. */
export async function importRows(db,tableId,rows){
 for(let attempt=0;attempt<4;attempt++)try{
   const previous=await db.listRows({databaseId,tableId,queries:[Query.equal('$id',rows.map(r=>r.$id)),Query.limit(100)],total:false});
   const known=new Set(previous.rows.map(r=>r.$id));verifyRows(rows.filter(r=>known.has(r.$id)),previous.rows);
   const pending=rows.filter(r=>!known.has(r.$id));
   if(pending.length){const created=await db.createRows({databaseId,tableId,rows:pending});verifyRows(pending,created.rows);}
   return;
 }catch(error){if(attempt===3||![409,429,500,502,503,504].includes(error.code))throw error;await delay((attempt+1)*1000);}
}
export async function* batches(source){let batch=[],bytes=0;for(const row of source){const size=Buffer.byteLength(JSON.stringify(row));if(batch.length&&(batch.length===100||bytes+size>2*1024*1024)){yield batch;batch=[];bytes=0;}batch.push(row);bytes+=size;}if(batch.length)yield batch;}
export async function runBatches(source,worker,concurrency=4){
 const pending=new Set();let failure;
 try{for await(const batch of source){
   if(failure)break;
   const job=Promise.resolve().then(()=>worker(batch)).catch(error=>{failure??=error;}).finally(()=>pending.delete(job));pending.add(job);
   if(pending.size>=concurrency)await Promise.race(pending);
 }}catch(error){failure??=error;}finally{await Promise.all(pending);}
 if(failure)throw failure;
}
