import {randomUUID,createECDH,randomBytes} from 'node:crypto';
import {packWorkspace,digest} from '../../server/data-codec.mjs';
import {initialState} from '../../server/domain/workspace.mjs';
export const owner='reminder-fixture',origin='https://nourishing.example';
const curve=()=>{const value=createECDH('prime256v1');value.generateKeys();return value;};
const key=curve();export const vapid={publicKey:key.getPublicKey().toString('base64url'),privateKey:key.getPrivateKey().toString('base64url')};
export const subscription=(id='device')=>({endpoint:'https://fcm.googleapis.com/fcm/send/'+id,expirationTime:null,keys:{p256dh:curve().getPublicKey().toString('base64url'),auth:randomBytes(16).toString('base64url')}});
export function reminderFixture(state=initialState()){
 const tables=new Map(),transactions=new Map();let time=Date.parse('2026-10-29T11:59:00Z'),lose=false,receiptFailure=false;
 const table=name=>{if(!tables.has(name))tables.set(name,new Map());return tables.get(name);};
 function install(state){const packed=packWorkspace(state,owner,'fixture-generation');table('workspace_heads').set(owner,{$id:owner,...packed.head});for(const [id,row]of table('workspace_records'))if(row.generation===packed.head.generation)table('workspace_records').delete(id);for(const row of packed.rows)table('workspace_records').set(row.$id,structuredClone(row));}
 install(state);
 function mutate(op,input){const values=table(input.tableId),old=values.get(input.rowId);if(op==='create'&&old)throw {code:409};if(op==='update'&&!old)throw {code:404};if(op==='delete'){values.delete(input.rowId);return;}values.set(input.rowId,{...old,...structuredClone(input.data),$id:input.rowId,...(input.permissions?{$permissions:input.permissions}:{})});}
 function write(op,input){if(receiptFailure&&input.tableId==='push_deliveries'&&op==='update'){receiptFailure=false;throw Error('Receipt update interrupted');}if(input.transactionId){const tx=transactions.get(input.transactionId),key=input.tableId+':'+input.rowId;if(!tx.expected.has(key))tx.expected.set(key,{tableId:input.tableId,id:input.rowId,hash:digest(table(input.tableId).get(input.rowId)??null)});tx.operations.push([op,input]);}else mutate(op,input);}
 const db={
  async getRow({tableId,rowId}){const value=table(tableId).get(rowId);if(!value)throw {code:404};return structuredClone(value);},
  async listRows({tableId,queries=[]}){let rows=[...table(tableId).values()],limit=100,after;for(const raw of queries){const q=JSON.parse(raw);if(q.method==='equal')rows=rows.filter(row=>q.values.includes(row[q.attribute]));if(q.method==='lessThanEqual')rows=rows.filter(row=>row[q.attribute]<=q.values[0]);if(q.method==='orderAsc')rows.sort((a,b)=>String(a[q.attribute]).localeCompare(String(b[q.attribute])));if(q.method==='limit')limit=q.values[0];if(q.method==='cursorAfter')after=q.values[0];}if(after)rows=rows.slice(rows.findIndex(row=>row.$id===after)+1);return {rows:structuredClone(rows.slice(0,limit))};},
  async createRow(input){write('create',input);},async updateRow(input){write('update',input);},async deleteRow(input){write('delete',input);},
  async createTransaction(){const $id=randomUUID();transactions.set($id,{operations:[],expected:new Map()});return {$id};},
  async updateTransaction({transactionId,commit}){const tx=transactions.get(transactionId);transactions.delete(transactionId);if(!commit)return;for(const check of tx.expected.values())if(digest(table(check.tableId).get(check.id)??null)!==check.hash)throw {code:409};for(const [op,input]of tx.operations)if(op==='create'&&table(input.tableId).has(input.rowId))throw {code:409};for(const [op,input]of tx.operations)mutate(op,input);if(lose){lose=false;throw Error('Commit reply interrupted');}}
 };
 const executions=[];const functions={async createExecution(input){const execution={$id:randomUUID(),resourceId:input.functionId,requestPath:input.xpath,status:'scheduled',scheduledAt:input.scheduledAt,...input};executions.push(execution);return execution;},async listExecutions({queries}){let result=executions;for(const raw of queries){const q=JSON.parse(raw);if(q.method==='equal')result=result.filter(row=>q.values.includes(row[q.attribute]));}return {executions:result};},async getExecution({executionId}){const row=executions.find(row=>row.$id===executionId);if(!row)throw {code:404};return row;}};
 return {db,table,functions,executions,clock:()=>new Date(time),now:()=>time,setTime(value){time=Date.parse(value);},install,lose(){lose=true;},failReceipt(){receiptFailure=true;}};
}
