import {HEALTH_VITALS} from './health-vitals.mjs';
import {healthNativeType} from './health-pressure.mjs';
import {createHash} from 'node:crypto';
import {healthMeasurementSource,healthTimestamp,healthInstant} from './health-records.mjs';

export const HEALTH_UNITS=Object.freeze({...Object.fromEntries(Object.entries(HEALTH_VITALS).map(([type,spec])=>[type,spec.unit])),'Systolic':'mmHg','Diastolic':'mmHg','Blood glucose':'mmol/L','Height':'cm','Body fat':'%','Weight':'kg','Heart rate':'bpm','Sleep':'h','Water':'mL','Steps':'count','Active energy':'kcal','Exercise duration':'min'});
export const HEALTH_RAW_TYPES=Object.freeze([...Object.keys(HEALTH_VITALS),'Blood pressure','Blood glucose','Height','Body fat','Weight','Heart rate','Sleep','Water','Exercise duration']);
export const HEALTH_NATIVE_TYPES=Object.freeze([...HEALTH_RAW_TYPES,'Steps','Active energy']);
export const HEALTH_COUNTS=Object.freeze(['added','updated','unchanged','deleted','replaced','invalidated']);
export const failHealth=(message,status=400)=>{throw Object.assign(new Error(message),{status});};
export function healthFields(value,keys){if(!value||typeof value!=='object'||Array.isArray(value)||keys.some(key=>!Object.hasOwn(value,key))||Object.keys(value).some(key=>!keys.includes(key)))failHealth('Invalid reconciliation fields.');}
export function healthText(value){if(typeof value!=='string'||!value.trim()||value.length>1000)failHealth('Invalid Health Connect identity.');return value;}
export function healthUuid(value){if(typeof value!=='string'||! /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value))failHealth('Use a lowercase UUIDv4 reconciliation identity.');return value;}
export function healthSequence(value){if(!Number.isSafeInteger(value)||value<1)failHealth('Invalid reconciliation sequence.');return value;}
export function healthHash(value){if(typeof value!=='string'||! /^[0-9a-f]{64}$/.test(value))failHealth('Invalid reconciliation digest.');return value;}
export function stableHealthJson(value){
  if(value===null||typeof value==='string'||typeof value==='boolean')return JSON.stringify(value);
  if(typeof value==='number'&&Number.isFinite(value))return JSON.stringify(value);
  if(Array.isArray(value))return '['+value.map(stableHealthJson).join(',')+']';
  if(value&&typeof value==='object')return '{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+stableHealthJson(value[key])).join(',')+'}';
  failHealth('Reconciliation must contain finite JSON values.');
}
export const healthDigest=value=>createHash('sha256').update(stableHealthJson(value)).digest('hex');
export const nativeHealthKey=row=>JSON.stringify([healthNativeType(row),row.recordId??row.source?.recordId]);
export const aggregateHealthKey=row=>JSON.stringify([row.metric,row.date,row.zone]);
export function aggregateHealthRecord(observation){
  const steps=observation.metric==='steps',id=`${steps?'steps':'active-energy-daily'}:${observation.date}:${observation.zone}`;
  return {id,type:steps?'Steps':'Active energy',date:observation.date,time:'00:00',value:observation.value,unit:steps?'count':'kcal',start:observation.start,end:observation.end,source:{app:'Health Connect aggregate',recordId:id,aggregation:{kind:'daily-total',metric:observation.metric,date:observation.date}}};
}
export function parseAggregateObservation(input){
  healthFields(input,['metric','date','zone','start','end','observedAt','value']);
  if(!['steps','active-calories'].includes(input.metric)||input.value!==null&&(typeof input.value!=='number'||!Number.isFinite(input.value)||input.value<0||input.value>1000000||input.metric==='steps'&&!Number.isSafeInteger(input.value)))failHealth('Invalid aggregate observation value.');
  const result={...input},record=aggregateHealthRecord(result);
  healthMeasurementSource({...record.source,kind:'health-connect',version:1,id:record.id,zone:input.zone,start:input.start,end:input.end,exportedAt:input.observedAt},{...record,value:input.value??0});
  return result;
}
export function parseHealthReceipt(input){
  healthFields(input,['streamId','sequence','batchId','batchDigest','receiptId','counts','recoverySnapshotId']);
  const result={streamId:healthUuid(input.streamId),sequence:healthSequence(input.sequence),batchId:healthUuid(input.batchId),batchDigest:healthHash(input.batchDigest),receiptId:healthHash(input.receiptId),counts:{},recoverySnapshotId:input.recoverySnapshotId};
  healthFields(input.counts,HEALTH_COUNTS);for(const key of HEALTH_COUNTS){if(!Number.isSafeInteger(input.counts[key])||input.counts[key]<0||input.counts[key]>100000)failHealth('Invalid reconciliation count.');result.counts[key]=input.counts[key];}
  if(result.recoverySnapshotId!==null&&(!Number.isSafeInteger(result.recoverySnapshotId)||result.recoverySnapshotId<1))failHealth('Invalid recovery snapshot identity.');
  if(result.receiptId!==healthDigest({streamId:result.streamId,sequence:result.sequence,batchId:result.batchId,batchDigest:result.batchDigest}))failHealth('Receipt digest does not match its identity.');return result;
}
function nativeMarker(input){
  healthFields(input,['type','recordId','kind','app','projectionIds','lastModifiedAt','observedAt','streamId','sequence']);
  if(!HEALTH_NATIVE_TYPES.includes(input.type)||!['delete','upsert'].includes(input.kind))failHealth('Invalid native reconciliation marker.');
  healthText(input.recordId);healthUuid(input.streamId);healthSequence(input.sequence);healthTimestamp(input.observedAt,'observation time');
  if(!Array.isArray(input.projectionIds)||input.projectionIds.length>100000||new Set(input.projectionIds.map(healthText)).size!==input.projectionIds.length)failHealth('Invalid native projection identities.');
  if(input.kind==='delete'){if(input.app!==null||input.lastModifiedAt!==null||input.projectionIds.length)failHealth('A deletion has no inferred app, modification time or projection.');}
  else{
    if(!HEALTH_RAW_TYPES.includes(input.type)||!input.projectionIds.length&&input.type!=='Heart rate')failHealth('Invalid complete native projection.');
    healthText(input.app);healthTimestamp(input.lastModifiedAt,'native modification time');if(healthInstant(input.lastModifiedAt)>healthInstant(input.observedAt))failHealth('Native modification follows observation.');
  }
  return {...input,projectionIds:[...input.projectionIds].sort()};
}
export function parseHealthSync(input){
  if(input===undefined)return undefined;
  healthFields(input,['version','streams','nativeRecords','aggregateObservations']);if(input.version!==1)failHealth('Invalid Health Connect sync version.');
  for(const key of ['streams','nativeRecords','aggregateObservations'])if(!Array.isArray(input[key]))failHealth('Invalid Health Connect sync collection.');
  if(input.streams.length+input.nativeRecords.length+input.aggregateObservations.length>100000)failHealth('Health Connect sync exceeds the record budget.');
  const streams=input.streams.map(parseHealthReceipt),nativeRecords=input.nativeRecords.map(nativeMarker),aggregateObservations=input.aggregateObservations.map(value=>{
    healthFields(value,['metric','date','zone','start','end','observedAt','value','streamId','sequence']);const {streamId,sequence,...observation}=value;return {...parseAggregateObservation(observation),streamId:healthUuid(streamId),sequence:healthSequence(sequence)};
  });
  for(const [rows,key]of [[streams,x=>x.streamId],[nativeRecords,nativeHealthKey],[aggregateObservations,aggregateHealthKey]])if(new Set(rows.map(key)).size!==rows.length)failHealth('Duplicate Health Connect sync identity.');
  const streamIndex=new Map(streams.map(row=>[row.streamId,row]));
  for(const marker of [...nativeRecords,...aggregateObservations]){const stream=streamIndex.get(marker.streamId);if(!stream||stream.sequence<marker.sequence)failHealth('Sync marker has no committed stream receipt.');}
  return {version:1,streams,nativeRecords,aggregateObservations};
}
export const emptyHealthSync=()=>({version:1,streams:[],nativeRecords:[],aggregateObservations:[]});
export function healthImportBlock(sync,row){
  if(!sync||row.source?.kind!=='health-connect')return null;
  const source=row.source;
  if(source.aggregation){
    const marker=sync.aggregateObservations.find(x=>aggregateHealthKey(x)===aggregateHealthKey({metric:source.aggregation.metric,date:source.aggregation.date,zone:source.zone}));
    if(marker&&(healthInstant(source.exportedAt)<healthInstant(marker.observedAt)||healthInstant(source.end)<healthInstant(marker.end)||healthInstant(source.exportedAt)===healthInstant(marker.observedAt)&&(marker.value===null||row.value!==marker.value)))return 'A newer explicit aggregate observation protects this daily value.';
  }else{
    const marker=sync.nativeRecords.find(x=>nativeHealthKey(x)===nativeHealthKey(row));
    if(marker&&(marker.kind==='delete'||source.app!==marker.app||!marker.projectionIds.includes(source.id)||!source.lastModifiedAt||healthInstant(source.lastModifiedAt)<healthInstant(marker.lastModifiedAt)))return 'An explicit native change protects this record. Capture a new reconciliation to change its complete projection.';
  }
  return null;
}
function mergeMarkers(left,right,key){
  const result=new Map(left.map(row=>[key(row),row]));
  for(const row of right){const old=result.get(key(row));if(!old){result.set(key(row),row);continue;}if(healthDigest(old)===healthDigest(row))continue;
    const time=healthInstant(row.observedAt)-healthInstant(old.observedAt);
    if(row.streamId===old.streamId){if(row.sequence===old.sequence)failHealth('Conflicting Health Connect marker history.',409);if(row.sequence>old.sequence){if(time<0n)failHealth('Newer sync history has an older observation.',409);result.set(key(row),row);}}
    else if(time>0n)result.set(key(row),row);else if(time===0n)failHealth('Ambiguous Health Connect marker history.',409);
  }
  return [...result.values()];
}
export function mergeHealthSync(current,incoming,liveRows=[]){
  const a=parseHealthSync(current),b=parseHealthSync(incoming);if(!a&&!b)return undefined;
  const left=a??emptyHealthSync(),right=b??emptyHealthSync(),streams=new Map(left.streams.map(row=>[row.streamId,row]));
  for(const row of right.streams){const old=streams.get(row.streamId);if(!old||row.sequence>old.sequence){if(old&&row.batchId===old.batchId)failHealth('Reused Health Connect batch identity.',409);streams.set(row.streamId,row);}else if(row.sequence===old.sequence&&healthDigest(row)!==healthDigest(old))failHealth('Conflicting Health Connect receipts.',409);else if(row.sequence<old.sequence&&row.batchId===old.batchId)failHealth('Reused Health Connect batch identity.',409);}
  const merged=parseHealthSync({version:1,streams:[...streams.values()],nativeRecords:mergeMarkers(left.nativeRecords,right.nativeRecords,nativeHealthKey),aggregateObservations:mergeMarkers(left.aggregateObservations,right.aggregateObservations,aggregateHealthKey)});
  for(const row of liveRows)if(healthImportBlock(merged,row))failHealth('Imported sync metadata conflicts with a live record. Use reviewed reconciliation instead.',409);
  return merged;
}
