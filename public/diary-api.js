import {lockCurrentOffline} from './offline-session.js';
let pending=null;
export const clearPending=()=>{pending=null;};
export async function request(path,body,signal){
 const response=await fetch(path,{method:body?'POST':'GET',credentials:'same-origin',cache:'no-store',signal,headers:body?{'Content-Type':'application/json'}:{},...(body?{body:JSON.stringify(body)}:{})});
 if(response.status===401){await lockCurrentOffline();pending=null;document.querySelector('#page')?.replaceChildren();document.querySelector('#sheet-content')?.replaceChildren();location.replace('/login');throw Error('Please sign in.');}
 const result=await response.json().catch(()=>{throw Error('Unable to connect. Please try again.');});if(!response.ok)throw Object.assign(Error(result.error||'Unable to save. Try again.'),{status:response.status});return result;
}
export async function command(revision,type,payload){
 const signature=JSON.stringify({revision,type,payload});if(pending?.signature!==signature)pending={signature,body:{revision,type,payload,requestId:crypto.randomUUID()}};
 const path=['cycle.import','cycle.remove'].includes(type)?'/api/cycle/'+type.split('.')[1]:type==='share.import'?'/api/library/share/import':['records.copy','records.clear-amounts','records.move-group','records.set-time','records.delete','selection.meal','diary.order','group.order'].includes(type)?'/api/diary/tools/save':type==='barcode.log'?'/api/barcode/save':['library.portions','library.retirement'].includes(type)?'/api/library/command':type==='entry.ingredients.adjust'?'/api/diary/ingredients/save':'/api/workspace/command';
 const result=await request(path,pending.body);pending=null;return result;
}

export function photoSaver(revision){
 let pendingPhoto=null;
 return async input=>{
  const signature=JSON.stringify(input);
  if(pendingPhoto?.signature!==signature)pendingPhoto={signature,body:{...input,revision:revision(),requestId:crypto.randomUUID()}};
  const result=await request('/api/photos/save',pendingPhoto.body);pendingPhoto=null;return result;
 };
}
