import {escape as e} from './html.js';
import {request} from './diary-api.js';
import {openSuggestions} from './suggestions.js';
const fmt=value=>Number.isFinite(value)?Number(value.toFixed(1)).toLocaleString():'—';
const select=(name,title,choices,value)=>`<label class="field-row"><span>${e(title)}</span><select name="${name}" aria-label="${e(title)}">${choices.map(([id,text])=>`<option value="${e(id)}" ${id===value?'selected':''}>${e(text)}</option>`).join('')}</select></label>`;
const rowInput=(name,title,value,type='text')=>`<label class="field-row"><span>${e(title)}</span><input name="${name}" aria-label="${e(title)}" type="${type}" value="${e(value)}"></label>`;
const check=(name,title,value)=>`<label class="field-row"><span>${e(title)}</span><input name="${name}" type="checkbox" ${value?'checked':''}></label>`;
export async function openFoodInsights({mode='suggestions',date,show,close,header,content,onAdd,onAdded,onPreferences}){
 if(mode!=='oracle')return openSuggestions({date,show,close,content,onAdded,onPreferences});
 let options,oracle={nutrient:'protein',basis:'100g',query:'',categoryMode:'all',categoryIds:[],includeUncategorized:false},categories=[];
 show(header('Nutrient Oracle')+'<p class="empty">Loading…</p>');const loading=content.querySelector('.empty');
 try{options=await request('/api/food-insights/options');if(!loading.isConnected)return;oracleForm();}catch(error){if(loading.isConnected)loading.textContent=error.message;}
 function screen(title,body){show(`${header(title)}<section class="food-insights">${body}</section>`);return content.querySelector('.food-insights');}
 function oracleForm(){
  const root=screen('Nutrient Oracle',`<form>${select('nutrient','Nutrient',options.nutrients.map(n=>[n.id,n.name+' ('+n.unit+')']),oracle.nutrient)}${select('basis','Rank by',[['100g','Per 100 g'],['100kcal','Per 100 kcal'],['portion','Per portion']],oracle.basis)}${rowInput('query','Search foods',oracle.query,'search')}${categories.length?`<details><summary>Food categories</summary>${select('categoryMode','Category filter',[['all','All'],['include','Include selected'],['exclude','Exclude selected']],oracle.categoryMode)}<div class="insight-category-list">${categories.map(c=>check('category:'+c.id,c.name,oracle.categoryIds.includes(c.id))).join('')}</div>${check('includeUncategorized','Include uncategorized',oracle.includeUncategorized)}</details>`:''}<p class="sheet-message" role="status"></p><footer class="entry-actions"><button type="submit" class="primary">Search</button></footer></form><div data-oracle-results></div>`),form=root.querySelector('form');
  form.onsubmit=async event=>{event.preventDefault();const values=new FormData(form);oracle={nutrient:values.get('nutrient'),basis:values.get('basis'),query:values.get('query'),categoryMode:values.get('categoryMode')??'all',categoryIds:categories.filter(c=>values.has('category:'+c.id)).map(c=>c.id),includeUncategorized:values.has('includeUncategorized')};await oracleResults(root,form,0);};
 }
 async function oracleResults(root,form,offset){await run(form,async()=>{
  const result=await request('/api/food-insights/oracle',{...oracle,offset,limit:20});if(!root.isConnected)return;categories=result.categories;
  const target=root.querySelector('[data-oracle-results]');target.innerHTML=`<div class="section-actions"><span class="insight-caption">${result.total} matches</span><button type="button" data-categories>Categories</button></div><ul class="insight-results">${result.items.map((item,i)=>`<li><button type="button" data-food="${i}"><strong>${e(item.name)}</strong><small>${e(item.serving)} · ${e(item.source.name)}</small><span class="insight-value">${fmt(item.value)} ${e(result.unit)}</span></button></li>`).join('')||'<li class="empty">No measured matches.</li>'}</ul><div class="section-actions">${offset?'<button type="button" data-prev>Previous</button>':''}${result.nextOffset!==null?'<button type="button" data-next>Next</button>':''}</div>`;
  target.querySelector('[data-categories]').onclick=oracleForm;
  target.querySelector('[data-prev]')?.addEventListener('click',()=>oracleResults(root,form,Math.max(0,offset-20)));target.querySelector('[data-next]')?.addEventListener('click',()=>oracleResults(root,form,result.nextOffset));
  target.onclick=event=>{const button=event.target.closest('[data-food]');if(!button)return;const item=result.items[Number(button.dataset.food)];onAdd(item.ref.kind==='catalog'?'catalog':'food',item.ref.id,item.sourceQuantity);};
 });}
 async function run(form,action){const status=form.querySelector('[role=status]');status.textContent='';form.querySelectorAll('button').forEach(b=>b.disabled=true);try{await action();}catch(error){if(form.isConnected){status.textContent=error.message;if(error.status===409){const reload=document.createElement('button');reload.type='button';reload.textContent='Reload latest';reload.onclick=()=>run(form,async()=>{options=await request('/api/food-insights/options');if(form.isConnected)oracleForm();});status.append(reload);}}}finally{form.querySelectorAll('button').forEach(b=>b.disabled=false);}}
}
