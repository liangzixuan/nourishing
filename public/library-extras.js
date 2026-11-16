import {request,command} from './diary-api.js';
import {escape as e} from './html.js';

export function favoriteButton(kind,id,enabled){return `<button type="button" class="icon-button favorite-button" data-favorite-kind="${e(kind)}" data-favorite-id="${e(id)}" aria-label="${enabled?'Remove from':'Add to'} favorites" aria-pressed="${enabled}">${enabled?'★':'☆'}</button>`;}
export async function setFavorite({kind,id,enabled,revision,onChange}){const result=await command(revision,'favorite.set',{kind,id,enabled});await onChange?.();return result;}

export function openFavorites({show,header,content,openEntry,onChange}){
 let disposed=false,serial=0,data;
 const current=()=>!disposed&&content.querySelector('[data-favorites]');
 show(`${header('Favorites')}<section data-favorites><label class="search-box"><input type="search" aria-label="Search favorites" placeholder="Search favorites"></label><ul class="search-results"></ul><p class="sheet-message" role="status">Loading…</p></section>`);
 const section=current(),search=section.querySelector('input'),list=section.querySelector('ul'),status=section.querySelector('[role=status]');
 const render=()=>{if(!current())return;const q=search.value.toLocaleLowerCase(),items=data.items.filter(item=>item.name.toLocaleLowerCase().includes(q));list.innerHTML=items.map(item=>`<li class="favorite-result"><button type="button" data-favorite-open="${e(item.id)}" data-kind="${e(item.kind)}"><strong>${e(item.name)}</strong><small>${e(item.serving??item.kind)}</small></button>${favoriteButton(item.kind,item.id,true)}</li>`).join('');status.textContent=items.length?'':q?'No matching favorites.':'No favorites yet.';};
 async function load(){const id=++serial;try{const next=await request('/api/library/favorites');if(id!==serial||!current())return;data=next;render();}catch(error){if(current())status.textContent=error.message;}}
 search.oninput=()=>data&&render();
 section.onclick=async event=>{const item=event.target.closest('[data-favorite-open]'),button=event.target.closest('[data-favorite-id]');if(item)return openEntry(item.dataset.kind,item.dataset.favoriteOpen);if(!button||button.disabled||!data)return;button.disabled=true;status.textContent='';try{await setFavorite({kind:button.dataset.favoriteKind,id:button.dataset.favoriteId,enabled:false,revision:data.revision,onChange});await load();}catch(error){if(current()){status.textContent=error.message;button.disabled=false;}}};
 load();return ()=>{disposed=true;serial++;};
}
