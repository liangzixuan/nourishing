import {request} from './diary-api.js';
import {escape as e} from './html.js';
export function mountFoodPicker(root,{onPick,allowMeals=true,excludeRecipe=null,onBarcode,onBranded}){
 root.innerHTML=`${onBarcode||onBranded?`<div class="barcode-tools">${onBarcode?'<button type="button" data-picker-barcode>Scan Barcode</button>':''}${onBranded?'<button type="button" data-picker-branded>Branded Foods</button>':''}</div>`:''}<div class="picker-tabs" role="group" aria-label="Food sources">${[['catalog','All Foods'],['food','My Foods'],['recipe','Recipes'],...(allowMeals?[['meal','Meals']]:[])].map(([id,label])=>`<button type="button" data-source="${id}" aria-pressed="${id==='catalog'}">${label}</button>`).join('')}</div><form class="search-box"><input type="search" aria-label="Search foods" placeholder="Search foods" autocomplete="off"><button aria-label="Search">Search</button></form><p class="sheet-message" role="status"></p><ul class="search-results"></ul><button type="button" class="more-results" hidden>Show more</button>`;
 let source='catalog',items=null,timer,serial=0,abort,nextOffset=null;
 const form=root.querySelector('form'),input=form.querySelector('input'),list=root.querySelector('ul'),status=root.querySelector('[role=status]'),more=root.querySelector('.more-results');
 async function search(offset=0){
  abort?.abort();abort=new AbortController();const signal=abort.signal,id=++serial;status.textContent='Searching…';more.hidden=true;
  try{
   let rows;
   if(source==='catalog'){const result=await request('/api/catalog/search?'+new URLSearchParams({q:input.value,offset,limit:25}),null,signal);rows=result.items.map(item=>({...item,kind:'food'}));nextOffset=result.nextOffset;}
   else{items??=(await request('/api/library',null,signal)).items;const query=input.value.toLocaleLowerCase();rows=items.filter(item=>item.kind===source&&!item.retired&&item.id!==excludeRecipe&&item.name.toLocaleLowerCase().includes(query));nextOffset=null;}
   if(id!==serial||!root.isConnected)return;
   const html=rows.map(item=>`<li><button type="button" data-item="${e(item.id)}" data-kind="${item.kind}"><strong>${e(item.name)}</strong><small>${e(item.serving??(item.kind==='food'?'Custom food':item.kind))}</small></button></li>`).join('');
   if(offset)list.insertAdjacentHTML('beforeend',html);else list.innerHTML=html;more.hidden=nextOffset===null;status.textContent=rows.length?'':'No foods found.';
  }catch(error){if(id===serial&&root.isConnected&&error.name!=='AbortError')status.textContent=error.message;}
 }
 form.onsubmit=event=>{event.preventDefault();clearTimeout(timer);search();};input.oninput=()=>{clearTimeout(timer);timer=setTimeout(()=>{if(root.isConnected)search();},250);};more.onclick=()=>search(nextOffset);
 root.onclick=event=>{if(event.target.closest('[data-picker-barcode]'))return onBarcode?.();if(event.target.closest('[data-picker-branded]'))return onBranded?.();const tab=event.target.closest('[data-source]'),item=event.target.closest('[data-item]');if(tab){source=tab.dataset.source;root.querySelectorAll('[data-source]').forEach(b=>b.setAttribute('aria-pressed',b===tab));search();}if(item)onPick(item.dataset.kind,item.dataset.item);};
 search();return ()=>{serial++;clearTimeout(timer);abort?.abort();};
}
