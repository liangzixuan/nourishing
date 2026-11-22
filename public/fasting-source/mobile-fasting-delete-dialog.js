import {formatMessage} from '../report-source/public/message-format.js';
import {escape as e} from './ui.js';

// The list and record editor share presentation and dismissal. Each caller owns
// its preview, fingerprint and write lifecycle.
export class MobileFastingDeleteDialog{
 constructor({language='en',count=1,onConfirm,onCancel}){
  Object.assign(this,{onConfirm,onCancel});const t=(key,values)=>formatMessage(language,'fastingHistory.'+key,values);
  const dialog=this.element=document.createElement('dialog');dialog.className='dc-fast-delete-dialog';dialog.dataset.fastDeleteConfirm='';dialog.setAttribute('aria-label',t(count===1?'deleteHeading':'deleteFasts'));
  dialog.innerHTML=`<h2>${e(t(count===1?'deleteHeading':'deleteFasts'))}</h2><p>${e(t(count===1?'deleteQuestion':'deleteQuestionMany',{count}))}</p><div><button type="button" class="dc-button" data-fast-delete="cancel">${e(t('cancel'))}</button><button type="button" class="dc-button" data-fast-delete="confirm">${e(t('delete'))}</button></div>`;
  dialog.addEventListener('cancel',event=>{event.preventDefault();this.cancel();});dialog.addEventListener('click',event=>{const action=event.target.closest('[data-fast-delete]')?.dataset.fastDelete;if(action==='cancel')this.cancel();if(action==='confirm'&&!this.pending)void this.onConfirm();if(event.target===dialog){const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)this.cancel();}});
  document.body.append(dialog);dialog.showModal();
 }
 setPending(value){this.pending=value;this.element.querySelectorAll('button').forEach(button=>button.disabled=value);}
 cancel(){if(!this.pending)this.onCancel();}
 close(){this.element.close();this.element.remove();}
}
