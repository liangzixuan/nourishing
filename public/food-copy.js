import {guardSheetExit} from './edge-navigation.js';
import {uiLanguage,t} from './app-language.js';
import {fc} from './food-cloud-messages.js';
import {request,command} from './diary-api.js';
import {escape as e} from './html.js';
import {foodEditorFields,readFoodEditorFields} from './food-editor-fields.js';
/** An unsaved custom copy. Source metadata never comes from the form. */
export function mountFoodCopy({selection,show,content,onCancel,onSaved}){
 const events=new AbortController(),signal=events.signal;let disposed=false,busy=false;
 const heading=`<header class="sheet-header"><button type="button" class="icon-button" data-copy-cancel aria-label="${e(t("mobileFoodEditor.back"))}">×</button><h2>${e(t("mobileFood.copy"))}</h2></header>`;
 show(heading+`<p class="empty" role="status">${e(t("mobileNutrientDetail.loading"))}</p>`);const sheet=content.closest('dialog'),loading=content.querySelector('.empty');
 const alive=()=>!disposed&&content.isConnected;
 guardSheetExit(content,()=>busy,signal);
 function cancel(event){event?.preventDefault();event?.stopImmediatePropagation();if(!busy)onCancel();}
 content.addEventListener('click',event=>{if(event.target.closest('[data-copy-cancel]'))cancel(event);},{signal});
 sheet.addEventListener('cancel',cancel,{capture:true,signal});
 sheet.addEventListener('click',event=>{if(event.target!==sheet)return;const r=sheet.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)cancel(event);},{capture:true,signal});
 request('/api/library/food-copy?'+new URLSearchParams(selection),null,signal).then(view=>{
  if(!alive()||!loading.isConnected)return;const draft=view.draft;
  content.innerHTML=heading+`<form class="entry-form library-editor food-copy-editor"><label class="field-row"><span>${e(t("settings.name"))}</span><input name="name" value="${e(draft.name)}" maxlength="500" required></label>${foodEditorFields(draft,view.nutrients)}<p class="sheet-message" role="status"></p><footer class="entry-actions"><button type="button" data-copy-cancel>${e(t("common.cancel"))}</button><button type="submit" class="primary">${e(t("mobileFoodEditor.save"))}</button></footer></form>`;
  const form=content.querySelector('form'),status=form.querySelector('[role=status]');
  form.onsubmit=async event=>{event.preventDefault();if(busy||!form.reportValidity())return;busy=true;status.textContent='';const changes=readFoodEditorFields(form,view.nutrients,draft);content.querySelectorAll('button,input,textarea').forEach(el=>el.disabled=true);
   try{const result=await command(view.revision,'food.copy',{selection:view.selection,sourceFingerprint:view.sourceFingerprint,changes});if(alive())await onSaved(result);}
   catch(error){if(alive()&&form.isConnected)status.textContent=error.message;}
   finally{busy=false;if(alive()&&form.isConnected)content.querySelectorAll('button,input,textarea').forEach(el=>el.disabled=false);}
  };
 }).catch(error=>{if(alive()&&loading.isConnected&&error.name!=='AbortError')loading.textContent=error.message;});
 return ()=>{disposed=true;events.abort();};
}
