import {Permission,Role,Query} from 'node-appwrite';
import {isDeepStrictEqual} from 'node:util';
import {rowId,unpackWorkspace} from './data-codec.mjs';
import {workspaceRows} from './workspace-store.mjs';
import {backupManifest,backupReferences,validateBackupManifest,validateBackupMedia} from './backup.mjs';

const databaseId='nourishing',args=(tableId,id)=>({databaseId,tableId,rowId:id});
const permissions=owner=>[Permission.read(Role.user(owner))];
const fail=(message,code=409)=>{throw Object.assign(Error(message),{code,publicMessage:message});};
const damaged=(reason,status='invalid')=>{throw Object.assign(Error(reason),{recoveryStatus:status});};
const identity=value=>typeof value==='string'&&value.length>0&&value.length<=36;
const timestamp=value=>typeof value==='string'&&Number.isFinite(Date.parse(value))&&new Date(value).toISOString()===value;

/** Save these exact verified fields in the same transaction that replaces the head. */
export function recoveryMarker(head,retainedAt){
 if(!identity(head?.ownerId)||!identity(head?.generation)||!timestamp(retainedAt))fail('Recovery metadata is invalid.',503);
 const saved=Object.fromEntries(['ownerId','generation','layout','digest'].map(key=>[key,head[key]]));
 return {$id:rowId(head.ownerId,head.generation),$permissions:[],ownerId:head.ownerId,generation:head.generation,head:JSON.stringify(saved),retainedAt};
}

