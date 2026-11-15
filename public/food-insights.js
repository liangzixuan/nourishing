import {escape as e} from './html.js';
import {request,command} from './diary-api.js';
import {quantityFields,quantityValue} from './quantity.js';
import {mountFoodPicker} from './food-picker.js';

const labels={'gluten-free':'Gluten Free',milk:'Dairy',egg:'Eggs',peanut:'Peanuts','tree-nut':'Tree Nuts',soy:'Soy',snack:'Snacks'};
const label=id=>labels[id]??id.charAt(0).toUpperCase()+id.slice(1);
const fmt=value=>Number.isFinite(value)?Number(value.toFixed(1)).toLocaleString():'—';
const macros=n=>`${fmt(n.calories)} kcal · ${fmt(n.protein)} g Protein · ${fmt(n.carbs)} g Carbs · ${fmt(n.fat)} g Fat`;
const select=(name,title,choices,value)=>`<label class="field-row"><span>${e(title)}</span><select name="${name}" aria-label="${e(title)}">${choices.map(([id,text])=>`<option value="${e(id)}" ${id===value?'selected':''}>${e(text)}</option>`).join('')}</select></label>`;
const rowInput=(name,title,value,type='text')=>`<label class="field-row"><span>${e(title)}</span><input name="${name}" aria-label="${e(title)}" type="${type}" value="${e(value)}"></label>`;
const check=(name,title,value)=>`<label class="field-row"><span>${e(title)}</span><input name="${name}" type="checkbox" ${value?'checked':''}></label>`;
const cleanRows=rows=>rows.map(({ref,quantity,unit,portionId})=>({ref,quantity,unit,...(unit==='portion'?{portionId}:{})}));
const sameRef=(a,b)=>(a.ref??a).kind===(b.ref??b).kind&&(a.ref??a).id===(b.ref??b).id;

