import {healthNativeType} from './health-pressure.mjs';
import {prepareHealthImport,sameHealthProjectionIdentity} from './health-connect.mjs';
import {healthTimestamp,healthInstant} from './health-records.mjs';
import {HEALTH_NATIVE_TYPES,HEALTH_RAW_TYPES,HEALTH_COUNTS,failHealth as fail,healthFields as fields,healthText,healthUuid,healthSequence,healthHash,healthDigest,stableHealthJson,nativeHealthKey,aggregateHealthKey,aggregateHealthRecord,parseAggregateObservation,parseHealthSync,emptyHealthSync,parseHealthReceipt} from './health-reconciliation-state.mjs';

const nativeRow=(row,key)=>row.source?.kind==='health-connect'&&!row.source.aggregation&&nativeHealthKey(row)===key;
const aggregateRow=(row,key)=>row.source?.kind==='health-connect'&&row.source.aggregation&&aggregateHealthKey({metric:row.source.aggregation.metric,date:row.source.aggregation.date,zone:row.source.zone})===key;
const blankCounts=()=>Object.fromEntries(HEALTH_COUNTS.map(key=>[key,0]));
function validateBatch(input){
  fields(input,['format','version','streamId','batchId','sequence','previousReceipt','observedAt','snapshot','nativeChanges','aggregateObservations','gaps']);
  if(input.format!=='nourish-health-reconciliation'||input.version!==1)fail('Choose a version 1 Health Connect reconciliation.');
  healthUuid(input.streamId);healthUuid(input.batchId);healthSequence(input.sequence);healthTimestamp(input.observedAt,'reconciliation observation');
  if(input.sequence===1){if(input.previousReceipt!==null)fail('The first reconciliation has no previous receipt.');}else healthHash(input.previousReceipt);
  for(const key of ['nativeChanges','aggregateObservations','gaps'])if(!Array.isArray(input[key])||input[key].length>100000)fail('Invalid reconciliation collection.');
  const json=stableHealthJson(input);if(Buffer.byteLength(json)>20000000)fail('Reconciliation exceeds the 20 MB transfer budget.');
  if(input.snapshot?.exportedAt!==input.observedAt)fail('Snapshot export time must equal the reconciliation observation.');
  const empty={biometrics:[],settings:{groups:[]}},snapshot=prepareHealthImport(empty,input.snapshot);
  const snapshotModifications=new Map();
  for(const row of snapshot.records){
    if(row.source.aggregation||!row.source.lastModifiedAt)continue;
    const key=nativeHealthKey(row),modified=healthInstant(row.source.lastModifiedAt),previous=snapshotModifications.get(key);
    if(previous===undefined||modified>previous)snapshotModifications.set(key,modified);
  }
  const parents=new Set();let size=input.snapshot.records.length+input.nativeChanges.length+input.aggregateObservations.length+input.gaps.length;
  for(const change of input.nativeChanges){
    if(change?.kind==='delete')fields(change,['kind','type','recordId']);else if(change?.kind==='upsert')fields(change,['kind','type','recordId','app','lastModifiedAt','records']);else fail('Invalid native change kind.');
    if(!HEALTH_NATIVE_TYPES.includes(change.type))fail('Invalid native change type.');healthText(change.recordId);
    const key=nativeHealthKey(change);if(parents.has(key))fail('Each native parent must have one final event.');parents.add(key);
    if(change.kind==='upsert'){
      if(!HEALTH_RAW_TYPES.includes(change.type)||!Array.isArray(change.records)||change.records.length>100000||!change.records.length&&change.type!=='Heart rate')fail('Invalid complete native upsert.');
      healthText(change.app);healthTimestamp(change.lastModifiedAt,'native modification');if(healthInstant(change.lastModifiedAt)>healthInstant(input.observedAt))fail('Native modification follows batch observation.');
      if((snapshotModifications.get(key)??healthInstant(change.lastModifiedAt))>healthInstant(change.lastModifiedAt))fail('The snapshot contains a newer native revision than its complete upsert. Capture Health Connect changes again.');
      size+=change.records.length;
      const prepared=prepareHealthImport(empty,{...input.snapshot,records:change.records});
      for(const row of prepared.records)if(healthNativeType(row)!==change.type||row.source.recordId!==change.recordId||row.source.app!==change.app||row.source.aggregation||!row.source.lastModifiedAt||healthInstant(row.source.lastModifiedAt)!==healthInstant(change.lastModifiedAt))fail('A native projection does not match its declared parent.');
    }
  }
  const aggregateKeys=new Set();for(const raw of input.aggregateObservations){const observation=parseAggregateObservation(raw);if(observation.observedAt!==input.observedAt)fail('Aggregate observation must use the batch clock.');const key=aggregateHealthKey(observation);if(aggregateKeys.has(key))fail('Duplicate aggregate observation.');aggregateKeys.add(key);}
  const gapTypes=new Set();for(const gap of input.gaps){fields(gap,['type','reason']);if(!HEALTH_NATIVE_TYPES.includes(gap.type)||!['initial-baseline','token-expired'].includes(gap.reason)||gapTypes.has(gap.type))fail('Invalid or duplicate reconciliation gap.');gapTypes.add(gap.type);}
  if(input.nativeChanges.some(change=>gapTypes.has(change.type)))fail('A gap type cannot also claim complete native changes.');
  if(size>100000)fail('Combined reconciliation exceeds the 100000-record budget.');
  return {batch:structuredClone(input),batchDigest:healthDigest(input),range:snapshot.range,parents,aggregateKeys};
}
function cursor(sync,request){
  const latest=sync.streams.find(row=>row.streamId===request.streamId);
  if(!latest)return null;
  if(request.sequence===latest.sequence){if(request.batchId===latest.batchId&&request.batchDigest===latest.batchDigest)return latest;fail('This reconciliation sequence has different content.',409);}
  if(request.sequence<latest.sequence||request.batchId===latest.batchId)fail('This reconciliation identity is obsolete or reused.',409);
  return null;
}
function checkNext(sync,batch,batchDigest){
  const replay=cursor(sync,{...batch,batchDigest});if(replay)return replay;
  const latest=sync.streams.find(row=>row.streamId===batch.streamId);
  if(batch.sequence!==(latest?.sequence??0)+1||batch.previousReceipt!==(latest?.receiptId??null))fail('Reconciliation must follow the current receiver receipt.',409);
  return null;
}
function checkMarkerOrder(marker,batch){
  if(!marker)return;
  const order=healthInstant(batch.observedAt)-healthInstant(marker.observedAt);
  if(marker.streamId===batch.streamId?batch.sequence<=marker.sequence||order<0n:order<=0n)fail('Native reconciliation does not follow its saved marker. Capture a fresh change.',409);
}
function plan(state,parsed){
  const {batch,batchDigest,range,parents,aggregateKeys}=parsed,sync=parseHealthSync(state.healthSync)??emptyHealthSync(),replay=checkNext(sync,batch,batchDigest);
  if(replay)return {batchId:batch.batchId,batchDigest,reviewToken:healthDigest({batchDigest,receiptId:replay.receiptId}),counts:replay.counts,range,warnings:[{code:'replayed'}],changes:[],replayed:true,receipt:replay};
  const bindings=new Map(state.biometrics.filter(row=>row.source?.kind==='health-connect').map(row=>[row.source.id,row]));
  for(const row of [...batch.snapshot.records,...batch.nativeChanges.flatMap(change=>change.kind==='upsert'?change.records:[]),...batch.aggregateObservations.filter(row=>row.value!==null).map(aggregateHealthRecord)]){
    const existing=bindings.get(row.id);if(existing&&!sameHealthProjectionIdentity(existing,row))fail('A projection ID belongs to another native source, including before this batch removes it.',409);
    bindings.set(row.id,row);
  }
  const work={...state,biometrics:structuredClone(state.biometrics),healthSync:structuredClone(sync)},changes=[],counts=blankCounts(),warnings=[];
  const snapshotIds=new Set(batch.snapshot.records.map(row=>row.id));
  const affected=state.biometrics.filter(row=>row.source?.kind==='health-connect'&&(snapshotIds.has(row.source.id)||parents.has(nativeHealthKey(row))||row.source.aggregation&&aggregateKeys.has(aggregateHealthKey({metric:row.source.aggregation.metric,date:row.source.aggregation.date,zone:row.source.zone}))));
  const relevant={streams:sync.streams.filter(row=>row.streamId===batch.streamId),nativeRecords:sync.nativeRecords.filter(row=>parents.has(nativeHealthKey(row))||batch.snapshot.records.some(x=>!x.source?.aggregation&&nativeHealthKey(x)===nativeHealthKey(row))),aggregateObservations:sync.aggregateObservations.filter(row=>aggregateKeys.has(aggregateHealthKey(row))||batch.snapshot.records.some(x=>x.source?.aggregation&&aggregateHealthKey({metric:x.source.aggregation.metric,date:x.date,zone:batch.snapshot.range.zone})===aggregateHealthKey(row)))};
  function remove(rows,reason,count){const removed=new Set(rows.map(row=>row.id));work.biometrics=work.biometrics.filter(item=>!removed.has(item.id));for(const row of rows){changes.push({action:'remove',reason,collection:'biometrics',before:structuredClone(row),after:null});counts[count]++;}}
  function project(records,reason,{bypass=false,zone=batch.snapshot.range.zone}={}){
    const prepared=prepareHealthImport(bypass?{...work,healthSync:undefined}:work,{...batch.snapshot,range:{...batch.snapshot.range,zone},records},{reconciliation:true});warnings.push(...prepared.warnings);
    counts.unchanged+=prepared.counts.unchanged;
    const positions=new Map(work.biometrics.map((row,index)=>[row.id,index])),statuses=new Map(prepared.records.map(row=>[row.id,row.status]));
    for(const row of prepared.writes){const index=positions.get(row.id)??-1,before=index<0?null:work.biometrics[index];
      // Observation-clock updates are real source changes, even if the value is equal.
      if(statuses.get(row.id)==='unchanged')counts.unchanged--;
      if(index<0){positions.set(row.id,work.biometrics.length);work.biometrics.push(row);counts.added++;}else{work.biometrics[index]=row;counts.updated++;}
      changes.push({action:index<0?'add':'update',reason,collection:'biometrics',before:before?structuredClone(before):null,after:structuredClone(row)});
    }
  }
  project(batch.snapshot.records.filter(row=>!(!row.source?.aggregation&&parents.has(nativeHealthKey(row)))&&!(row.source?.aggregation&&aggregateKeys.has(aggregateHealthKey({metric:row.source.aggregation.metric,date:row.date,zone:batch.snapshot.range.zone})))),'snapshot');
  for(const change of batch.nativeChanges){
    const key=nativeHealthKey(change),current=work.biometrics.filter(row=>nativeRow(row,key)),marker=sync.nativeRecords.find(row=>nativeHealthKey(row)===key);checkMarkerOrder(marker,batch);
    const apps=new Set(current.map(row=>row.source.app));if(apps.size>1)fail('The native identity has ambiguous app origins. Nothing was reconciled.',409);
    for(const row of current)if(healthInstant(row.source.exportedAt)>healthInstant(batch.observedAt)||row.source.lastModifiedAt&&healthInstant(row.source.lastModifiedAt)>healthInstant(batch.observedAt))fail('A matching native record is newer than this capture. Read Health Connect again.',409);
    if(change.kind==='delete')remove(current,'native-delete','deleted');
    else{
      if(apps.size&&!apps.has(change.app))fail('The native upsert changes its app origin.',409);
      for(const row of current)if(row.source.lastModifiedAt&&healthInstant(row.source.lastModifiedAt)>healthInstant(change.lastModifiedAt))fail('The complete native upsert is older than a local modification.',409);
      const keep=new Set(change.records.map(row=>row.id));remove(current.filter(row=>!keep.has(row.source.id)),'native-upsert','replaced');project(change.records,'native-upsert',{bypass:true});
    }
    const next={type:change.type,recordId:change.recordId,kind:change.kind,app:change.kind==='upsert'?change.app:null,projectionIds:change.kind==='upsert'?change.records.map(row=>row.id).sort():[],lastModifiedAt:change.kind==='upsert'?change.lastModifiedAt:null,observedAt:batch.observedAt,streamId:batch.streamId,sequence:batch.sequence};
    work.healthSync.nativeRecords=work.healthSync.nativeRecords.filter(row=>nativeHealthKey(row)!==key);work.healthSync.nativeRecords.push(next);
  }
  for(const observation of batch.aggregateObservations){
    const key=aggregateHealthKey(observation),marker=sync.aggregateObservations.find(row=>aggregateHealthKey(row)===key),current=work.biometrics.filter(row=>aggregateRow(row,key));
    if(current.length>1)fail('Duplicate aggregate identity.',409);
    const clocks=[...(marker?[{observedAt:marker.observedAt,end:marker.end}]:[]),...current.map(row=>({observedAt:row.source.exportedAt,end:row.source.end}))];
    if(clocks.some(old=>healthInstant(observation.observedAt)<healthInstant(old.observedAt)||healthInstant(observation.end)<healthInstant(old.end))){counts.unchanged++;warnings.push({code:'older-aggregate'});continue;}
    if(marker&&healthInstant(observation.observedAt)===healthInstant(marker.observedAt)&&observation.value!==marker.value)fail('Conflicting aggregate values share an observation clock.',409);
    if(observation.value===null)remove(current,'aggregate-unavailable','invalidated');else project([aggregateHealthRecord(observation)],'aggregate-value',{bypass:true,zone:observation.zone});
    work.healthSync.aggregateObservations=work.healthSync.aggregateObservations.filter(row=>aggregateHealthKey(row)!==key);work.healthSync.aggregateObservations.push({...observation,streamId:batch.streamId,sequence:batch.sequence});
  }
  for(const gap of batch.gaps)warnings.push({code:gap.reason==='token-expired'?'token-expired':'initial-baseline',type:gap.type});
  if(batch.nativeChanges.some(row=>row.kind==='delete'&&!state.biometrics.some(item=>nativeRow(item,nativeHealthKey(row)))))warnings.push({code:'unmatched-delete'});
  if(work.biometrics.length>100000)fail('Reconciliation exceeds the biometric collection budget.');
  const identity={streamId:batch.streamId,sequence:batch.sequence,batchId:batch.batchId,batchDigest};
  parseHealthSync({...work.healthSync,streams:[...work.healthSync.streams.filter(row=>row.streamId!==batch.streamId),{...identity,receiptId:healthDigest(identity),counts,recoverySnapshotId:null}]});
  const reviewToken=healthDigest({batchDigest,affected:affected.toSorted((a,b)=>a.id<b.id?-1:a.id>b.id?1:0),sync:relevant,changes});
  return {batchId:batch.batchId,batchDigest,reviewToken,counts,range,warnings:[...new Map(warnings.map(warning=>[stableHealthJson(warning),warning])).values()],changes,replayed:false,receipt:null,work};
}
const publicPreview=planned=>{const {work,...view}=planned;return view;};
export function createHealthReconciliation({store}){
  return {
    preview(batch){return publicPreview(plan(store.read(),validateBatch(batch)));},
    apply(input){
      fields(input,['batch','reviewToken','confirmed','allowRemovals']);healthHash(input.reviewToken);if(input.confirmed!==true||typeof input.allowRemovals!=='boolean')fail('Confirm reconciliation and specify removal consent.');
      const parsed=validateBatch(input.batch),readPlan=plan(store.read(),parsed);if(readPlan.replayed)return {receipt:readPlan.receipt,replayed:true};
      let result;store.update(state=>{
        const planned=plan(state,parsed);if(planned.replayed){result={receipt:planned.receipt,replayed:true};return;}
        if(planned.reviewToken!==input.reviewToken)fail('Affected Health Connect facts changed. Preview again.',409);
        const removed=planned.counts.deleted+planned.counts.replaced+planned.counts.invalidated;if(removed&&!input.allowRemovals)fail('Explicitly allow the reviewed removals.');
        const recoverySnapshotId=removed?store.backup():null,{batch,batchDigest}=parsed;
        const identity={streamId:batch.streamId,sequence:batch.sequence,batchId:batch.batchId,batchDigest};
        const receipt=parseHealthReceipt({...identity,receiptId:healthDigest(identity),counts:planned.counts,recoverySnapshotId});
        planned.work.healthSync.streams=planned.work.healthSync.streams.filter(row=>row.streamId!==batch.streamId);planned.work.healthSync.streams.push(receipt);
        state.healthSync=parseHealthSync(planned.work.healthSync);state.biometrics=planned.work.biometrics;result={receipt,replayed:false};
      });return result;
    },
    receipt(input){
      fields(input,['streamId','sequence','batchId','batchDigest']);healthUuid(input.streamId);healthSequence(input.sequence);healthUuid(input.batchId);healthHash(input.batchDigest);
      const sync=parseHealthSync(store.read().healthSync)??emptyHealthSync(),receipt=cursor(sync,input);return {receipt};
    }
  };
}
