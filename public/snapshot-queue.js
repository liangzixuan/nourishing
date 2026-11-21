import {applyWriteToState} from './write-projection.js';

export const snapshotMediaPath=id=>'/api/media?'+new URLSearchParams({namespace:'progress_photos',id});
export const newestSnapshot=(a,b)=>b.date.localeCompare(a.date)||(b.time??'').localeCompare(a.time??'')||b.createdAt.localeCompare(a.createdAt)||b.id.localeCompare(a.id);

// Keep projections as metadata. The original file belongs only to the pending
// add and its temporary preview. The prepared JPEG is the only upload body.
export function projectSnapshotList(base,copy){
 const pending=copy.pending.filter(row=>row.command.type.startsWith('snapshot.'));
 if(!pending.length)return base;
 const canonical=new Map(base.items.map(item=>[item.id,item]));
 // The first pre-send snapshot is retained until acknowledgement. A server list
 // can already contain an add whose reply was lost, with an as yet unknown ID.
 const baseline=copy.snapshot?.state ? copy.snapshot.state.progressSnapshots??[] : null;
 const items=baseline&&pending.some(row=>row.command.type==='snapshot.add'&&row.attempted)?baseline.map(item=>canonical.get(item.id)??item):base.items;
 const state={progressSnapshots:structuredClone(items)};
 for(const row of pending){
  applyWriteToState(state,row);
  if(row.command.type==='snapshot.add'){
   const item=state.progressSnapshots.find(item=>item.id===row.command.operationId);
   if(item)item.localPhoto=row.projection?.snapshotSource??row.transport.body.photo?.dataUrl??item.localPhoto;
  }
 }
 return {...base,items:state.progressSnapshots.sort(newestSnapshot)};
}

// Retain an acknowledged list if the user closes the app before its next read.
export function acknowledgedSnapshotList(base,row,result){
 const state={progressSnapshots:structuredClone(base.items)};
 applyWriteToState(state,row,result);
 return {items:state.progressSnapshots.sort(newestSnapshot),revision:result.revision??base.revision};
}
