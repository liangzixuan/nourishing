import {tickCloudFasting} from './fasting.mjs';
import {Query,ID,Permission,Role} from 'node-appwrite';
import {digest,packWorkspace,rowId,unpackWorkspace} from './data-codec.mjs';
import {initialState} from './domain/workspace.mjs';
import {applyWorkspaceCommand,parseCommand,readActionFoods,captureActionFoods} from './workspace-commands.mjs';
const databaseId='nourishing',args=(tableId,id)=>({databaseId,tableId,rowId:id});
const conflict=()=>{throw Object.assign(Error('This diary changed. Refresh it before saving.'),{code:409,publicMessage:'This diary changed. Refresh it before saving.'});};
const permissions=owner=>[Permission.read(Role.user(owner))];
async function optional(db,table,id){try{return await db.getRow(args(table,id));}catch(error){if(error.code===404)return null;throw error;}}
export async function workspaceRows(db,owner,generation){
 const rows=[];let after;
 do{const page=await db.listRows({databaseId,tableId:'workspace_records',queries:[Query.equal('ownerId',owner),Query.equal('generation',generation),Query.orderAsc('$id'),Query.limit(100),...(after?[Query.cursorAfter(after)]:[])],total:false});rows.push(...page.rows);after=page.rows.length===100?page.rows.at(-1).$id:null;}while(after);
 return rows;
}
const dataOf=({$id,$permissions,...data})=>data;
export function createWorkspaceStore(db,owner){
 async function create(){
  if(await optional(db,'workspace_heads',owner))return;
  const packed=packWorkspace(initialState(),owner,ID.unique()),tx=await db.createTransaction({ttl:60});
  try{
   for(const row of packed.rows)await db.createRow({...args('workspace_records',row.$id),data:dataOf(row),permissions:row.$permissions,transactionId:tx.$id});
   await db.createRow({...args('workspace_heads',owner),data:packed.head,permissions:permissions(owner),transactionId:tx.$id});
   await db.updateTransaction({transactionId:tx.$id,commit:true});
  }catch(error){await db.updateTransaction({transactionId:tx.$id,rollback:true}).catch(()=>{});if(error.code===409&&await optional(db,'workspace_heads',owner))return;throw error;}
 }
 async function persist(state,before,h,transactionId){
   const packed=packWorkspace(state,owner,h.generation),old=new Map(before.map(row=>[row.$id,row]));
   for(const row of packed.rows){const prior=old.get(row.$id);old.delete(row.$id);if(prior&&prior.digest===row.digest&&prior.position===row.position&&prior.day===row.day)continue;
    await db[prior?'updateRow':'createRow']({...args('workspace_records',row.$id),data:dataOf(row),...(prior?{}:{permissions:row.$permissions}),transactionId:transactionId});
   }
   for(const id of old.keys())await db.deleteRow({...args('workspace_records',id),transactionId:transactionId});
   await db.updateRow({...args('workspace_heads',owner),data:packed.head,transactionId:transactionId});
   return packed.head.digest;
 }
 async function command(raw,readCatalog,context={}){
  const input=parseCommand(raw),receiptId=rowId(owner,input.requestId),fingerprint=digest(input),receipt=await optional(db,'command_receipts',receiptId);
  if(receipt){if(receipt.ownerId!==owner||receipt.fingerprint!==fingerprint)conflict();return JSON.parse(receipt.result);}
  const h=await db.getRow(args('workspace_heads',owner));if(h.ownerId!==owner||h.digest!==input.revision)conflict();
  // Resolve catalog facts before opening the short-lived write transaction.
  const catalogFoods=await readActionFoods(input,readCatalog);
  const tx=await db.createTransaction({ttl:60});
  try{
   // Stage this shared guard first. Any later concurrent commit changes it and conflicts.
   await db.updateRow({...args('workspace_heads',owner),data:{digest:h.digest},transactionId:tx.$id});
   const guard=await db.getRow(args('workspace_heads',owner));if(guard.digest!==h.digest||guard.$updatedAt!==h.$updatedAt)conflict();
   const before=await workspaceRows(db,owner,h.generation);let state;
   try{state=unpackWorkspace(h,before);}catch(error){const latest=await db.getRow(args('workspace_heads',owner));if(latest.digest!==h.digest)conflict();throw error;}
   context.beforeApply?.();
   const action=captureActionFoods(state,{type:input.type,payload:input.payload},catalogFoods);
   const saved=applyWorkspaceCommand(state,action,context);
   if(context.stageMedia)await context.stageMedia({transactionId:tx.$id,generation:h.generation});
   const revision=await persist(state,before,h,tx.$id);
   const result={ok:true,revision,...(saved?.counts?{counts:saved.counts}:{}),...(saved?.entryIds?{entryIds:saved.entryIds}:{}),...(saved?.photoId?{photoId:saved.photoId}:{}),...(saved?.id?{item:{kind:saved.kind,id:saved.id}}:{})};
   await db.createRow({...args('command_receipts',receiptId),data:{ownerId:owner,fingerprint,result:JSON.stringify(result)},permissions:permissions(owner),transactionId:tx.$id});
   await db.updateTransaction({transactionId:tx.$id,commit:true});return result;
  }catch(error){
   await db.updateTransaction({transactionId:tx.$id,rollback:true}).catch(()=>{});
   const saved=await optional(db,'command_receipts',receiptId);if(saved&&saved.ownerId===owner&&saved.fingerprint===fingerprint)return JSON.parse(saved.result);
   if(error.code===409)conflict();throw error;
  }
 }
 async function tickFasting(context){
  const h=await db.getRow(args('workspace_heads',owner));if(h.ownerId!==owner)conflict();
  const before=await workspaceRows(db,owner,h.generation);let state;
  try{state=unpackWorkspace(h,before);}catch(error){const latest=await db.getRow(args('workspace_heads',owner));if(latest.digest!==h.digest)conflict();throw error;}
  tickCloudFasting(state,context);if(digest(state)===h.digest)return {changed:false};
  const tx=await db.createTransaction({ttl:60});
  try{
   await db.updateRow({...args('workspace_heads',owner),data:{digest:h.digest},transactionId:tx.$id});
   const guard=await db.getRow(args('workspace_heads',owner));if(guard.digest!==h.digest||guard.$updatedAt!==h.$updatedAt)conflict();
   const revision=await persist(state,before,h,tx.$id);await db.updateTransaction({transactionId:tx.$id,commit:true});return {changed:true,revision};
  }catch(error){await db.updateTransaction({transactionId:tx.$id,rollback:true}).catch(()=>{});if(error.code===409)conflict();throw error;}
 }
 return {create,command,tickFasting};
}
