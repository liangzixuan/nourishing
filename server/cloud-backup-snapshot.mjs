import {Permission,Role} from 'node-appwrite';
import {isDeepStrictEqual} from 'node:util';
import {unpackWorkspace} from './data-codec.mjs';
import {workspaceRows} from './workspace-generations.mjs';
import {workspaceMediaRows,describeWorkspaceMedia,verifyWorkspaceMediaFile} from './workspace-media.mjs';
import {backupReferences,backupManifest,validateBackupManifest,validateBackupMedia} from './backup.mjs';

// The current portable-backup picker accepts files up to 1 GiB.
export const MAX_PORTABLE_BACKUP_BYTES=1024*1024*1024;
const fail=(message,code=409)=>{throw Object.assign(Error(message),{code});};
const same=(a,b)=>a.ownerId===b.ownerId&&a.generation===b.generation&&a.digest===b.digest&&a.layout===b.layout;
/** Read only. This boundary never initializes an absent workspace or requests a transaction. */
export async function readCloudBackupSnapshot({db,storage,ownerId,now=()=>Date.now(),maxAttempts=3}){
 if(typeof ownerId!=='string'||!/^[a-zA-Z0-9][\w.-]{0,35}$/.test(ownerId)||!Number.isInteger(maxAttempts)||maxAttempts<1||maxAttempts>3)fail('Invalid backup owner or attempt limit.',400);
 const permissions=[Permission.read(Role.user(ownerId))];
 async function head(){const row=await db.getRow({databaseId:'nourishing',tableId:'workspace_heads',rowId:ownerId});if(row.ownerId!==ownerId||row.$id!==ownerId||!isDeepStrictEqual(row.$permissions,permissions))fail('Workspace ownership could not be verified.');return row;}
 for(let attempt=0;attempt<maxAttempts;attempt++){
  const before=await head();
  try{
   const rows=await workspaceRows(db,ownerId,before.generation);if(rows.some(row=>!isDeepStrictEqual(row.$permissions,permissions)))fail('Workspace record ownership could not be verified.');
   const state=unpackWorkspace(before,rows),mediaRows=await workspaceMediaRows(db,ownerId,before.generation),index=new Map(mediaRows.map(row=>[row.namespace+':'+row.sourceId,row]));
   const references=backupReferences(state),selected=references.map(ref=>index.get(ref.namespace+':'+ref.id)),descriptors=references.map((ref,i)=>describeWorkspaceMedia(selected[i],ref,{owner:ownerId,generation:before.generation}));
   const manifest=backupManifest(state,descriptors,{asOf:now()});
   const projectedBytes=Buffer.byteLength(JSON.stringify(manifest))+descriptors.reduce((sum,row)=>sum+Math.ceil(row.bytes/3)*4+36,0);
   if(projectedBytes>MAX_PORTABLE_BACKUP_BYTES)fail('Backup exceeds the supported portable file size.',413);
   const media=[];
   for(let index=0;index<selected.length;index++){const photo=await verifyWorkspaceMediaFile(storage,selected[index],{owner:ownerId});media.push({...descriptors[index],dataUrl:'data:image/jpeg;base64,'+photo.bytes.toString('base64')});}
   if(!same(before,await head()))continue;
   return {revision:before.digest,generation:before.generation,manifest,bundle:{...manifest,media}};
  }catch(error){if(!same(before,await head()))continue;throw error;}
 }
 fail('Workspace changed during backup. Try again.');
}
/** Validate the same portable format consumed by the browser restore flow. */
export async function validatePortableBackup(bundle){
 if(!bundle||!Array.isArray(bundle.media))fail('Incomplete portable backup.',400);
 const manifest={...bundle,media:bundle.media.map(({dataUrl,...row})=>row)},validated=validateBackupManifest(manifest);
 for(const row of bundle.media)await validateBackupMedia(manifest,{namespace:row.namespace,photo:{id:row.id,dataUrl:row.dataUrl}});
 return validated;
}
