import {Query,Permission,Role} from 'node-appwrite';
import {isDeepStrictEqual} from 'node:util';
import {rowId} from './data-codec.mjs';
import {validateStoredPhoto,MAX_STORED_PHOTO_BYTES,MAX_PHOTO_EDGE} from './domain/photo-images.mjs';
const permissions=owner=>[Permission.read(Role.user(owner))];
const fail=message=>{throw Object.assign(Error(message),{code:409,publicMessage:message});};

export async function workspaceMediaRows(db,owner,generation){
 const rows=[];let after;
 do{const page=await db.listRows({databaseId:'nourishing',tableId:'workspace_media',queries:[Query.equal('ownerId',owner),Query.equal('generation',generation),Query.orderAsc('$id'),Query.limit(100),...(after?[Query.cursorAfter(after)]:[])],total:false});rows.push(...page.rows);after=page.rows.length===100?page.rows.at(-1).$id:null;}while(after);
 return rows;
}
export function describeWorkspaceMedia(row,ref,{owner,generation}){
 if(!row||row.ownerId!==owner||row.generation!==generation||row.namespace!==ref.namespace||row.sourceId!==ref.id||row.digest!==ref.id||row.$id!==rowId(owner,generation,ref.namespace,ref.id)||row.fileId!==rowId(owner,ref.namespace,ref.id)||!isDeepStrictEqual(row.$permissions,permissions(owner)))fail('A workspace photo is missing or its ownership is invalid.');
 if(!Number.isSafeInteger(row.bytes)||row.bytes<1||row.bytes>MAX_STORED_PHOTO_BYTES||![row.width,row.height].every(value=>Number.isInteger(value)&&value>0&&value<=MAX_PHOTO_EDGE))fail('Stored photo dimensions or size are invalid.');
 return {namespace:ref.namespace,id:ref.id,bytes:row.bytes,width:row.width,height:row.height};
}
export async function verifyWorkspaceMediaFile(storage,row,{owner}){
 if(!storage)fail('Photo storage is required to retain this workspace.');
 const args={bucketId:'private-media',fileId:row.fileId};
 const file=await storage.getFile(args);
 if(!isDeepStrictEqual(file.$permissions,permissions(owner))||file.sizeOriginal!==row.bytes||file.name!==row.fileId+'.jpg')fail('Stored photo ownership could not be verified.');
 const bytes=Buffer.from(await storage.getFileView(args));
 let photo;try{photo=await validateStoredPhoto({id:row.digest,dataUrl:'data:image/jpeg;base64,'+bytes.toString('base64')});}catch{fail('Stored photo failed verification.');}
 if(photo.bytes.length!==row.bytes||photo.width!==row.width||photo.height!==row.height)fail('Stored photo dimensions or size differ from the workspace.');
 return photo;
}
export function copyWorkspaceMediaRow(row,{owner,generation}){
 const data=Object.fromEntries(['ownerId','namespace','sourceId','fileId','digest','width','height','bytes'].map(key=>[key,row[key]]));
 return {$id:rowId(owner,generation,row.namespace,row.sourceId),$permissions:permissions(owner),...data,generation};
}
export async function verifiedWorkspaceMedia({db,storage,owner,generation,references}){
 const rows=await workspaceMediaRows(db,owner,generation),byKey=new Map(rows.map(row=>[row.namespace+':'+row.sourceId,row])),selected=[],descriptors=[];
 for(const ref of references){const row=byKey.get(ref.namespace+':'+ref.id);descriptors.push(describeWorkspaceMedia(row,ref,{owner,generation}));await verifyWorkspaceMediaFile(storage,row,{owner});selected.push(row);}
 return {rows:selected,descriptors};
}
