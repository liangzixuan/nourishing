import {coreText} from './core-cloud-messages.js';

// Background retries are silent. Only blocked changes need a review action.
// Keep our own node so clearing sync status never removes an editor error.
export function createSyncNotice({notice,review}){
 let node=null,requestId=null;
 return event=>{
  if(event.saved){node?.remove();node=null;requestId=null;return;}
  if(!event.requiresAttention)return;
  if(node?.isConnected&&requestId===event.requestId)return;
  node?.remove();requestId=event.requestId;
  node=document.createElement('span');node.dataset.syncNotice='';
  const message=document.createElement('span');message.textContent=coreText('sync.reviewNeeded')+' ';
  const button=document.createElement('button');button.type='button';button.textContent=coreText('sync.review');
  button.onclick=()=>review();node.append(message,button);notice.append(node);
 };
}
