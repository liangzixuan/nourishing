import {currentPrivateResponseTicket} from './offline-store.js';
import {captureDeviceOwner} from './device-cache.js';
import {ensureDeviceSnapshot} from './device-sync.js';
import {workspaceViewFromCopy} from './local-engine.js';
import {prepareDiaryReview,diaryReviewGuard,assertDiaryReviewGuard,libraryCollectionView} from './local-diary-projection.js';
import {remapWriteReferences,remapDiaryReviewIdentities} from './write-identities.js';
import {request} from './diary-api.js';

export function remapDiaryReview(review,identities){
 remapWriteReferences(review,identities);
 remapDiaryReviewIdentities(review,identities);
 return review;
}
// Wait for the same account snapshot that startup is already fetching. A missing
// local copy can use the server; a changed account must abandon the old selection.
export async function withDiaryReviewWorkspace(local,remote,{signal,ticket=captureDeviceOwner()}={}){
 async function verify(){
  if(signal?.aborted||ticket&&!await currentPrivateResponseTicket(ticket))throw new DOMException('Account changed or screen closed.','AbortError');
 }
 let copy;
 if(ticket){
  await verify();
  try{copy=await ensureDeviceSnapshot({ownerId:ticket.ownerId});}
  catch(error){if(error.name==='AbortError'||error.status===401)throw error;}
 }
 await verify();
 const view=workspaceViewFromCopy(copy);
 const result=view?await local(view):await remote();
 await verify();
 return result;
}

function reviewFromWorkspace({state,recordIds},input,revision,captured){
 const mapped=remapWriteReferences(structuredClone(input),recordIds);
 if(captured){
  const prior=remapDiaryReview(structuredClone(captured),recordIds);
  delete prior.input.selection.revision;
  assertDiaryReviewGuard(prior.guard,diaryReviewGuard(state,prior.input));
  delete mapped.selection.revision;
 }
 const result=prepareDiaryReview(state,mapped);
 const reviewed={...mapped};
 if(result.selection){reviewed.selection={...result.selection};delete reviewed.selection.revision;}
 const localReview={input:reviewed,guard:diaryReviewGuard(state,reviewed)};
 return {...result,revision,localReview};
}
export function prepareLocalDiaryReview(input,revision,{captured}={}){
 return withDiaryReviewWorkspace(
  view=>reviewFromWorkspace(view,input,revision,captured),
  ()=>request('/api/diary/tools/review',input),
 );
}
export function prepareSelectionEditor(input,revision){
 return withDiaryReviewWorkspace(
  view=>[reviewFromWorkspace(view,input,revision),libraryCollectionView(view.state,view.revision)],
  async()=>[await request('/api/diary/tools/review',input),await request('/api/library')],
 );
}
// Resolve temporary identities only before the first send. An uncertain retry
// must retain the exact prepared payload for receipt lookup and deduplication.
export function prepareQueuedDiaryReview(state,row){
 const review=row.projection?.diaryReview;if(!review||review.prepared)return;
 const input=structuredClone(review.input);if(input.selection)delete input.selection.revision;
 assertDiaryReviewGuard(review.guard,diaryReviewGuard(state,input));
 const result=prepareDiaryReview(state,input);
 if(row.command.payload.draft&&row.projection.reusable){
  // Inline food IDs derive from diary entry IDs. A preceding receipt can change
  // the entry ID while the editor is open or its save waits offline.
  const byEntry=new Map(result.foods.map(food=>[food.source.entryId,food.id]));
  const ids=Object.fromEntries(row.projection.reusable.foods.map(food=>[food.id,byEntry.get(food.source.entryId)]));
  remapWriteReferences(row.command.payload.draft,ids);
  remapWriteReferences(row.transport.body.payload.draft,ids);
 }
 for(const key of ['selection','fingerprint'])if(result[key]!==undefined){row.command.payload[key]=structuredClone(result[key]);row.transport.body.payload[key]=structuredClone(result[key]);}
 review.prepared=true;
}