/** Owner is supplied by authentication. Old rows without a retained head are never inferred complete. */
export function createRecoveryView({db,storage,ownerId}){
 if(!identity(ownerId))fail('Sign in to use recovery.',401);
 const owner=ownerId;
 async function pages(tableId,extra=[],select){
  const rows=[];let after;
  do{
   const page=await db.listRows({databaseId,tableId,queries:[Query.equal('ownerId',owner),...extra,Query.orderAsc('$id'),Query.limit(100),...(select?[Query.select(select)]:[]),...(after?[Query.cursorAfter(after)]:[])],total:false});
   if(!Array.isArray(page.rows))fail('Recovery inventory is unavailable.',503);
   for(const row of page.rows){if(row.ownerId!==owner||!identity(row.generation))fail('Recovery ownership could not be verified.',503);rows.push(row);}
   const next=page.rows.length===100?page.rows.at(-1).$id:null;if(next===after&&next)fail('Recovery inventory is incomplete.',503);after=next;
  }while(after);
  return rows;
 }
 async function head(){const value=await db.getRow(args('workspace_heads',owner));if(value.ownerId!==owner)fail('Workspace not found.',404);return value;}
 async function stable(before){const latest=await head();if(latest.generation!==before.generation||latest.digest!==before.digest)fail('Your workspace changed. Open recovery again.');}
 function readMarker(marker,generation){
  if(!marker||marker.$id!==rowId(owner,generation)||marker.ownerId!==owner||marker.generation!==generation||!isDeepStrictEqual(marker.$permissions,[])||!timestamp(marker.retainedAt))damaged('Recovery metadata could not be verified.');
  let saved;try{saved=JSON.parse(marker.head);}catch{damaged('Recovery metadata could not be read.');}
  if(!saved||typeof saved!=='object'||saved.ownerId!==owner||saved.generation!==generation||typeof saved.layout!=='string'||!/^[a-f0-9]{64}$/.test(saved.digest??''))damaged('Recovery metadata could not be verified.');
  return saved;
 }
 async function materialize(marker,{verifyFiles=false}={}){
  const generation=marker.generation,saved=readMarker(marker,generation),records=await workspaceRows(db,owner,generation);
  if(records.some(row=>!isDeepStrictEqual(row.$permissions,permissions(owner))))damaged('Recovery record ownership is invalid.');
  let state;try{state=unpackWorkspace(saved,records);}catch{damaged('Stored records do not match the retained version.','incomplete');}
  const media=await pages('workspace_media',[Query.equal('generation',generation)]),byKey=new Map(media.map(row=>[row.namespace+':'+row.sourceId,row])),selected=[];
  let refs;try{refs=backupReferences(state);}catch{damaged('Recovery photo references are invalid.');}
  const descriptors=refs.map(ref=>{
   const row=byKey.get(ref.namespace+':'+ref.id);
   if(!row)damaged('A recovery photo is missing.','incomplete');
   if(row.$id!==rowId(owner,generation,ref.namespace,ref.id)||row.fileId!==rowId(owner,ref.namespace,ref.id)||row.digest!==ref.id||!isDeepStrictEqual(row.$permissions,permissions(owner)))damaged('Recovery photo ownership is invalid.');
   selected.push(row);return {namespace:ref.namespace,id:ref.id,bytes:row.bytes,width:row.width,height:row.height};
  });
  let manifest,summary;try{manifest=backupManifest(state,descriptors,{asOf:marker.retainedAt});summary=validateBackupManifest(manifest).summary;}catch(error){if(error.code===413)throw error;damaged('Retained workspace validation failed.');}
  if(verifyFiles)for(const row of selected){
   let file,bytes;try{file=await storage.getFile({bucketId:'private-media',fileId:row.fileId});bytes=Buffer.from(await storage.getFileView({bucketId:'private-media',fileId:row.fileId}));}catch(error){if(error.code===404)damaged('A recovery photo is missing.','incomplete');throw error;}
   if(!isDeepStrictEqual(file.$permissions,permissions(owner))||file.sizeOriginal!==row.bytes||file.name!==row.fileId+'.jpg')damaged('Recovery photo ownership is invalid.');
   try{await validateBackupMedia(manifest,{namespace:row.namespace,photo:{id:row.digest,dataUrl:'data:image/jpeg;base64,'+bytes.toString('base64')}});}catch{damaged('A recovery photo failed verification.');}
  }
  return {manifest,summary,mediaRows:selected};
 }
 async function list(){
  const current=await head(),generations=new Map();
  for(const table of ['workspace_records','workspace_media','backup_reviews'])for(const row of await pages(table,[],['$id','ownerId','generation'])){
   const prior=generations.get(row.generation);generations.set(row.generation,table==='backup_reviews'?{generation:row.generation,status:'incomplete'}:prior??{generation:row.generation,status:'unverified'});
  }
  const markers=await pages('workspace_recoveries');for(const marker of markers)generations.set(marker.generation,{generation:marker.generation,marker});
  generations.delete(current.generation);const result=[];
  for(const entry of generations.values()){
   if(!entry.marker){result.push({...entry,retainedAt:null,reason:entry.status==='incomplete'?'Restore staging is incomplete.':'No verified recovery manifest.'});continue;}
   const base={generation:entry.generation,retainedAt:timestamp(entry.marker.retainedAt)?entry.marker.retainedAt:null};
   try{const value=await materialize(entry.marker);result.push({...base,status:'available',summary:value.summary});}
   catch(error){if(!error.recoveryStatus)throw error;result.push({...base,status:error.recoveryStatus,reason:error.message});}
  }
  await stable(current);result.sort((a,b)=>(b.retainedAt??'').localeCompare(a.retainedAt??'')||a.generation.localeCompare(b.generation));
  return {revision:current.digest,currentGeneration:current.generation,generations:result};
 }
 async function preview(input){
  if(!input||Object.keys(input).length!==2||!identity(input.generation)||typeof input.revision!=='string')fail('Choose a retained recovery version.',400);
  const current=await head();if(current.digest!==input.revision)fail('Your workspace changed. Open recovery again.');if(current.generation===input.generation)fail('This version is already active.');
  let marker;try{marker=await db.getRow(args('workspace_recoveries',rowId(owner,input.generation)));}catch(error){if(error.code===404)fail('This version has no verified recovery manifest.');throw error;}
  let value;try{value=await materialize(marker,{verifyFiles:true});}catch(error){if(error.recoveryStatus)fail(error.message);throw error;}
  await stable(current);return value;
 }
 return {list,preview};
}
