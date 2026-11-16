import {escape as esc} from '../html.js';

/** Owns a library review layer, without replacing or reconstructing its editor. */
export class LibraryReviewDialog {
 constructor({title,closeLabel,loading,onClose,mobile=false}) {
  this.origin=document.activeElement;
  this.onClose=onClose;
  this.controller=new AbortController();
  this.operationId=crypto.randomUUID();
  this.closed=false;
  const root=document.createElement('dialog');
  this.root=root;
  root.className='library-review-dialog'+(mobile?' library-review-mobile':'');
  root.setAttribute('aria-label',title);
  root.innerHTML=`<div class="dialog-head"><h2>${esc(title)}</h2><button type="button" data-library-review-close aria-label="${esc(closeLabel)}">×</button></div><div class="dialog-body"><div data-library-review-error role="alert" hidden></div><div data-library-review-content><p>${esc(loading)}</p></div></div>`;
  root.addEventListener('cancel',event=>{event.preventDefault();this.close();});
  root.addEventListener('close',()=>this.close());
  root.addEventListener('click',event=>{
   if(event.target.closest('[data-library-review-close],[data-action=close-dialog]')) {
    event.preventDefault();event.stopPropagation();this.close();return;
   }
   if(event.target===root){
    const rect=root.getBoundingClientRect();
    if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)this.close();
   }
  });
  document.body.append(root);root.showModal();
 }
 show(html,review){
  if(this.closed)return;
  this.review=review;
  this.root.querySelector('[data-library-review-content]').innerHTML=html;
  this.root.classList.add('library-review-ready');
  (this.root.querySelector('[data-action=close-dialog]')||this.root.querySelector('[data-library-review-close]'))?.focus();
 }
 error(error){
  if(this.closed)return;
  const target=this.root.querySelector('[data-library-review-error]');
  target.hidden=false;target.className='dialog-error';target.textContent=error.message||String(error);
 }
 close(restoreFocus=true){
  if(this.closed)return;
  this.closed=true;this.controller.abort();
  if(this.root.open)this.root.close();
  this.root.remove();
  if(restoreFocus&&this.origin?.isConnected)this.origin.focus();
  this.onClose?.();
 }
}
