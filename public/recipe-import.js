import {request} from './diary-api.js';
import {escape as e} from './html.js';
import {quantityFields,quantityValue} from './quantity.js';
import {mountFoodPicker} from './food-picker.js';
const fmt=value=>Number.isFinite(value)?Number(value.toFixed(1)).toLocaleString():'—';
const input=(name,label,value,type='text',extra='')=>`<label class="field-row"><span>${e(label)}</span><input name="${name}" aria-label="${e(label)}" type="${type}" value="${e(value??'')}" ${extra}></label>`;
const check=(name,label,checked)=>`<label class="field-row"><span>${label}</span><input name="${name}" type="checkbox" ${checked?'checked':''}></label>`;
const statusLabel={unmatched:'Choose food','quantity-needed':'Set amount','needs-review':'Check match',excluded:'Excluded'};

export function openRecipeImport({show,close,header,content,onSave}){
 let view,url='';
 function screen(title,body){show(`${header(title)}<section class="recipe-import">${body}</section>`);return content.querySelector('.recipe-import');}
 function start(){
  const root=screen('Import Recipe',`<form>${input('url','Recipe link',url,'url','required placeholder="https://…"')}<p class="sheet-message" role="status"></p><footer class="entry-actions"><button type="submit" class="primary">Import</button></footer></form>`),form=root.querySelector('form');
  form.onsubmit=event=>{event.preventDefault();url=form.elements.url.value;run(form,async()=>{const next=await request('/api/recipe-import',{url});if(form.isConnected){view=next;review();}});};
 }
 function readMain(form){view.draft.name=form.elements.name.value;view.draft.servings=Number(form.elements.servings.value);view.draft.instructions=form.elements.instructions.value;if(form.elements.yieldConfirmed)view.draft.yieldConfirmed=form.elements.yieldConfirmed.checked;if(form.elements.sourceConfirmed)view.draft.sourceConfirmed=form.elements.sourceConfirmed.checked;if(form.elements.matchesConfirmed?.checked)for(const row of view.draft.rows)row.confirmed=true;}
 async function refresh(origin){const next=await request('/api/recipe-import/preview',view.draft);if(origin.isConnected){view=next;review();}}
 function review(){
  const {draft,review:result}=view,n=result.preview?.perServing,needsMatch=result.rows.some(row=>row.status==='needs-review');
  const root=screen('Review Recipe',`<form>${input('name','Name',draft.name,'text','required maxlength="300"')}${input('servings','Servings',draft.servings,'number','required min="0.001" max="100000" step="any"')}${result.yieldReview.requiresConfirmation?check('yieldConfirmed','Servings checked',draft.yieldConfirmed):''}${result.sourceNeedsConfirmation?check('sourceConfirmed','Ingredient list checked',draft.sourceConfirmed):''}<ul class="recipe-import-list">${result.rows.map((row,i)=>row.status==='header'?`<li class="recipe-group">${e(row.original)}</li>`:`<li><button type="button" data-row="${i}"><strong>${e(row.food?.name??row.original)}</strong><small>${e(row.original)}</small><span>${e(statusLabel[row.status]??(row.conversion?.grams?fmt(row.conversion.grams)+' g':'✓'))}</span></button></li>`).join('')}</ul>${needsMatch?check('matchesConfirmed','Matches checked',false):''}${n?`<div class="nutrition-preview"><strong>${fmt(n.calories)} kcal / serving</strong><p>${fmt(n.protein)} g Protein · ${fmt(n.carbs)} g Carbs · ${fmt(n.fat)} g Fat</p></div>`:''}<details><summary>Instructions</summary><textarea name="instructions" aria-label="Instructions">${e(draft.instructions)}</textarea></details><p class="sheet-message" role="status"></p><footer class="entry-actions"><button type="button" data-back>Back</button><button type="submit" class="primary">Save Recipe</button></footer></form>`),form=root.querySelector('form');
  root.querySelector('[data-back]').onclick=start;
  root.querySelector('ul').onclick=event=>{const b=event.target.closest('[data-row]');if(b){readMain(form);ingredient(Number(b.dataset.row));}};
  form.elements.servings.onchange=()=>{readMain(form);run(form,()=>refresh(form));};
  for(const name of ['yieldConfirmed','sourceConfirmed','matchesConfirmed'])if(form.elements[name])form.elements[name].onchange=()=>{readMain(form);run(form,()=>refresh(form));};
  form.onsubmit=event=>{event.preventDefault();readMain(form);run(form,async()=>{await onSave({draft:view.draft,revision:view.revision});if(form.isConnected)close();});};
 }
 function ingredient(index){
  const row=view.review.rows[index],draft=view.draft.rows[index],food=row.food;
  if(row.status==='excluded'){
   const root=screen('Ingredient',`<p class="recipe-line">${e(row.original)}</p><form><button type="button" class="more-results" data-include>Include ingredient</button><p role="status" class="sheet-message"></p><button type="button" class="more-results" data-back>Back</button></form>`),form=root.querySelector('form');root.querySelector('[data-back]').onclick=review;root.querySelector('[data-include]').onclick=()=>{draft.excluded=false;run(form,()=>refresh(form));};return;
  }
  const source=draft.override?(draft.override.unit==='serving'?{amount:draft.override.quantity}:draft.override):row.conversion?.sourceQuantity??{amount:1};
  const choices=food?[['servings',food.serving??'Serving'],...(food.grams>0?[['g','Grams'],['oz','Ounces']]:[]),...(food.milliliters>0?[['mL','Milliliters'],['L','Liters']]:[]),...food.portions.map(p=>['portion:'+p.id,p.label])]:[];
  const root=screen('Ingredient',`<p class="recipe-line">${e(row.original)}</p><form>${food?`<strong class="recipe-line">${e(food.name)}</strong>${quantityFields(choices,source)}`:''}<div class="section-actions"><button type="button" data-replace>${food?'Replace':'Choose food'}</button><button type="button" data-exclude>Exclude</button></div><p class="sheet-message" role="status"></p><footer class="entry-actions"><button type="button" data-back>Back</button>${food?'<button type="submit" class="primary">Done</button>':''}</footer></form>`),form=root.querySelector('form');
  if(food)form.elements.amount.min='0.000001';root.querySelector('[data-back]').onclick=review;root.querySelector('[data-replace]').onclick=()=>pick(index);
  root.querySelector('[data-exclude]').onclick=()=>{draft.excluded=true;run(form,()=>refresh(form));};
  form.onsubmit=event=>{event.preventDefault();const quantity=quantityValue(form);draft.override=quantity.amount!==undefined?{quantity:quantity.amount,unit:'serving'}:quantity;draft.confirmed=true;run(form,()=>refresh(form));};
 }
 function pick(index){
  const root=screen('Choose Ingredient','<div class="recipe-food-picker"></div><button type="button" class="more-results" data-back>Back</button>'),picker=root.querySelector('.recipe-food-picker');let cleanup;
  root.querySelector('[data-back]').onclick=()=>{cleanup?.();ingredient(index);};
  cleanup=mountFoodPicker(picker,{allowMeals:false,onPick:async(kind,id)=>{
   if(kind!=='food')return;const catalog=picker.querySelector('[data-source="catalog"][aria-pressed="true"]');view.draft.rows[index].selection={kind:catalog?'catalog':'library',id};view.draft.rows[index].override=null;view.draft.rows[index].confirmed=true;
   const status=picker.querySelector('[role=status]');status.textContent='Loading…';picker.querySelectorAll('button').forEach(b=>b.disabled=true);
   try{const next=await request('/api/recipe-import/preview',view.draft);if(root.isConnected){view=next;cleanup();ingredient(index);}}catch(error){if(root.isConnected){status.textContent=error.message;picker.querySelectorAll('button').forEach(b=>b.disabled=false);}}
  }});picker.querySelector('[data-source="recipe"]')?.remove();
 }
 async function run(form,fn){const status=form.querySelector('[role=status]');status.textContent='';form.querySelectorAll('button').forEach(b=>b.disabled=true);try{await fn();}catch(error){if(form.isConnected){status.textContent=error.message;if(error.status===409&&view){const reload=document.createElement('button');reload.type='button';reload.textContent='Reload latest';reload.onclick=()=>run(form,()=>refresh(form));status.append(reload);}}}finally{form.querySelectorAll('button').forEach(b=>b.disabled=false);}}
 start();
}
