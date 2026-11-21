import {uiLanguage} from './app-language.js';
import {fc} from './food-cloud-messages.js';
import {request} from './diary-api.js';
import {readWriteCopy} from './offline-store.js';
import {offlineEffectiveState} from './offline-model.js';
import {readDeviceCache} from './device-cache.js';
import {prepareFoodMultiReview} from './local-diary-projection.js';
import {formatMessage} from './food-search-source/message-format.js';
import {localFoodSearch} from './local-search.js';
import {MobileFoodSearch} from './food-search-source/mobile-food-search.js';
export function multiReviewer(ownerId,{requireTicket=true}={}){
 const opened=readDeviceCache('/api/diary');
 return async (input,signal)=>{
  const {ticket}=await opened;
  const remote=()=>request('/api/food-search/preview',input,signal);
  const catalog=input.rows.some(row=>row.selection.kind==='catalog');
  if(catalog&&navigator.onLine===false)throw Error(formatMessage(uiLanguage(),'multiAdd.offlineCatalog'));
  if(!ticket){
   if(requireTicket)throw Error(formatMessage(uiLanguage(),'multiAdd.accountChanged'));
   return remote();
  }
  const {ticket:active}=await readDeviceCache('/api/diary');
  if(ticket.ownerId!==ownerId||active?.ownerId!==ownerId||active.epoch!==ticket.epoch)throw Error(formatMessage(uiLanguage(),'multiAdd.accountChanged'));
  const copy=await readWriteCopy();
  signal?.throwIfAborted();
  if(copy&&(copy.locked||copy.ownerId!==ownerId||copy.ticket.epoch!==ticket.epoch))throw Error(formatMessage(uiLanguage(),'multiAdd.accountChanged'));
  if(catalog||!copy?.snapshot)return remote();
  const {snapshot}=copy;
  if(snapshot.identity?.ownerId!==ownerId||!snapshot.identity.generation||!/^[a-f0-9]{64}$/.test(snapshot.revision))throw Error(formatMessage(uiLanguage(),'multiAdd.accountChanged'));
  return prepareFoodMultiReview(offlineEffectiveState(copy),input,{
   owner:ownerId,revision:snapshot.revision,
   checkDependencies(graph){
    for(const kind of ['foods','recipes','meals']){
     const savedIds=new Set(snapshot.state[kind].map(row=>row.id));
     if(graph[kind].some(row=>!savedIds.has(row.id)))throw Error(formatMessage(uiLanguage(),'multiAdd.pendingSource'));
    }
   }
  });
 };
}
/** Shared source search surface. The third callback argument identifies the selected corpus. */
export function mountFoodPicker(root,{onPick,onClose,allowMeals=true,allowRecipes=true,excludeRecipe=null,onBarcode,onBranded,multi=null,restore=null}){
 root.classList.add('food-picker-host');
 const search=new MobileFoodSearch({root,language:uiLanguage(),request:(path,{signal,body}={})=>request(path,body?JSON.parse(body):null,signal),onScan:onBarcode,multi:multi?{...multi,onReview:multiReviewer(multi.ownerId,{requireTicket:Boolean(multi.onQueue)})}:null,restore:restore??multi?.restore,
  fetchPage:async(params,signal)=>{params.set('allowMeals',String(allowMeals));params.set('allowRecipes',String(allowRecipes));if(excludeRecipe)params.set('excludeRecipe',excludeRecipe);const local=await localFoodSearch(params);if(local)return local;return request('/api/food-search?'+params,null,signal);},
  onPick:row=>onPick(({catalog:'food',foods:'food',recipes:'recipe',meals:'meal'})[row.kind],row.id,{source:row.kind==='catalog'?'catalog':'library'}),
  onClose:onClose??(()=>root.closest('dialog')?.querySelector('[data-close]')?.click()),onPreferenceError:message=>{root.querySelector('[role=status]').textContent=message;}
 });
 if(onBranded){const button=document.createElement('button');button.type='button';button.dataset.pickerBranded='';button.textContent=fc("searchBranded");button.onclick=onBranded;root.querySelector('.mfs-content').append(button);}
 const dispose=()=>{search.dispose();root.classList.remove('food-picker-host');};
 Object.assign(dispose,{snapshot:()=>search.snapshot(),ready:search.multi?.ready??Promise.resolve(),applyEntry:(entry,label)=>search.multi?.applyEntry(entry,label)??false,returnFromDetail:()=>search.multi?.returnFromDetail(),select:(row,entry)=>search.multi?.select(row,entry)??false});return dispose;
}
