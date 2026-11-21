import {randomUUID} from 'node:crypto';
import {unpackWorkspace} from '../../server/data-codec.mjs';

export function transactionFixture(){
 const tables=new Map(),transactions=new Map(),files=new Map();let failCommit=false,lostReply=false,uploads=0;
 const table=name=>{if(!tables.has(name))tables.set(name,new Map());return tables.get(name);},missing=()=>{throw {code:404};};
 const db={
  async getRow({tableId,rowId}){return structuredClone(table(tableId).get(rowId)??missing());},
  async listRows({tableId,queries=[]}){let rows=[...table(tableId).values()].sort((a,b)=>a.$id.localeCompare(b.$id)),limit=100;for(const raw of queries){const q=JSON.parse(raw);if(q.method==='equal')rows=rows.filter(row=>q.values.includes(row[q.attribute]));if(q.method==='cursorAfter')rows=rows.filter(row=>row.$id>q.values[0]);if(q.method==='limit')limit=q.values[0];}return {rows:structuredClone(rows.slice(0,limit))};},
  async createTransaction(){const $id=randomUUID();transactions.set($id,[]);return {$id};},
  async createRow(input){transactions.get(input.transactionId).push(['create',input]);},async updateRow(input){transactions.get(input.transactionId).push(['update',input]);},async deleteRow(input){transactions.get(input.transactionId).push(['delete',input]);},
  async updateTransaction({transactionId,commit}){const ops=transactions.get(transactionId);if(!commit){transactions.delete(transactionId);return;}if(failCommit){failCommit=false;throw Error('Commit failed');}for(const [kind,input]of ops){const rows=table(input.tableId);if(kind==='delete')rows.delete(input.rowId);else rows.set(input.rowId,{...(rows.get(input.rowId)??{}),...structuredClone(input.data),$id:input.rowId,...(input.permissions?{$permissions:input.permissions}:{})});}transactions.delete(transactionId);if(lostReply){lostReply=false;throw Error('Lost reply');}}
 };
 const storage={async getFile({fileId}){return files.get(fileId)?.metadata??missing();},async createFile({fileId,file,permissions}){if(files.has(fileId))throw {code:409};uploads++;const bytes=Buffer.from(file.source.data),metadata={$id:fileId,name:file.filename,sizeOriginal:bytes.length,$permissions:permissions};files.set(fileId,{bytes,metadata});return metadata;},async getFileView({fileId}){return files.get(fileId)?.bytes??missing();}};
 const state=owner=>{const head=table('workspace_heads').get(owner);return unpackWorkspace(head,[...table('workspace_records').values()].filter(row=>row.ownerId===owner&&row.generation===head.generation));};
 return {db,storage,files,table,state,uploads:()=>uploads,fail(){failCommit=true;},lose(){lostReply=true;}};
}
