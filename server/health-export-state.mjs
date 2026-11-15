import {randomUUID} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {date,parseReportTimeZone} from './domain/calendar.mjs';

// Appwrite representation of the source health-export-identity, health-intake-drafts
// and health-intake-policies records. No SQLite writer or receipt migration lives here.
export const HEALTH_EXPORT_FAMILIES=Object.freeze(['healthExportState','healthIntakeDrafts','healthIntakePolicies']);
export const HEALTH_EXPORT_ROW_BYTES=1_048_576;
export const HEALTH_EXPORT_FAMILY_BYTES=20_000_000;
const fail=(message,code=400)=>{throw Object.assign(Error(message),{code,publicMessage:message});};
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
function exact(value,keys){if(!object(value)||Object.keys(value).length!==keys.length||keys.some(key=>!Object.hasOwn(value,key)))fail('Invalid Health Connect export metadata fields.');}
function uuid(value){if(typeof value!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value))fail('Invalid Health Connect export namespace or save scope.');return value;}
function calendar(day,zone){try{date(day);if(zone!==undefined)parseReportTimeZone(zone);}catch(error){fail(error.message);}}
function kind(value){if(!['nutrition','hydration'].includes(value))fail('Invalid correction kind.');}
function revision(value){if(!Number.isSafeInteger(value)||value<1)fail('Invalid correction revision.');}
function strings(value){return Array.isArray(value)&&value.every(id=>typeof id==='string'&&id.trim())&&new Set(value).size===value.length;}
function groups(value,{allowEmpty=false}={}){
 if(!Array.isArray(value)||!allowEmpty&&!value.length)fail('A correction needs groups.');
 const seen=new Set();for(const group of value){
  exact(group,['anchorId','entryIds']);
  if(typeof group.anchorId!=='string'||!Array.isArray(group.entryIds)||group.entryIds.length<2||!group.entryIds.includes(group.anchorId))fail('Invalid correction group.');
  for(const id of group.entryIds){if(typeof id!=='string'||!id.trim()||seen.has(id))fail('Correction members need distinct identities.');seen.add(id);}
 }
}
export function parseHealthIntakeDraftSelection(value){
 exact(value,['kind','date','timeZone','groups']);kind(value.kind);calendar(value.date,value.timeZone);groups(value.groups);return structuredClone(value);
}
export function parseHealthIntakeDraft(value){
 exact(value,['kind','date','revision','selection','draftToken','updatedAt']);kind(value.kind);calendar(value.date);revision(value.revision);
 if(typeof value.updatedAt!=='string'||!Number.isFinite(Date.parse(value.updatedAt)))fail('Invalid correction update time.');
 if(value.selection===null){if(value.draftToken!==null)fail('A cleared correction cannot retain a review token.');}
 else{parseHealthIntakeDraftSelection(value.selection);if(value.selection.kind!==value.kind||value.selection.date!==value.date||typeof value.draftToken!=='string'||!/^[a-f0-9]{64}$/.test(value.draftToken))fail('Correction draft identity does not match.');}
 return structuredClone(value);
}
export function parseHealthIntakePolicy(value){
 exact(value,['namespace','kind','date','timeZone','revision','groups','memberIds']);uuid(value.namespace);kind(value.kind);calendar(value.date,value.timeZone);revision(value.revision);groups(value.groups,{allowEmpty:true});
 if(!strings(value.memberIds)||!value.memberIds.length)fail('Correction history needs distinct member identities.');
 const members=new Set(value.memberIds);if(value.groups.some(group=>group.entryIds.some(id=>!members.has(id))))fail('Correction history is missing an active member.');
 return structuredClone(value);
}
const draftKey=row=>JSON.stringify([row.kind,row.date]);
const policyKey=row=>JSON.stringify([row.namespace,row.kind,row.date]);
function rows(input,parse,key){
 if(!Array.isArray(input))fail('Correction history must be a list.');
 const keys=new Set();let bytes=0;const result=[];
 for(const value of input){
  const body=JSON.stringify(value),size=Buffer.byteLength(body??'');bytes+=size;
  if(size>HEALTH_EXPORT_ROW_BYTES||bytes>HEALTH_EXPORT_FAMILY_BYTES)fail('Correction history exceeds the export storage limit.',413);
  const row=parse(value),id=key(row);if(keys.has(id))fail('Duplicate correction history identity.');keys.add(id);result.push(row);
 }
 return result;
}
export function parseHealthIntakePolicies(input){
 const parsed=rows(input,parseHealthIntakePolicy,policyKey),active=new Set();
 for(const row of parsed)for(const group of row.groups)for(const id of group.entryIds){const key=JSON.stringify([row.namespace,row.kind,id]);if(active.has(key))fail('An intake entry belongs to multiple active correction dates.');active.add(key);}
 return parsed;
}
export function parseHealthExportMetadata(input){
 exact(input,['version','namespace','drafts','policies']);if(input.version!==1)fail('Unsupported Health Connect export metadata version.');uuid(input.namespace);
 return {version:1,namespace:input.namespace,drafts:rows(input.drafts,parseHealthIntakeDraft,draftKey),policies:parseHealthIntakePolicies(input.policies)};
}
export function readHealthExportState(state){
 const present=HEALTH_EXPORT_FAMILIES.filter(key=>Object.hasOwn(state,key));if(!present.length)return null;
 if(present.length!==HEALTH_EXPORT_FAMILIES.length)fail('Health Connect export metadata is incomplete.');
 const identity=state.healthExportState;exact(identity,['version','namespace','saveScope']);if(identity.version!==1)fail('Unsupported Health Connect export identity version.');uuid(identity.saveScope);
 const metadata=parseHealthExportMetadata({version:identity.version,namespace:identity.namespace,drafts:state.healthIntakeDrafts,policies:state.healthIntakePolicies});
 return {...metadata,saveScope:identity.saveScope};
}
function assign(state,metadata,saveScope){
 uuid(saveScope);state.healthExportState={version:1,namespace:metadata.namespace,saveScope};state.healthIntakeDrafts=structuredClone(metadata.drafts);state.healthIntakePolicies=structuredClone(metadata.policies);
}
/** Called inside the existing account workspace transaction; exact retries do not rotate scope. */
export function installHealthExportMetadata(state,input,{saveScope=randomUUID()}={}){
 const next=parseHealthExportMetadata(input),current=readHealthExportState(state);
 if(current){const {saveScope:ignored,...metadata}=current;if(!isDeepStrictEqual(metadata,next))fail('This account already has different Health Connect export lineage or history.',409);return {changed:false};}
 assign(state,next,saveScope);return {changed:true};
}
/** Only for a verified new lineage, never as a fallback for an uninspected PC import. */
export function initializeHealthExportState(state,{namespace=randomUUID(),saveScope=randomUUID()}={}){
 if(readHealthExportState(state))return {changed:false};return installHealthExportMetadata(state,{version:1,namespace,drafts:[],policies:[]},{saveScope});
}
/** Keep target lineage and native membership history; rotate reviews on every restore. */
export function restoreHealthExportMetadata(state,input,{saveScope=randomUUID()}={}){
 const incoming=parseHealthExportMetadata(input),current=readHealthExportState(state);uuid(saveScope);
 if(current&&current.namespace!==incoming.namespace)fail('This backup belongs to another Health Connect export lineage.',409);
 if(current?.saveScope===saveScope)fail('Restore must invalidate earlier Health Connect reviews.',409);
 const source=new Map(incoming.policies.map(row=>[policyKey(row),row])),target=new Map((current?.policies??[]).map(row=>[policyKey(row),row]));
 const merged=[];for(const key of new Set([...source.keys(),...target.keys()])){
  const a=source.get(key),b=target.get(key),base=a??b,chosen=base.namespace===incoming.namespace?a:(b??a),nextRevision=Math.max(a?.revision??0,b?.revision??0)+1;revision(nextRevision);
  merged.push({...base,timeZone:chosen?.timeZone??base.timeZone,revision:nextRevision,groups:chosen?.groups??[],memberIds:[...new Set([...(b?.memberIds??[]),...(a?.memberIds??[])])].sort()});
 }
 const next=parseHealthExportMetadata({...incoming,policies:merged});assign(state,next,saveScope);return {changed:true};
}
/** Accept a caller-owned read-only SQLite connection. This function executes SELECT only. */
export function readLegacyHealthExportMetadata(db){
 const has=name=>Boolean(db.prepare("SELECT 1 FROM sqlite_schema WHERE type='table' AND name=?").get(name));
 const identityPresent=has('health_export_identity'),identity=identityPresent?db.prepare('SELECT id,namespace FROM health_export_identity').all():[];
 const read=(table,parse)=>{
  if(!has(table))return [];
  const size=db.prepare(`SELECT coalesce(sum(length(CAST(body AS BLOB))),0) AS bytes,max(length(CAST(body AS BLOB))) AS largest FROM ${table}`).get();
  if(size.bytes>HEALTH_EXPORT_FAMILY_BYTES||size.largest>HEALTH_EXPORT_ROW_BYTES)fail('Correction history exceeds the export storage limit.',413);
  const columns=table==='health_intake_policies'?'namespace,kind,day,body':'kind,day,body';
  return db.prepare(`SELECT ${columns} FROM ${table} ORDER BY ${table==='health_intake_policies'?'namespace,':''}kind,day`).all().map(row=>{
   let decoded;try{decoded=JSON.parse(row.body);}catch{fail('Invalid saved correction JSON.');}const value=parse(decoded);
   if(value.kind!==row.kind||value.date!==row.day||table==='health_intake_policies'&&value.namespace!==row.namespace)fail('Correction storage identity differs from its contents.');return value;
  });
 };
 const drafts=read('health_intake_drafts',parseHealthIntakeDraft),policies=read('health_intake_policies',parseHealthIntakePolicy);
 if(!identityPresent&&!drafts.length&&!policies.length)return null;
 if(identity.length!==1||identity[0].id!==1)fail('Missing or conflicting Health Connect export namespace.');
 return parseHealthExportMetadata({version:1,namespace:identity[0].namespace,drafts,policies});
}
