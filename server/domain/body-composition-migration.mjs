import {parseBodyCompositionPolicy} from './body-composition.mjs';

const fail=message=>{throw Object.assign(Error(message),{status:400});};
const legacyKeys=['version','weightMetric','bodyFatMetric','useForResting','useForKeto'];

/** One-way saved-input boundary. Runtime requests use only the current schema. */
export function normalizeStoredBodyComposition(value){
  if(value?.version!==1)return {policy:parseBodyCompositionPolicy(value),changed:false};
  if(typeof value!=='object'||Array.isArray(value)||Object.keys(value).length!==legacyKeys.length||legacyKeys.some(key=>!Object.hasOwn(value,key)))fail('The saved body-measurement policy has unsupported version 1 fields.');
  return {policy:parseBodyCompositionPolicy({...value,version:2,heightMetric:null,useHeightForResting:false}),changed:true};
}

export function canonicalizeBodyComposition(state){
  const result=normalizeStoredBodyComposition(state.settings?.bodyComposition);
  if(result.changed)state.settings.bodyComposition=result.policy;
  return {changed:result.changed};
}

export function migrateBodyComposition(store){
  const preview=canonicalizeBodyComposition(store.read());
  if(!preview.changed)return {...preview,recoverySnapshotId:null};
  let result;
  store.update(state=>{const facts=canonicalizeBodyComposition(state);result={...facts,recoverySnapshotId:store.backup()};});
  return result;
}
