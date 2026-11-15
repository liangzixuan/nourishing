import {randomBytes} from 'node:crypto';
import {digest} from './data-codec.mjs';
import {initialState,mergeImport,act,exportState} from './domain/workspace.mjs';
import {mealPhotoIds} from './domain/photo-records.mjs';
import {notePhotoIds} from './domain/note-photo-fields.mjs';
import {parseProgressSnapshot} from './domain/progress-snapshots.mjs';
import {validateStoredPhoto,MAX_STORED_PHOTO_BYTES,MAX_PHOTO_EDGE} from './domain/photo-images.mjs';

export const BACKUP_RECORD_MAX_BYTES=20_000_000;
export const BACKUP_INSPECT_MAX_BYTES=20_000_000;
export const BACKUP_FORMAT='nourishing-workspace';
export const BACKUP_NAMESPACES=Object.freeze(['meal_photos','progress_photos','note_photos']);
const collections=['foods','recipes','meals','entries','biometrics','notes','repeats','fasts','charts','clients','messages','templates','progressSnapshots'];
const fields=['version','sampleData','profile','settings',...collections,'healthSync','fastingPlan','loggingStreaks','cycleRecords'];
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const fail=(message,code=400)=>{throw Object.assign(Error(message),{code,publicMessage:message});};
const hash=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const authorityFields=new Set(['$id','$permissions','ownerId','generation','session','sessionSecret','accessToken','apiKey','password']);
function rejectAuthority(value){if(Array.isArray(value)){for(const item of value)rejectAuthority(item);}else if(object(value)){for(const [key,item]of Object.entries(value)){if(authorityFields.has(key))fail('Backups cannot import account or authentication fields.');rejectAuthority(item);}}}
function exact(value,required,optional=[]){if(!object(value)||required.some(key=>!Object.hasOwn(value,key))||Object.keys(value).some(key=>![...required,...optional].includes(key)))fail('Backup contains missing or unsupported fields.');}
function source(operation){try{return operation();}catch(error){if([400,404,409].includes(error.status))throw Object.assign(error,{code:error.status,publicMessage:error.message});throw error;}}
function safeJson(value){const body=JSON.stringify(value);if(body===undefined||Buffer.byteLength(body)>BACKUP_RECORD_MAX_BYTES)fail('Workspace records exceed 20 MB.',413);return JSON.parse(body);}
function inspectSize(manifest){if(Buffer.byteLength(JSON.stringify({manifest,revision:'0'.repeat(64)}))>BACKUP_INSPECT_MAX_BYTES)fail('Backup records and photo metadata exceed the 20 MB restore limit.',413);}
function validateWorkspace(input){
 exact(input,['version','profile','settings',...collections.filter(key=>key!=='progressSnapshots')],fields);
 if(input.version!==1||input.sampleData!==undefined&&typeof input.sampleData!=='boolean')fail('Choose a current Nourishing workspace backup.');
 const workspace=safeJson(input);
 rejectAuthority(workspace);
 for(const family of collections){if(family==='progressSnapshots'&&!Object.hasOwn(workspace,family))continue;const values=workspace[family];if(!Array.isArray(values)||values.length>100000)fail(`Backup has invalid ${family}.`);const ids=new Set();for(const row of values){if(!object(row)||typeof row.id!=='string'||!row.id||ids.has(row.id))fail(`Backup has invalid or duplicate ${family} IDs.`);ids.add(row.id);}}
 if(!object(workspace.profile)||!object(workspace.settings))fail('Backup needs a workspace profile and settings.');
 const candidate=initialState();
 source(()=>act(candidate,'settings.save',{groups:workspace.settings.groups}));
 const normalized=source(()=>mergeImport(candidate,workspace));
 // This format carries current cloud records. Legacy imports must use their own migration.
 if(Object.values(normalized).some(value=>value?.changed))fail('This backup needs a source-format migration before restoration.');
 if(Object.keys(workspace.profile).some(key=>!Object.hasOwn(candidate.profile,key))||Object.keys(workspace.settings).some(key=>!Object.hasOwn(candidate.settings,key)))fail('Backup contains unsupported profile or settings fields.');
 source(()=>exportState(workspace));
 const restored=structuredClone(workspace),changes=[];
 // The source import owner disables automatic fast starts after a restore.
 if(Object.hasOwn(workspace,'fastingPlan')&&digest(workspace.fastingPlan)!==digest(candidate.fastingPlan)){
  restored.fastingPlan=candidate.fastingPlan;changes.push({code:'fasting-schedules-paused',count:workspace.fastingPlan.schedules.filter(row=>row.enabled).length});
 }
 return {workspace,restored,changes};
}
export function backupReferences(state){
 return source(()=>[
  ...mealPhotoIds(state).map(id=>({namespace:'meal_photos',id})),
  ...[...new Set((state.progressSnapshots??[]).map(row=>parseProgressSnapshot(row).imageId))].map(id=>({namespace:'progress_photos',id})),
  ...notePhotoIds(state).map(id=>({namespace:'note_photos',id}))
 ].sort((a,b)=>(a.namespace+':'+a.id).localeCompare(b.namespace+':'+b.id)));
}
const mediaKey=row=>row.namespace+':'+row.id;
function descriptors(values,references){
 if(!Array.isArray(values)||values.length!==references.length)fail('Backup must include every referenced photo.');
 const expected=new Set(references.map(mediaKey)),seen=new Set();
 return values.map(row=>{
  exact(row,['namespace','id','bytes','width','height']);const key=mediaKey(row);
  if(!BACKUP_NAMESPACES.includes(row.namespace)||!hash(row.id)||!expected.has(key)||seen.has(key))fail('Backup has an invalid, duplicate or unreferenced photo.');seen.add(key);
  if(!Number.isSafeInteger(row.bytes)||row.bytes<1||row.bytes>MAX_STORED_PHOTO_BYTES||!['width','height'].every(name=>Number.isInteger(row[name])&&row[name]>0&&row[name]<=MAX_PHOTO_EDGE))fail('Backup has invalid photo dimensions or size.');
  return {...row};
 });
}
function countSummary(workspace,media){
 const counts=Object.fromEntries(collections.map(key=>[key,workspace[key]?.length??0]));counts.cycleRecords=workspace.cycleRecords?.length??0;
 const dates=[...workspace.entries,...workspace.biometrics,...workspace.notes,...(workspace.progressSnapshots??[])].map(row=>row.date).filter(value=>typeof value==='string').sort();
 return {counts,photos:media.length,...(media.every(row=>Number.isSafeInteger(row.bytes))?{photoBytes:media.reduce((total,row)=>total+row.bytes,0)}:{}),range:dates.length?{from:dates[0],to:dates.at(-1)}:null};
}
/** Descriptor bytes must come from account-scoped stored metadata, not caller URLs. */
export function backupManifest(state,media,{asOf}={}){
 const clone=structuredClone(state);delete clone.capabilities;delete clone.catalog;
 const {workspace}=validateWorkspace(clone),images=descriptors(media,backupReferences(workspace)).sort((a,b)=>mediaKey(a).localeCompare(mediaKey(b))),date=new Date(asOf??Date.now());if(!Number.isFinite(+date))fail('Backup time is unavailable.',503);
 const body={format:BACKUP_FORMAT,version:1,createdAt:date.toISOString(),workspace,media:images},manifest={...body,digest:digest(body)};inspectSize(manifest);return manifest;
}
export function validateBackupManifest(input){
 exact(input,['format','version','createdAt','workspace','media','digest']);
 inspectSize(input);
 if(input.format!==BACKUP_FORMAT||input.version!==1||typeof input.createdAt!=='string'||!Number.isFinite(Date.parse(input.createdAt))||new Date(input.createdAt).toISOString()!==input.createdAt||!hash(input.digest))fail('Choose a complete Nourishing JSON backup.');
 const {digest:expected,...body}=input;if(digest(body)!==expected)fail('Backup content does not match its digest.');
 const validated=validateWorkspace(input.workspace),media=descriptors(input.media,backupReferences(validated.workspace));
 return {...validated,manifest:{...body,workspace:validated.workspace,media,digest:expected},summary:{createdAt:input.createdAt,...countSummary(validated.workspace,media),changes:validated.changes}};
}
/** Persist review server-side under ownerId+token. Never accept it from the browser. */
export function inspectBackup(current,input,{ownerId}={}){
 exact(input,['manifest','revision']);if(typeof ownerId!=='string'||!ownerId)fail('Sign in to restore a backup.',401);
 if(input.revision!==digest(current))fail('Your workspace changed. Inspect this backup again.',409);
 const validated=validateBackupManifest(input.manifest),review={version:1,ownerId,token:randomBytes(32).toString('hex'),revision:input.revision,manifestDigest:input.manifest.digest};
 return {review,manifest:validated.manifest,summary:{...validated.summary,current:countSummary(current,backupReferences(current)),reviewToken:review.token,revision:review.revision}};
}
export async function validateBackupMedia(manifest,input){
 exact(input,['namespace','photo']);exact(input.photo,['id','dataUrl']);
 const expected=manifest.media.find(row=>row.namespace===input.namespace&&row.id===input.photo.id);if(!expected)fail('This photo is not part of the reviewed backup.');
 let photo;try{photo=await validateStoredPhoto(input.photo);}catch(error){if(error.status)throw Object.assign(error,{code:error.status,publicMessage:error.message});throw error;}
 if(photo.bytes.length!==expected.bytes||photo.width!==expected.width||photo.height!==expected.height)fail('Photo metadata does not match the reviewed backup.');
 return {namespace:expected.namespace,photo};
}
/** Returns a complete replacement only after every reviewed photo has been read and verified. */
export async function prepareBackupRestore(current,manifest,input,{ownerId,review,readMedia}={}){
 exact(input,['requestId','reviewToken','confirmation']);
 if(typeof input.requestId!=='string'||!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(input.requestId)||input.confirmation!=='replace')fail('Confirm replacement of this workspace.');
 if(!object(review)||review.version!==1||review.ownerId!==ownerId||!ownerId||!hash(review.token)||review.token!==input.reviewToken||review.manifestDigest!==manifest.digest||review.revision!==digest(current))fail('Your workspace or backup changed. Inspect it again.',409);
 const validated=validateBackupManifest(manifest);if(typeof readMedia!=='function')fail('Restore photo storage is unavailable.',503);
 for(const row of validated.manifest.media){const photo=await readMedia(row.namespace,row.id);await validateBackupMedia(validated.manifest,{namespace:row.namespace,photo});}
 return {state:validated.restored,summary:validated.summary,revision:review.revision,manifestDigest:manifest.digest,requestId:input.requestId};
}
