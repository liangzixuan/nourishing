import {offlineFailure} from './offline-errors.js';
import {changeOfflineCopy} from './offline-store.js';
export async function retryOfflineChange(copy,id){return changeOfflineCopy(copy.ticket,current=>{const row=current.pending.find(row=>row.command.operationId===id);if(!row||!['conflict','unknown'].includes(row.status))throw offlineFailure('noLongerPending');if(row.command.ownerId!==current.ownerId||row.command.generation&&row.command.generation!==current.snapshot?.identity.generation)throw offlineFailure('olderDiary');row.status='pending';row.error=null;delete row.messageKey;delete row.errorCode;delete row.errorStatus;return current;});}
export async function discardOfflineChange(copy,id){
 return changeOfflineCopy(copy.ticket,current=>{
  const isSnapshot=current.pending.some(row=>row.command.operationId===id&&row.command.type==='snapshot.add');
  const dependent=row=>isSnapshot&&['snapshot.update','snapshot.delete'].includes(row.command.type)&&row.command.payload.id===id;
  current.pending=current.pending.filter(row=>row.command.operationId!==id&&!dependent(row));
  return current;
 });
}
