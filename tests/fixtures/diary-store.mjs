import {randomUUID} from 'node:crypto';
import {packWorkspace,unpackWorkspace} from '../../server/data-codec.mjs';
export function diaryStoreFixture(state,owner='fixture'){
 const tables=new Map(),transactions=new Map();let failCommit=false,lostReply=false;
 const table=name=>{if(!tables.has(name))tables.set(name,new Map());return tables.get(name);};
 const packed=packWorkspace(state,owner,'fixture-generation');table('workspace_heads').set(owner,{$id:owner,...packed.head});for(const row of packed.rows)table('workspace_records').set(row.$id,structuredClone(row));
 function stage(operation,input){
  const original=table(input.tableId).get(input.rowId);
  transactions.get(input.transactionId).push([operation,input,original]);
 }
 const db={
  async getRow({tableId,rowId}){const row=table(tableId).get(rowId);if(!row)throw {code:404};return structuredClone(row);},
  async listRows({tableId,queries=[]}){let rows=[...table(tableId).values()].sort((a,b)=>a.$id.localeCompare(b.$id)),limit=100,after;for(const raw of queries){const q=JSON.parse(raw);if(q.method==='equal')rows=rows.filter(r=>q.values.includes(r[q.attribute]));if(q.method==='limit')limit=q.values[0];if(q.method==='cursorAfter')after=q.values[0];}if(after)rows=rows.slice(rows.findIndex(r=>r.$id===after)+1);return {rows:structuredClone(rows.slice(0,limit))};},
  async createTransaction(){const $id=randomUUID();transactions.set($id,[]);return {$id};},
  async createRow(input){stage('create',input);},async updateRow(input){stage('update',input);},async deleteRow(input){stage('delete',input);},
  async updateTransaction({transactionId,commit}){const operations=transactions.get(transactionId);if(!commit){transactions.delete(transactionId);return;}if(failCommit){failCommit=false;throw Error('Fixture commit failed');}
   // Appwrite rejects the entire transaction if a staged row changed concurrently.
   for(const [,input,original] of operations){
    if(table(input.tableId).get(input.rowId)!==original)throw Object.assign(Error('Transaction conflict'),{code:409,type:'transaction_conflict'});
   }
   for(const [op,input]of operations){const rows=table(input.tableId);if(op==='delete')rows.delete(input.rowId);else rows.set(input.rowId,{...(rows.get(input.rowId)??{}),...structuredClone(input.data),$id:input.rowId,...(input.permissions?{$permissions:input.permissions}:{})});}transactions.delete(transactionId);if(lostReply){lostReply=false;throw Error('Fixture lost reply');}}
 };
 return {db,table,fail(){failCommit=true;},lose(){lostReply=true;},state(){const head=table('workspace_heads').get(owner);return unpackWorkspace(head,[...table('workspace_records').values()].filter(r=>r.generation===head.generation));}};
}
