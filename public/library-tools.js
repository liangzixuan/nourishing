import {uiLanguage,t} from './app-language.js';
import {fc} from './food-cloud-messages.js';
import {request} from './diary-api.js';
import {escape as e} from './html.js';
import {LibraryReviewDialog} from './library-tools-source/library-review-dialog.js';
const counts=()=>({entries:t("integrations.diary"),recipes:t("libraryView.tab.recipes"),meals:t("libraryView.tab.meals"),repeats:t("nav.repeats"),favorites:t("mobileSearch.favorites")});
/** Owns visibility commands independently of the editor draft and child layer. */
export class LibraryRetirement{
 constructor({onChange=async()=>{}}={}){this.onChange=onChange;this.pending=new Map();}
 open({kind,id,onCommitted=()=>{},origin=document.activeElement}){
  this.close();const key=kind+':'+id,session={key,kind,id,onCommitted,origin,review:null,busy:false};this.session=session;
  const dialog=new LibraryReviewDialog({title:t("libraryLifecycle.visibilityTitle"),closeLabel:t("common.close"),loading:t("mobileNutrientDetail.loading"),mobile:true,onClose:()=>{if(this.session===session)this.session=null;}});session.dialog=dialog;dialog.origin=origin;dialog.root.classList.add('library-retirement');
  dialog.root.addEventListener('submit',event=>{event.preventDefault();void this.save(session);});
  dialog.root.addEventListener('click',event=>{if(event.target.closest('[data-retirement-cancel]'))dialog.close();if(event.target.closest('[data-retirement-reload]'))void this.load(session);});
  const pending=this.pending.get(key);if(pending){session.review=pending.review;this.render(session);}else void this.load(session);
  return {back:()=>{if(dialog.closed)return false;dialog.close();return true;},dispose:()=>dialog.close(false)};
 }
 active(session){return !this.disposed&&this.session===session&&!session.dialog.closed;}
 close(){this.session?.dialog.close();}
 dispose(){this.disposed=true;this.close();}
 async load(session){if(session.busy||this.pending.has(session.key))return;session.busy=true;try{const result=await request('/api/library/tools?'+new URLSearchParams({kind:session.kind,id:session.id}),undefined,session.dialog.controller.signal);if(!this.active(session))return;if(!result?.revision||result.review?.kind!==session.kind||result.review?.id!==session.id||!result.review.fingerprint)throw Error(fc("itemReviewUnavailable"));session.review=result;session.conflict=false;this.render(session);}catch(error){if(this.active(session)&&error.name!=='AbortError'){session.dialog.show(`<button type="button" data-retirement-reload>${e(t("mobileSuggest.retry"))}</button>`);session.dialog.error(error);}}finally{session.busy=false;}}
 render(session){
  if(!this.active(session))return;const pending=this.pending.get(session.key),view=session.review.review,retired=pending?.body.payload.retired??!view.retired,label=retired?t("libraryLifecycle.retireShort"):fc("restore");
  session.dialog.root.querySelector('.dialog-head h2').textContent=fc(retired?'retireLibrary':'restoreLibrary');
  session.dialog.show(`<form><h3>${e(view.name)}</h3><p>${retired?fc("hideItemHelp"):fc("showItemHelp")}</p><dl>${Object.entries(counts()).filter(([key])=>view.counts[key]>0).map(([key,name])=>`<dt>${name}</dt><dd>${view.counts[key]}</dd>`).join('')}</dl>${pending?'':`<label data-retirement-confirm><input type="checkbox" name="confirmed" required> ${e(fc(retired?'retireItem':'restoreItem'))}</label>`}<footer><button type="button" data-retirement-cancel>${e(t("common.cancel"))}</button>${session.conflict?`<button type="button" data-retirement-reload>${e(fc("reviewLatest"))}</button>`:`<button type="submit" class="primary" data-retirement-save ${pending?.inFlight?'disabled':''}>${pending?.inFlight?t("mobileNutrientDetail.saving"):pending?.result?fc("refreshLibrary"):pending?t("mobileSuggest.retry"):label}</button>`}</footer></form>`,view);
 }
 async save(session){
  if(session.busy||!this.active(session)||session.conflict||this.pending.get(session.key)?.inFlight)return;let pending=this.pending.get(session.key);
  if(!pending){if(!session.dialog.root.querySelector('[name=confirmed]')?.checked)return;const {revision,review}=session.review;pending={review:session.review,body:{requestId:crypto.randomUUID(),revision,type:'library.retirement',payload:{kind:session.kind,id:session.id,retired:!review.retired,fingerprint:review.fingerprint,confirmed:true}},result:null};this.pending.set(session.key,pending);}
  session.busy=true;pending.inFlight=true;const form=session.dialog.root.querySelector('form');form.inert=true;
  try{
   if(!pending.result){const result=await request('/api/library/command',pending.body);if(result?.ok!==true||typeof result.revision!=='string'||!/^[a-f0-9]{64}$/.test(result.revision))throw Error(fc("changeUnconfirmed"));pending.result=result;}
   if(this.disposed)return;
   session.onCommitted({retired:pending.body.payload.retired,revision:pending.result.revision});await this.onChange();
   this.pending.delete(session.key);if(this.session?.key===session.key)this.session.dialog.close();
  }catch(error){
   if(error.status>=400&&error.status<500&&!pending.result){this.pending.delete(session.key);session.conflict=error.status===409;}
   const current=this.session?.key===session.key?this.session:session;if(this.active(current)){current.conflict=session.conflict;pending.inFlight=false;this.render(current);current.dialog.error(error);}
  }finally{session.busy=false;pending.inFlight=false;if(this.active(session))session.dialog.root.querySelector('form')?.removeAttribute('inert');}
 }
}
