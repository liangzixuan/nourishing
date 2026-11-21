import {ensureDeviceSnapshot} from './device-sync.js';
import {offlineEffectiveState} from './offline-model.js';
import {request,queueCommand} from './diary-api.js';
import {remapWriteReferences} from './write-identities.js';
import {previewLibraryEditor,prepareLibraryDraft,libraryDraftRows,inspectLibraryUses} from './local-diary-projection.js';

async function context(kind,input){
 const copy=await ensureDeviceSnapshot();
 if(!copy||copy.locked)throw new DOMException('Account changed.','AbortError');
 const state=offlineEffectiveState(copy),draft=remapWriteReferences(structuredClone(input),copy.recordIds??{}),foods=[];
 const pending=libraryDraftRows(kind,draft).slice(),seen=new Set();
 while(pending.length){
  const row=pending.pop(),childKind=row.recipeId?'recipe':'food',key=childKind+'Id',id=row[key];
  if(seen.has(key+id))continue;seen.add(key+id);
  let item=state[childKind+'s'].find(item=>item.id===id);
  if(!item){
   const result=await request('/api/library/item?'+new URLSearchParams({kind:childKind,id}));
   item={...structuredClone(result.resource),id};state[childKind+'s'].push(item);
   if(childKind==='food')foods.push(item);
  }
  if(childKind==='recipe')pending.push(...item.ingredients);
 }
 return {state,draft,foods,ticket:copy.ticket};
}
export async function previewLocalLibrary(input,signal){
 const local=await context(input.kind,input.draft);
 if(signal?.aborted)throw new DOMException('Cancelled.','AbortError');
 return previewLibraryEditor(local.state,{...input,draft:local.draft});
}
export async function localLibraryEditReview(kind,draft){
 const local=await context(kind,draft);prepareLibraryDraft(local.state,kind,local.draft);
 const {view}=inspectLibraryUses(local.state,{kind,id:local.draft.id});
 return {...view,hasUses:Object.values(view.counts).some(count=>count>0)};
}
export async function saveLocalLibrary(kind,draft,{mode='update',revision}={}){
 const local=await context(kind,draft),resource=prepareLibraryDraft(local.state,kind,local.draft),editing=Boolean(local.draft.id),requestId=crypto.randomUUID();
 const id=editing&&mode==='update'?local.draft.id:requestId;
 if(mode==='preserve'){delete resource.retired;}
 const payload=editing?{kind,draft:local.draft,mode}:local.draft;
 const result=await queueCommand(revision,editing?'library.edit':kind+'.save',payload,{requestId,ticket:local.ticket,path:'/api/library/command',projection:{foods:local.foods,library:{kind,resource:{...resource,id},mode:editing?mode:'create',previousId:local.draft.id}}});
 return {...result,item:{kind,id}};
}