/** Uses the app's existing dismissible sheet; all drafts live only in this invocation. */
export async function openFoodInsights({mode='suggestions',date,show,close,header,content,onAdd,onAddMeal}){
 const day=typeof date==='function'?date():date;let options,filters={diets:[],categories:[],exclusions:[],includeCustom:false},oracle={nutrient:'protein',basis:'100g',query:'',categoryMode:'all',categoryIds:[],includeUncategorized:false},categories=[],lastResults;
 const title=mode==='oracle'?'Nutrient Oracle':'Suggest Food';
 show(header(title)+'<p class="empty">Loading…</p>');const loading=content.querySelector('.empty');
 try{options=await request('/api/food-insights/options');if(!loading.isConnected)return;mode==='oracle'?oracleForm():suggestionForm();}catch(error){if(loading.isConnected)loading.textContent=error.message;}
 function screen(title,body){show(`${header(title)}<section class="food-insights">${body}</section>`);return content.querySelector('.food-insights');}
 function chips(name,values,selected){return `<fieldset class="insight-filters"><legend>${name==='diets'?'Diets':name==='categories'?'Category':'Common exclusions'}</legend><div>${values.map(id=>`<button type="button" class="insight-chip ${name==='exclusions'?'exclude':''}" data-filter="${name}" data-value="${id}" aria-pressed="${selected.includes(id)}">${e(label(id))}</button>`).join('')}</div></fieldset>`;}
 function suggestionForm(){
  const root=screen('Suggest Food',`<form><div class="section-actions"><p class="insight-caption">Local suggestions · ${e(day)}</p><button type="button" data-preferences>Preferences</button></div>${chips('diets',options.suggestions.diets,filters.diets)}${chips('categories',options.suggestions.categories,filters.categories)}${chips('exclusions',options.suggestions.exclusions,filters.exclusions)}<div class="insight-section">${check('includeCustom','Include Custom Foods',filters.includeCustom)}</div><p class="sheet-message" role="status"></p><footer class="entry-actions"><button type="submit" class="primary">Get Suggestions</button></footer></form>`),form=root.querySelector('form');
  root.querySelector('[data-preferences]').onclick=()=>{filters.includeCustom=form.elements.includeCustom.checked;preferences();};
  root.onclick=event=>{const b=event.target.closest('[data-filter]');if(!b)return;const selected=filters[b.dataset.filter],id=b.dataset.value;filters[b.dataset.filter]=selected.includes(id)?selected.filter(x=>x!==id):[...selected,id];b.setAttribute('aria-pressed',String(filters[b.dataset.filter].includes(id)));};
  form.onsubmit=async event=>{event.preventDefault();filters.includeCustom=form.elements.includeCustom.checked;await run(form,async()=>{lastResults=await request('/api/food-insights/suggestions',{date:day,filters,limit:20});if(form.isConnected)suggestionResults();});};
 }
 function suggestionResults(){
  const root=screen('Suggestions',`<div class="section-actions"><span class="insight-caption">${lastResults.total} matches</span><button type="button" data-filters>Filters</button></div><ul class="insight-results">${lastResults.items.map((item,i)=>`<li><button type="button" data-meal="${i}"><strong>${e(item.name)}</strong><small>${e(macros(item.nutrition.totals))}</small><small>${item.ranking.personalized?'Fits remaining targets':'Meal idea'}</small><span aria-hidden="true">›</span></button></li>`).join('')||'<li class="empty">No matches. Try fewer filters.</li>'}</ul>${lastResults.nextOffset!==null?'<button type="button" class="more-results" data-more>More suggestions</button>':''}<p class="sheet-message" role="status"></p>`);
  root.querySelector('[data-filters]').onclick=suggestionForm;
  root.onclick=event=>{const b=event.target.closest('[data-meal]');if(b)mealDetail(lastResults.items[Number(b.dataset.meal)]);};
  root.querySelector('[data-more]')?.addEventListener('click',()=>run(root,async()=>{const next=await request('/api/food-insights/suggestions',{date:day,filters,limit:20,offset:lastResults.nextOffset});if(!root.isConnected)return;lastResults={...next,items:[...lastResults.items,...next.items]};suggestionResults();}));
 }
 async function mealDetail(item,draft){
  draft??={rows:cleanRows(item.rows),group:options.groups.includes('Uncategorized')?'Uncategorized':options.groups[0],time:''};
  const root=screen(item.name,'<p class="empty">Loading…</p>');let preview;
  if(!draft.rows.length){root.innerHTML='<p class="empty">Add an ingredient.</p><button type="button" class="more-results" data-add>＋ Add ingredient</button><button type="button" class="more-results" data-back>Back</button>';root.querySelector('[data-add]').onclick=()=>pickIngredient(item,draft);root.querySelector('[data-back]').onclick=suggestionResults;return;}
  try{preview=await request('/api/food-insights/preview',{date:day,rows:draft.rows});if(!root.isConnected)return;}catch(error){if(root.isConnected)root.innerHTML=`<p class="sheet-message">${e(error.message)}</p><button type="button" data-back>Back</button>`;root.querySelector('[data-back]')?.addEventListener('click',suggestionResults);return;}
  root.innerHTML=`<form><div class="section-actions"><button type="button" data-preference>Suggestion preferences</button><button type="button" data-add>＋ Add ingredient</button></div><ul class="insight-results">${preview.rows.map((row,i)=>`<li><button type="button" data-ingredient="${i}"><strong>${e(row.name)}</strong><small>${e(fmt(row.quantity))} ${e(row.unit==='portion'?row.portions.find(p=>p.id===row.portionId)?.label??'portion':row.unit)}</small><span aria-hidden="true">›</span></button></li>`).join('')}</ul><div class="insight-section nutrition-preview"><strong>${e(macros(preview.meal.totals))}</strong></div>${select('group','Group',options.groups.map(g=>[g,g]),draft.group)}${rowInput('time','Time',draft.time,'time')}<p class="sheet-message" role="status"></p><footer class="entry-actions"><button type="button" data-back>Back</button><button type="submit" class="primary">Add to Diary</button></footer></form>`;
  const form=root.querySelector('form');root.querySelector('[data-back]').onclick=suggestionResults;
  const retain=()=>{draft.group=form.elements.group.value;draft.time=form.elements.time.value;};
  root.querySelector('[data-add]').onclick=()=>{retain();pickIngredient(item,draft);};
  root.querySelector('[data-preference]').onclick=()=>{retain();preferenceItem(item,()=>mealDetail(item,draft));};
  root.onclick=event=>{const b=event.target.closest('[data-ingredient]');if(!b)return;draft.group=form.elements.group.value;draft.time=form.elements.time.value;ingredient(item,draft,Number(b.dataset.ingredient),preview.rows[Number(b.dataset.ingredient)]);};
  form.onsubmit=async event=>{event.preventDefault();await run(form,async()=>{await onAddMeal({name:item.name,date:day,rows:draft.rows,group:form.elements.group.value,time:form.elements.time.value,revision:options.revision});if(form.isConnected)close();});};
 }
 function ingredient(item,draft,index,row){
  const choices=[['servings',row.serving??'Serving'],...(row.servingGrams>0?[['g','Grams']]:[]),...(row.servingMilliliters>0?[['mL','Milliliters']]:[]),...row.portions.map(p=>['portion:'+p.id,p.label])];
  const original=draft.rows[index],value=original.unit==='servings'?{amount:original.quantity}:original;
  if(!['servings','portion'].includes(original.unit)&&!choices.some(([id])=>id===original.unit))choices.push([original.unit,original.unit]);
  const root=screen(row.name,`<form>${quantityFields(choices,value)}<div class="section-actions"><button type="button" data-replace>Replace</button><button type="button" data-remove>Remove</button></div><footer class="entry-actions"><button type="button" data-back>Back</button><button type="submit" class="primary">Done</button></footer></form>`),form=root.querySelector('form');
  root.querySelector('[data-remove]').onclick=()=>{draft.rows.splice(index,1);mealDetail(item,draft);};root.querySelector('[data-replace]').onclick=()=>pickIngredient(item,draft,index);
  form.elements.amount.min='0.000001';root.querySelector('[data-back]').onclick=()=>mealDetail(item,draft);
  form.onsubmit=event=>{event.preventDefault();const next=quantityValue(form);draft.rows[index]={ref:original.ref,...(next.amount!==undefined?{quantity:next.amount,unit:'servings'}:next)};mealDetail(item,draft);};
 }
 function pickIngredient(item,draft,index){
  const root=screen(index===undefined?'Add Ingredient':'Replace Ingredient','<div class="insight-food-picker"></div><button type="button" class="more-results" data-back>Back</button>');
  const picker=root.querySelector('.insight-food-picker');let cleanup;
  root.querySelector('[data-back]').onclick=()=>{cleanup?.();mealDetail(item,draft);};
  cleanup=mountFoodPicker(picker,{onPick:async(kind,id)=>{
   const catalog=picker.querySelector('[data-source="catalog"][aria-pressed="true"]');const selection={kind:catalog?'catalog':kind+'s',id},status=picker.querySelector('[role=status]');
   picker.querySelectorAll('button').forEach(b=>b.disabled=true);status.textContent='Loading…';
   try{const resolved=await request('/api/food-insights/resolve',{date:day,selection});if(!root.isConnected)return;
    if(draft.rows.length-(index===undefined?0:1)+resolved.rows.length>30)throw Error('Use up to 30 ingredients.');
    const next=cleanRows(resolved.rows);if(index===undefined)draft.rows.push(...next);else draft.rows.splice(index,1,...next);cleanup();mealDetail(item,draft);
   }catch(error){if(root.isConnected){status.textContent=error.message;picker.querySelectorAll('button').forEach(b=>b.disabled=false);}}
  }});
 }
 function preferences(){
  const resources=[...options.suggestions.templates,...options.suggestions.custom];
  const root=screen('Suggestion Preferences',`<ul class="insight-results">${resources.map((item,i)=>`<li><button type="button" data-preference-item="${i}"><strong>${e(item.name)}</strong><small>${item.ref.kind==='template'?'Recipe idea':item.tagStatus==='reviewed'?'Tags reviewed':item.tagStatus==='changed-since-review'?'Review changed tags':'Tags not set'}${options.suggestions.excluded.some(r=>sameRef(r,item.ref))?' · Hidden':options.suggestions.lessOften.some(r=>sameRef(r,item.ref))?' · Show less':''}</small><span aria-hidden="true">›</span></button></li>`).join('')}</ul><button type="button" class="more-results" data-back>Back</button>`);
  root.querySelector('[data-back]').onclick=suggestionForm;root.onclick=event=>{const b=event.target.closest('[data-preference-item]');if(b)preferenceItem(resources[Number(b.dataset.preferenceItem)],preferences);};
 }
 function preferenceItem(item,back){
  const current=options.suggestions.custom.find(r=>sameRef(r.ref,item.ref))??item;
  const root=screen(item.name,`<form>${check('lessOften','Show less often',options.suggestions.lessOften.some(r=>sameRef(r,item.ref)))}${check('excluded','Hide suggestion',options.suggestions.excluded.some(r=>sameRef(r,item.ref)))}${item.ref.kind!=='template'?'<button type="button" class="more-results" data-tags>Edit diet & ingredient tags</button>':''}<p class="sheet-message" role="status"></p><footer class="entry-actions"><button type="button" data-back>Back</button><button type="submit" class="primary">Save</button></footer></form>`),form=root.querySelector('form');
  root.querySelector('[data-back]').onclick=back;root.querySelector('[data-tags]')?.addEventListener('click',()=>editTags(current,()=>preferenceItem(current,back)));
  form.onsubmit=async event=>{event.preventDefault();await run(form,async()=>{
   for(const [key,action] of [['lessOften','feedback'],['excluded','exclude']])if(form.elements[key].checked!==options.suggestions[key].some(r=>sameRef(r,item.ref))){await preferenceSave({action,ref:item.ref,[key]:form.elements[key].checked});if(!form.isConnected)return;}
   back();
  });};
 }
 async function preferenceSave(payload){await command(options.revision,'foodSuggestion.preference',payload);options=await request('/api/food-insights/options');}
 function editTags(item,back){
  const tags=structuredClone(item.tags??{diets:[],categories:[],exclusions:[]});
  const root=screen('Food Tags',`<form><p class="insight-caption">${e(item.name)}</p>${chips('diets',options.suggestions.diets,tags.diets)}${chips('categories',options.suggestions.categories,tags.categories)}${chips('exclusions',options.suggestions.exclusions,tags.exclusions).replace('Common exclusions','Contains')}<p class="sheet-message" role="status"></p><footer class="entry-actions"><button type="button" data-back>Back</button><button type="submit" class="primary">Save Tags</button></footer></form>`),form=root.querySelector('form');
  root.onclick=event=>{const b=event.target.closest('[data-filter]');if(!b)return;const key=b.dataset.filter,id=b.dataset.value;tags[key]=tags[key].includes(id)?tags[key].filter(x=>x!==id):[...tags[key],id];b.setAttribute('aria-pressed',String(tags[key].includes(id)));};
  root.querySelector('[data-back]').onclick=back;form.onsubmit=async event=>{event.preventDefault();await run(form,async()=>{await preferenceSave({action:'tags',ref:item.ref,revision:item.revision,tags});if(form.isConnected)back();});};
 }
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
 async function run(form,action){const status=form.querySelector('[role=status]');status.textContent='';form.querySelectorAll('button').forEach(b=>b.disabled=true);try{await action();}catch(error){if(form.isConnected){status.textContent=error.message;if(error.status===409){const reload=document.createElement('button');reload.type='button';reload.textContent='Reload latest';reload.onclick=()=>run(form,async()=>{options=await request('/api/food-insights/options');if(form.isConnected)suggestionForm();});status.append(reload);}}}finally{form.querySelectorAll('button').forEach(b=>b.disabled=false);}}
}
