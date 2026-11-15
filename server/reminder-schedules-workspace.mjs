import {unpackWorkspace} from './data-codec.mjs';
import {initialState} from './domain/workspace.mjs';
import {workspaceRows} from './workspace-generations.mjs';
import {pushFail} from './web-push.mjs';
const args=(tableId,id)=>({databaseId:'nourishing',tableId,rowId:id});
const optional=async work=>{try{return await work();}catch(error){if(error.code===404)return null;throw error;}};
const conflict=()=>pushFail('Workspace changed. Try again.',409);

export async function readReminderWorkspace(db,owner){
 for(let attempt=0;attempt<3;attempt++){
  const head=await optional(()=>db.getRow(args('workspace_heads',owner)));if(!head)return {head:null,state:initialState()};if(head.ownerId!==owner)pushFail('Workspace unavailable.',404);
  const rows=await workspaceRows(db,owner,head.generation),latest=await db.getRow(args('workspace_heads',owner));
  if(head.digest===latest.digest&&head.generation===latest.generation)return {head:latest,state:unpackWorkspace(head,rows)};
 }
 conflict();
}
