import {validateHealthPressurePairs} from './health-pressure.mjs';
import {healthConnectGroup} from './health-import-group.mjs';
import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { parseBiometricRecord, date } from './workspace.mjs';
import { healthMeasurementSource, healthTimestamp, healthInstant } from './health-records.mjs';
import {HEALTH_UNITS,parseHealthSync,healthImportBlock,healthDigest} from './health-reconciliation-state.mjs';

const units=HEALTH_UNITS;
const invalid=(message,status=400)=>{throw Object.assign(new Error(message),{status});};
export function sameHealthProjectionIdentity(left,right){return left.type===right.type&&left.source.app===right.source.app&&left.source.recordId===right.source.recordId&&isDeepStrictEqual(left.source.aggregation??null,right.source.aggregation??null);}
export function prepareHealthImport(state,input,{reconciliation=false}={}){
  if(!input||input.format!=='nourish-health-connect'||input.version!==1)invalid('Choose a version 1 Nourish Health Connect export.');
  const exportedAt=healthTimestamp(input.exportedAt,'export time'),range=input.range;
  if(!range||date(range.from)>date(range.to))invalid('Invalid Health Connect export range.');
  if((Date.parse(range.to)-Date.parse(range.from))/86400000>=30)invalid('Import at most 30 days in one Health Connect export.');
  if(!Array.isArray(input.records)||input.records.length>100000)invalid('Health Connect export must contain at most 100,000 records.');
  const imported=state.biometrics.filter(x=>x.source?.kind==='health-connect'),current=new Map(imported.map(x=>[x.source.id,x])),localIds=new Set(state.biometrics.map(x=>x.id)),seen=new Set(),sync=parseHealthSync(state.healthSync);
  if(current.size!==imported.length)invalid('Existing Health Connect projection identities are duplicated.',409);
  const counts={added:0,updated:0,unchanged:0},writes=[],records=[],warnings=[{code:reconciliation?'reconciliation-scope':'snapshot-scope'},{code:'sleep-energy'}];
  const group=healthConnectGroup(state.settings);warnings.push(group===null?{code:'no-group'}:{code:'group',group});
  let older=0,outside=0,protectedRows=0;
  for(const row of input.records){
    if(!row||typeof row!=='object'||!Object.hasOwn(units,row.type)||row.unit!==units[row.type])invalid('Unsupported Health Connect record type or unit.');
    const source=healthMeasurementSource({...row.source,kind:'health-connect',version:1,id:row.id,exportedAt,zone:range.zone,start:row.start,end:row.end},row);
    if(seen.has(source.id))invalid('Health Connect export contains duplicate record IDs.');seen.add(source.id);
    const day=date(row.date);if(day<range.from||day>range.to)outside++;
    if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(row.time||''))invalid('Health Connect record time must use HH:MM.');
    if(typeof row.value!=='number'||!Number.isFinite(row.value)||row.value<0||row.value>1000000||(row.type==='Steps'&&!Number.isSafeInteger(row.value)))invalid('Invalid Health Connect measurement.');
    const previous=current.get(source.id),item={id:previous?.id||'hc-'+createHash('sha256').update(source.id).digest('hex'),date:day,time:row.time,type:row.type,value:row.value,unit:row.unit,source,...(previous?(Object.hasOwn(previous,'group')?{group:previous.group}:{}):group===null?{}:{group})};
    if(previous&&!sameHealthProjectionIdentity(previous,item))invalid('A Health Connect projection identity belongs to another native source.',409);
    if(healthImportBlock(sync,item)){counts.unchanged++;protectedRows++;records.push({...item,status:'unchanged'});continue;}
    let status='added';
    if(previous){
      const oldTime=healthInstant(previous.source.lastModifiedAt||previous.source.exportedAt),newTime=healthInstant(source.lastModifiedAt||source.exportedAt);
      const facts=x=>({date:x.date,time:x.time,type:x.type,value:x.value,unit:x.unit,source:{...x.source,exportedAt:undefined}});
      if(newTime<oldTime){status='unchanged';older++;}
      else if(isDeepStrictEqual(facts(previous),facts(item)))status='unchanged';
      else status='updated';
    }else if(localIds.has(item.id))invalid('A Health Connect record ID conflicts with another local record.',409);
    counts[status]++;
    // Preserve the latest observation clock even when measurement facts are equal.
    // Otherwise a later stale aggregate file could overwrite a newer unchanged read.
    if(status!=='unchanged'||previous&&healthInstant(source.exportedAt)>healthInstant(previous.source.exportedAt)&&healthInstant(source.lastModifiedAt||source.exportedAt)>=healthInstant(previous.source.lastModifiedAt||previous.source.exportedAt))writes.push(item);
    records.push({...item,status});
  }
  // Empty exports must still validate their declared zone.
  if(typeof range.zone!=='string')invalid('Invalid Health Connect time zone.');
  try{new Intl.DateTimeFormat('en',{timeZone:range.zone});}catch{invalid('Invalid Health Connect time zone.');}
  if(older)warnings.push({code:'older',count:older});
  if(protectedRows)warnings.push({code:'protected',count:protectedRows});
  if(outside)warnings.push({code:'outside',count:outside});
  if(records.some(row=>row.source.aggregation))warnings.push({code:'aggregate'});
  validateHealthPressurePairs(records);
  const reviewToken=healthDigest({counts,records,writes});
  return {reviewToken,counts,records,range:{from:range.from,to:range.to,zone:range.zone},warnings,writes};
}
export function importHealth(state,input,{reviewToken}={}){
  const prepared=prepareHealthImport(state,input);
  if(reviewToken!==undefined&&(typeof reviewToken!=='string'||!/^[a-f0-9]{64}$/.test(reviewToken)||reviewToken!==prepared.reviewToken))invalid('The records or import destination changed. Preview again before importing.',409);
  for(const row of prepared.writes){const index=state.biometrics.findIndex(x=>x.id===row.id);if(index>=0)state.biometrics[index]=row;else state.biometrics.push({id:row.id,...parseBiometricRecord(row)});}
  return prepared.counts;
}
