import {escape as e} from './html.js';

/** One transient destination sheet. The Photo Log owns its lifetime and save. */
export function openPhotoCreate({onSave,onClose=()=>{}}){
 const dialog=document.createElement('dialog');dialog.className='photo-create-sheet';dialog.setAttribute('aria-label','Create');
 dialog.innerHTML='<form><header><h3>Create</h3><button type="button" data-cancel aria-label="Close Create">×</button></header><label class="field-row"><span>Save to</span><select name="kind" aria-label="Save to"><option value="meal">Meal</option><option value="recipe">Recipe</option></select></label><div data-fields></div><p role="status" class="sheet-message"></p><footer class="entry-actions"><button type="button" data-cancel>Cancel</button><button type="submit" class="primary"></button></footer></form>';
 document.body.append(dialog);const form=dialog.querySelector('form'),status=form.querySelector('[role=status]');let busy=false,disposed=false,name='',servings=1;
 const close=()=>{if(disposed)return;disposed=true;dialog.close();dialog.remove();onClose();};
 function render(){const recipe=form.elements.kind.value==='recipe';form.querySelector('[data-fields]').innerHTML=`<label class="field-row"><span>${recipe?'Recipe':'Meal'} name</span><input name="name" aria-label="${recipe?'Recipe':'Meal'} name" value="${e(name)}" required maxlength="300"></label>${recipe?`<label class="field-row"><span>Servings</span><input name="servings" aria-label="Servings" value="${e(servings)}" type="number" min="0.001" max="100000" step="any" required></label>`:''}`;form.querySelector('[type=submit]').textContent=recipe?'Create Recipe':'Create Meal';}
 form.elements.kind.onchange=()=>{name=form.elements.name.value;if(form.elements.servings)servings=form.elements.servings.value;render();status.textContent='';};
 form.querySelectorAll('[data-cancel]').forEach(button=>button.onclick=()=>{if(!busy)close();});
 dialog.addEventListener('cancel',event=>{event.preventDefault();event.stopPropagation();if(!busy)close();});
 dialog.addEventListener('click',event=>{if(event.target!==dialog||busy)return;const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)close();});
 form.onsubmit=async event=>{event.preventDefault();if(busy||!form.reportValidity())return;const kind=form.elements.kind.value,destination={kind,name:form.elements.name.value.trim(),...(kind==='recipe'?{servings:Number(form.elements.servings.value)}:{})};if(!destination.name){status.textContent='Enter a name.';return;}busy=true;status.textContent='';form.querySelectorAll('button,input,select').forEach(el=>el.disabled=true);try{await onSave(destination);close();}catch(error){if(!disposed)status.textContent=error.message;}finally{busy=false;if(!disposed)form.querySelectorAll('button,input,select').forEach(el=>el.disabled=false);}};
 render();dialog.showModal();form.elements.name.focus();return close;
}
