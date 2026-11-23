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
export function mountFoodPicker(root,{onPick,onClose,allowMeals=true,allowRecipes=true,excludeRecipe=null,onBarcode,onBranded,multi=null,restore=null,initialCategory,prepareCatalogDetails=false}){
 root.classList.add('food-picker-host');
 // The search view can append pages. Prepare the latest requested page, with
 // at most one read in flight. A tap on an earlier page selects its own batch.
 let latest=null,reading=null;
 function prepare(items){
  if(!prepareCatalogDetails)return null;
  const ids=items.filter(row=>row.kind==='catalog').map(row=>row.id).sort();
  if(!ids.length){latest=null;return null;}
  const path='/api/catalog/food-details?'+new URLSearchParams(ids.map(id=>['id',id]));
  if(latest?.path===path)return latest;
  const page={path,ids};latest=page;
  page.result=(async()=>{
   if(reading)await reading;
   if(latest!==page&&!page.selected)return null;
   const work=request(path).catch(()=>null);
   reading=work;
   try{return await work;}finally{if(reading===work)reading=null;}
  })();
  return page;
 }
 function pick(row){
  const kind=({catalog:'food',foods:'food',recipes:'recipe',meals:'meal'})[row.kind];
  const meta={source:row.kind==='catalog'?'catalog':'library'};
  if(prepareCatalogDetails&&row.kind==='catalog'){
   const items=search.search.state.items;
   const start=Math.floor(items.indexOf(row)/search.search.limit)*search.search.limit;
   const page=latest?.ids.includes(row.id)?latest:prepare(items.slice(start,start+search.search.limit));
   if(page){
    page.selected=true;
    meta.catalogFood=page.result.then(result=>result?.foods?.find(food=>food.id===row.id));
   }
  }
  return onPick(kind,row.id,meta);
 }
 const search=new MobileFoodSearch({root,initialCategory,language:uiLanguage(),request:(path,{signal,body}={})=>request(path,body?JSON.parse(body):null,signal),onScan:onBarcode,multi:multi?{...multi,onReview:multiReviewer(multi.ownerId,{requireTicket:Boolean(multi.onQueue)})}:null,restore:restore??multi?.restore,
  fetchPage:async(params,signal)=>{params.set('allowMeals',String(allowMeals));params.set('allowRecipes',String(allowRecipes));if(excludeRecipe)params.set('excludeRecipe',excludeRecipe);const local=await localFoodSearch(params);const page=local??await request('/api/food-search?'+params,null,signal);
   if(!signal.aborted)prepare(page.items);
   return page;},
  onPick:pick,
  onClose:onClose??(()=>root.closest('dialog')?.querySelector('[data-close]')?.click()),onPreferenceError:message=>{root.querySelector('[role=status]').textContent=message;}
 });
 const restored=restore??multi?.restore;
 if(restored?.search?.result)prepare(restored.search.result.items);
 if(onBranded){const button=document.createElement('button');button.type='button';button.dataset.pickerBranded='';button.textContent=fc("searchBranded");button.onclick=onBranded;root.querySelector('.mfs-content').append(button);}
 const dispose=()=>{latest=null;search.dispose();root.classList.remove('food-picker-host');};
 Object.assign(dispose,{snapshot:()=>search.snapshot(),ready:search.multi?.ready??Promise.resolve(),applyEntry:(entry,label)=>search.multi?.applyEntry(entry,label)??false,returnFromDetail:()=>search.multi?.returnFromDetail(),select:(row,entry)=>search.multi?.select(row,entry)??false});return dispose;
}
