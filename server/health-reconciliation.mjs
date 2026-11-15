import {createHmac,timingSafeEqual} from 'node:crypto';
import {createHealthReconciliation} from './domain/health-reconciliation.mjs';
import {stableHealthJson} from './domain/health-reconciliation-state.mjs';
import {readHealthExportState} from './health-export-state.mjs';

const fail=(message,code=409)=>{throw Object.assign(Error(message),{code,publicMessage:message});};
function source(operation){try{return operation();}catch(error){if([400,404,409].includes(error.status))throw Object.assign(error,{code:error.status,publicMessage:error.message});throw error;}}
function account(ownerId){if(typeof ownerId!=='string'||!ownerId||ownerId.length>36)fail('Sign in to reconcile health data.',401);}
function signedReview(state,preview,{ownerId,reviewSecret}={}){
 account(ownerId);if(typeof reviewSecret!=='string'||Buffer.byteLength(reviewSecret)<32)fail('Health Connect review signing is unavailable.',503);
 const metadata=readHealthExportState(state);if(!metadata)fail('Health Connect account setup is incomplete.');
 return createHmac('sha256',reviewSecret).update(stableHealthJson({domain:'nourishing.cloud.health-reconciliation.v1',ownerId,namespace:metadata.namespace,saveScope:metadata.saveScope,batchDigest:preview.batchDigest,sourceReviewToken:preview.reviewToken})).digest('hex');
}
const sameToken=(actual,expected)=>typeof actual==='string'&&/^[a-f0-9]{64}$/.test(actual)&&timingSafeEqual(Buffer.from(actual,'hex'),Buffer.from(expected,'hex'));

/** Source factory stays synchronous and owns all reconciliation semantics. The candidate is private
 * until the caller commits biometrics, healthSync and any real recovery snapshot atomically. */
function candidate(state,snapshotId){
 const next=structuredClone(state);let needsSnapshot=false;
 const service=createHealthReconciliation({store:{read:()=>structuredClone(next),update:operation=>operation(next),backup:()=>{
  if(!Number.isSafeInteger(snapshotId)||snapshotId<1)fail('A verified recovery snapshot is required before removing health records.',503);
  needsSnapshot=true;return snapshotId;
 }}});
 return {service,state:next,needsSnapshot:()=>needsSnapshot};
}

export function previewHealthReconciliation(state,batch,context={}){
 account(context.ownerId);const preview=source(()=>candidate(state).service.preview(batch));
 return {...preview,reviewToken:signedReview(state,preview,context)};
}

/** snapshotId is a real account-scoped allocation from the guarded store commit, never request JSON.
 * The store must retain the previous generation and its exact head when needsSnapshot is true. */
export function prepareHealthReconciliation(state,input,context={}){
 account(context.ownerId);const work=candidate(state,context.snapshotId),preview=source(()=>work.service.preview(input?.batch));
 // Source receipts bind stream, sequence, batch identity and digest. Exact replay must work after
 // a lost response or restore without allocating another snapshot or revalidating an old preview.
 if(preview.replayed){const result=source(()=>work.service.apply(input));return {state:work.state,result,needsSnapshot:false};}
 const expected=signedReview(state,preview,context);if(!sameToken(input?.reviewToken,expected))fail('Affected records or the account changed. Preview again.');
 const result=source(()=>work.service.apply({...input,reviewToken:preview.reviewToken}));
 return {state:work.state,result,needsSnapshot:work.needsSnapshot()};
}

/** The authenticated store provides state; this lookup cannot select another account. */
export function healthReconciliationReceipt(state,input){return source(()=>candidate(state).service.receipt(input));}
