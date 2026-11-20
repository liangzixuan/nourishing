import {t} from './app-language.js';
import {fc} from './food-cloud-messages.js';
import {escape as e} from './html.js';

/** One transient destination sheet. The Photo Log owns its lifetime and save. */
export function openPhotoCreate({kind,onSave,onClose=()=>{}}){
 const dialog=document.createElement('dialog');dialog.className='photo-create-sheet';dialog.setAttribute('aria-label',fc("create"));
 dialog.innerHTML=`<form><header><h3>${e(fc("create"))}</h3><button type="button" data-cancel aria-label="${e(fc("closeCreate"))}">×</button></header><div data-fields></div><p role="status" class="sheet-message"></p><footer class="entry-actions"><button type="button" data-cancel>${e(t("common.cancel"))}</button><button type="submit" class="primary"></button></footer></form>`;
 document.body.append(dialog);const form=dialog.querySelector('form'),status=form.querySelector('[role=status]');let busy=false,disposed=false;const name='',servings=1;
 const close=()=>{if(disposed)return;disposed=true;dialog.close();dialog.remove();onClose();};
 function render(){const recipe=kind==='recipe';form.querySelector('[data-fields]').innerHTML=`<label class="field-row"><span>${e(fc(recipe?'recipeName':'mealName'))}</span><input name="name" aria-label="${e(fc(recipe?'recipeName':'mealName'))}" value="${e(name)}" required maxlength="300"></label>${recipe?`<label class="field-row"><span>${e(t("multiAdd.servings"))}</span><input name="servings" aria-label="${e(t("multiAdd.servings"))}" value="${e(servings)}" type="number" min="0.001" max="100000" step="any" required></label>`:''}`;form.querySelector('[type=submit]').textContent=recipe?t("mobileFoods.create.recipe"):t("mobileFoods.create.meal");}
 form.querySelectorAll('[data-cancel]').forEach(button=>button.onclick=()=>{if(!busy)close();});
 dialog.addEventListener('cancel',event=>{event.preventDefault();event.stopPropagation();if(!busy)close();});
 dialog.addEventListener('click',event=>{if(event.target!==dialog||busy)return;const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)close();});
 form.onsubmit=async event=>{event.preventDefault();if(busy||!form.reportValidity())return;const destination={kind,name:form.elements.name.value.trim(),...(kind==='recipe'?{servings:Number(form.elements.servings.value)}:{})};if(!destination.name){status.textContent=fc("enterName");return;}busy=true;status.textContent='';form.querySelectorAll('button,input,select').forEach(el=>el.disabled=true);try{await onSave(destination);close();}catch(error){if(!disposed)status.textContent=error.message;}finally{busy=false;if(!disposed)form.querySelectorAll('button,input,select').forEach(el=>el.disabled=false);}};
 render();dialog.showModal();form.elements.name.focus();return close;
}
