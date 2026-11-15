import {Query} from 'node-appwrite';
import {isDeepStrictEqual} from 'node:util';
import {rowId} from './data-codec.mjs';
const databaseId='nourishing';
const fail=(message,code=409)=>{throw Object.assign(Error(message),{code,publicMessage:message});};
const identity=value=>typeof value==='string'&&value.length>0&&value.length<=36;
const timestamp=value=>typeof value==='string'&&Number.isFinite(Date.parse(value))&&new Date(value).toISOString()===value;

export async function workspaceRows(db,owner,generation){
 const rows=[];let after;
 do{const page=await db.listRows({databaseId,tableId:'workspace_records',queries:[Query.equal('ownerId',owner),Query.equal('generation',generation),Query.orderAsc('$id'),Query.limit(100),...(after?[Query.cursorAfter(after)]:[])],total:false});rows.push(...page.rows);after=page.rows.length===100?page.rows.at(-1).$id:null;}while(after);
 return rows;
}
export const assertStagedRows=(expected,actual)=>{
 const byId=new Map(actual.map(row=>[row.$id,row]));if(byId.size!==expected.length||actual.length!==expected.length)fail('Workspace staging is incomplete. Try again.');
 for(const row of expected){const saved=byId.get(row.$id);if(!saved||Object.entries(row).some(([key,value])=>!isDeepStrictEqual(value,saved[key])))fail('Staged records differ from the reviewed workspace.');}
};

/** Create-only writes permit retries without replacing an earlier staged or active row. */
export async function stageWorkspaceRows(db,rows,{tableId='workspace_records'}={}){
 const batches=[];let batch=[],bytes=0;
 for(const row of rows){const size=Buffer.byteLength(JSON.stringify(row));if(batch.length&&(batch.length===100||bytes+size>2*1024*1024)){batches.push(batch);batch=[];bytes=0;}batch.push(row);bytes+=size;}if(batch.length)batches.push(batch);
 for(const expected of batches){
  const read=()=>db.listRows({databaseId,tableId,queries:[Query.equal('$id',expected.map(row=>row.$id)),Query.limit(100)],total:false});
  const existing=(await read()).rows,known=new Set(existing.map(row=>row.$id));assertStagedRows(expected.filter(row=>known.has(row.$id)),existing);
  const pending=expected.filter(row=>!known.has(row.$id));if(!pending.length)continue;
  try{assertStagedRows(pending,(await db.createRows({databaseId,tableId,rows:pending})).rows);}
  catch(error){if(error.code!==409)throw error;assertStagedRows(expected,(await read()).rows);}
 }
}

/** Save these exact verified fields in the same transaction that replaces the head. */
export function recoveryMarker(head,retainedAt,{snapshotId}={}){
 if(snapshotId!==undefined&&(!Number.isSafeInteger(snapshotId)||snapshotId<1))fail('Recovery snapshot identity is invalid.',503);
 if(!identity(head?.ownerId)||!identity(head?.generation)||!timestamp(retainedAt))fail('Recovery metadata is invalid.',503);
 const saved=Object.fromEntries(['ownerId','generation','layout','digest'].map(key=>[key,head[key]]));
 return {$id:rowId(head.ownerId,head.generation),$permissions:[],ownerId:head.ownerId,generation:head.generation,head:JSON.stringify(saved),retainedAt,...(snapshotId!==undefined?{snapshotId}:{})};
}
