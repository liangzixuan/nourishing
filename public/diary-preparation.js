import {readWriteCopy} from './offline-store.js';
import {offlineEffectiveState} from './offline-model.js';
import {prepareDiaryReview,diaryReviewGuard,assertDiaryReviewGuard} from './local-diary-projection.js';
import {remapWriteReferences,remapDiaryReviewIdentities} from './write-identities.js';
import {request} from './diary-api.js';

export function remapDiaryReview(review,identities){
 remapWriteReferences(review,identities);
 remapDiaryReviewIdentities(review,identities);
 return review;
}
export async function prepareLocalDiaryReview(input,revision,{captured}={}){
 const copy=await readWriteCopy();
 if(!copy?.snapshot?.state||copy.locked)return request('/api/diary/tools/review',input);
 const state=offlineEffectiveState(copy),mapped=remapWriteReferences(structuredClone(input),copy.recordIds??{});
 if(captured){
  const prior=remapDiaryReview(structuredClone(captured),copy.recordIds??{});
  delete prior.input.selection.revision;
  assertDiaryReviewGuard(prior.guard,diaryReviewGuard(state,prior.input));
  delete mapped.selection.revision;
 }
 const result=prepareDiaryReview(state,mapped);
 const reviewed={...mapped,selection:{...result.selection}};
 delete reviewed.selection.revision;
 const localReview={input:reviewed,guard:diaryReviewGuard(state,reviewed)};
 return {...result,revision,localReview};
}
// Resolve temporary identities only before the first send. An uncertain retry
// must retain the exact prepared payload for receipt lookup and deduplication.
export function prepareQueuedDiaryReview(state,row){
 const review=row.projection?.diaryReview;if(!review||review.prepared)return;
 const input=structuredClone(review.input);delete input.selection.revision;
 assertDiaryReviewGuard(review.guard,diaryReviewGuard(state,input));
 const result=prepareDiaryReview(state,input);
 for(const key of ['selection','fingerprint'])if(result[key]!==undefined){row.command.payload[key]=structuredClone(result[key]);row.transport.body.payload[key]=structuredClone(result[key]);}
 review.prepared=true;
}
