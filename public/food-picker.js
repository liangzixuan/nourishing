import {favoriteButton,setFavorite} from './library-extras.js';
import {request} from './diary-api.js';
import {escape as e} from './html.js';
export function mountFoodPicker(root,{onPick,allowMeals=true,allowRecipes=true,excludeRecipe=null,onBarcode,onBranded}){
 root.innerHTML=`${onBarcode||onBranded?`<div class="barcode-tools">${onBarcode?'<button type="button" data-picker-barcode>Scan Barcode</button>':''}${onBranded?'<button type="button" data-picker-branded>Branded Foods</button>':''}</div>`:''}<div class="picker-tabs" role="group" aria-label="Food sources">${[['catalog','All Foods'],['favorites','Favorites'],['food','My Foods'],...(allowRecipes?[['recipe','Recipes']]:[]),...(allowMeals?[['meal','Meals']]:[])].map(([id,label])=>`<button type="button" data-source="${id}" aria-pressed="${id==='catalog'}">${label}</button>`).join('')}</div><form class="search-box"><input type="search" aria-label="Search foods" placeholder="Search foods" autocomplete="off"><button aria-label="Search">Search</button></form><p class="sheet-message" role="status"></p><ul class="search-results"></ul><button type="button" class="more-results" hidden>Show more</button>`;
 let source='catalog',items=null,favorites=null,timer,serial=0,abort,nextOffset=null;
 const form=root.querySelector('form'),input=form.querySelector('input'),list=root.querySelector('ul'),status=root.querySelector('[role=status]'),more=root.querySelector('.more-results');
 async function search(offset=0){
  abort?.abort();abort=new AbortController();const signal=abort.signal,id=++serial;status.textContent='Searching…';more.hidden=true;
  try{
   let rows;favorites??=await request('/api/library/favorites',null,signal);
   if(source==='catalog'){const result=await request('/api/catalog/search?'+new URLSearchParams({q:input.value,offset,limit:25}),null,signal);rows=result.items.map(item=>({...item,kind:'food'}));nextOffset=result.nextOffset;}
   else if(source==='favorites'){const query=input.value.toLocaleLowerCase();rows=favorites.items.filter(item=>(allowMeals||item.kind!=='meal')&&(allowRecipes||item.kind!=='recipe')&&item.id!==excludeRecipe&&item.name.toLocaleLowerCase().includes(query));nextOffset=null;}
   else{items??=(await request('/api/library',null,signal)).items;const query=input.value.toLocaleLowerCase();rows=items.filter(item=>item.kind===source&&!item.retired&&item.id!==excludeRecipe&&item.name.toLocaleLowerCase().includes(query));nextOffset=null;}
   if(id!==serial||!root.isConnected)return;
   const html=rows.map(item=>`<li class="favorite-result"><button type="button" data-item="${e(item.id)}" data-kind="${item.kind}"><strong>${e(item.name)}</strong><small>${e(item.serving??(item.kind==='food'?'Custom food':item.kind))}</small></button>${favoriteButton(item.kind,item.id,favorites.items.some(f=>f.kind===item.kind&&f.id===item.id))}</li>`).join('');
   if(offset)list.insertAdjacentHTML('beforeend',html);else list.innerHTML=html;more.hidden=nextOffset===null;status.textContent=rows.length?'':'No foods found.';
  }catch(error){if(id===serial&&root.isConnected&&error.name!=='AbortError')status.textContent=error.message;}
 }
 form.onsubmit=event=>{event.preventDefault();clearTimeout(timer);search();};input.oninput=()=>{clearTimeout(timer);timer=setTimeout(()=>{if(root.isConnected)search();},250);};more.onclick=()=>search(nextOffset);
 root.onclick=async event=>{const favorite=event.target.closest('[data-favorite-id]');if(favorite){if(favorite.disabled)return;favorite.disabled=true;try{favorites??=await request('/api/library/favorites');await setFavorite({kind:favorite.dataset.favoriteKind,id:favorite.dataset.favoriteId,enabled:favorite.getAttribute('aria-pressed')!=='true',revision:favorites.revision});favorites=null;items=null;await search();}catch(error){if(root.isConnected){status.textContent=error.message;favorite.disabled=false;favorites=null;}}return;}if(event.target.closest('[data-picker-barcode]'))return onBarcode?.();if(event.target.closest('[data-picker-branded]'))return onBranded?.();const tab=event.target.closest('[data-source]'),item=event.target.closest('[data-item]');if(tab){source=tab.dataset.source;root.querySelectorAll('[data-source]').forEach(b=>b.setAttribute('aria-pressed',b===tab));search();}if(item)onPick(item.dataset.kind,item.dataset.item);};
 search();return ()=>{serial++;clearTimeout(timer);abort?.abort();};
}
