import {t} from './app-language.js';
import {fc} from './food-cloud-messages.js';
import {request,command,queueCommand} from './diary-api.js';
import {readDeviceCache} from './device-cache.js';
import {readWriteCopy} from './offline-store.js';
import {offlineEffectiveState} from './offline-model.js';
import {favoriteItems} from './local-diary-projection.js';
import {escape as e} from './html.js';

export function favoriteButton(kind,id,enabled){return `<button type="button" class="icon-button favorite-button" data-favorite-kind="${e(kind)}" data-favorite-id="${e(id)}" aria-label="${e(fc(enabled?'removeFavorite':'addFavorite'))}" aria-pressed="${enabled}">${enabled?'★':'☆'}</button>`;}
const favoritesPath='/api/library/favorites';

export async function readFavorites(signal){
 const {ticket,value}=await readDeviceCache(favoritesPath);
 const copy=ticket&&await readWriteCopy();
 if(copy&&(copy.locked||copy.ownerId!==ticket.ownerId||copy.ticket.epoch!==ticket.epoch))throw new DOMException('Account changed.','AbortError');
 if(copy?.snapshot?.state){
  const knownItems=[...(value?.items??[])];
  for(const row of copy.pending){
   if(row.command.type!=='favorite.set'||row.command.generation&&row.command.generation!==copy.snapshot.identity.generation)continue;
   if(row.projection.favoriteItem)knownItems.push(row.projection.favoriteItem);
   else knownItems.push(...(row.projection.responses?.[favoritesPath]?.items??[]));
  }
  return {revision:copy.snapshot.revision,items:favoriteItems(offlineEffectiveState(copy),knownItems),ticket};
 }
 return {...await request(favoritesPath,undefined,signal),ticket};
}

export async function setFavorite({kind,id,enabled,resource,revision,ticket,onChange}){
 const payload={kind,id,enabled};
 const scope=ticket===undefined?(await readDeviceCache(favoritesPath)).ticket:ticket;
 let result;
 if(scope){
  const projection={};
  if(enabled&&resource){
   projection.favoriteItem={kind,id,name:resource.name,serving:resource.serving??null,favorite:true};
   if(kind==='food'&&resource.nutrients)projection.foods=[resource];
  }
  result=await queueCommand(revision,'favorite.set',payload,{ticket:scope,projection});
 }else{
  // Online-only sessions have no account-owned outbox or response cache.
  result=await command(revision,'favorite.set',payload);
 }
 await onChange?.();
 return result;
}

export function openFavorites({show,header,content,openEntry,onChange}){
 let disposed=false,serial=0,data;
 const current=()=>!disposed&&content.querySelector('[data-favorites]');
 show(`${header(t("mobileSearch.favorites"))}<section data-favorites><label class="search-box"><input type="search" aria-label="${e(fc("searchFavorites"))}" placeholder="${e(fc("searchFavorites"))}"></label><ul class="search-results"></ul><p class="sheet-message" role="status">${e(t("mobileNutrientDetail.loading"))}</p></section>`);
 const section=current(),search=section.querySelector('input'),list=section.querySelector('ul'),status=section.querySelector('[role=status]');
 const render=()=>{if(!current())return;const q=search.value.toLocaleLowerCase(),items=data.items.filter(item=>item.name.toLocaleLowerCase().includes(q));list.innerHTML=items.map(item=>`<li class="favorite-result"><button type="button" data-favorite-open="${e(item.id)}" data-kind="${e(item.kind)}"><strong>${e(item.name)}</strong><small>${e(item.serving??item.kind)}</small></button>${favoriteButton(item.kind,item.id,true)}</li>`).join('');status.textContent=items.length?'':q?fc("noMatchingFavorites"):fc("noFavorites");};
 async function load(){const id=++serial;try{const next=await readFavorites();if(id!==serial||!current())return;data=next;render();}catch(error){if(current())status.textContent=error.message;}}
 search.oninput=()=>data&&render();
 section.onclick=async event=>{const item=event.target.closest('[data-favorite-open]'),button=event.target.closest('[data-favorite-id]');if(item)return openEntry(item.dataset.kind,item.dataset.favoriteOpen);if(!button||button.disabled||!data)return;button.disabled=true;status.textContent='';try{await setFavorite({kind:button.dataset.favoriteKind,id:button.dataset.favoriteId,enabled:false,revision:data.revision,ticket:data.ticket,onChange});await load();}catch(error){if(current()){status.textContent=error.message;button.disabled=false;}}};
 load();return ()=>{disposed=true;serial++;};
}
