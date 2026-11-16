import {request} from './diary-api.js';
import {escape as e} from './html.js';
import {formatMessage} from './report-source/public/message-format.js';

/** Owns one editor's review and immutable save receipt envelope. */
export class LibraryEditorSave {
 constructor({kind,revision,host,onChange=()=>{}}){Object.assign(this,{kind,revision,host,onChange});this.disposed=false;this.pending=null;this.review=null;this.serial=0;}
 get locked(){return this.pending!==null;}
 clearReview(){if(this.locked)return;this.controller?.abort();++this.serial;this.review=null;this.section?.remove();this.section=null;}
 showReview(){
  const m=(key,values)=>formatMessage('en','foodEditor.'+key,values),view=this.review.view;
  this.section?.remove();const section=document.createElement('section');section.className='library-edit-review';section.dataset.libraryEditReview='';
  section.innerHTML=`<h3>Save changes</h3><p>${Object.entries(view.counts).filter(([,count])=>count>0).map(([key,count])=>e(m(key,{count}))).join(' · ')}</p><label><input type="radio" name="libraryEditMode" value="update"> Update existing uses</label><label><input type="radio" name="libraryEditMode" value="preserve"> Keep past entries unchanged</label><button type="button" data-cancel-library-edit>Keep editing</button>`;
  section.querySelector('[data-cancel-library-edit]').onclick=()=>{this.clearReview();this.onChange();};section.onchange=()=>this.review.mode=section.querySelector('input:checked')?.value;
  this.host().append(section);this.section=section;section.scrollIntoView({block:'nearest'});
 }
 async save(draft){
  if(this.disposed)return null;
  if(!this.pending){
   const snapshot=structuredClone(draft),signature=JSON.stringify(snapshot);let revision=typeof this.revision==='function'?this.revision():this.revision,type=this.kind+'.save',payload=snapshot;
   if(snapshot.id){
    if(this.review?.signature!==signature){
     this.clearReview();const serial=++this.serial;this.controller=new AbortController();const view=await request('/api/library/edit-preview',{kind:this.kind,draft:snapshot},this.controller.signal);
     if(this.disposed||serial!==this.serial)return null;
     if(!view.reviewToken||!view.revision||view.kind!==this.kind||view.id!==snapshot.id)throw Error('Unable to review this edit. Try again.');
     this.review={signature,view,mode:view.hasUses?null:'update'};
     if(view.hasUses){this.showReview();return null;}
    }
    if(!this.review.mode)throw Error(formatMessage('en','foodEditor.chooseMode'));
    revision=this.review.view.revision;type='library.edit';payload={kind:this.kind,draft:snapshot,reviewToken:this.review.view.reviewToken,mode:this.review.mode,confirmed:true};
   }
   this.pending={body:{requestId:crypto.randomUUID(),revision,type,payload},result:null};
   this.section?.querySelectorAll('input,button').forEach(node=>node.disabled=true);this.onChange();
  }
  if(this.pending.result)return this.pending.result;
  try{const result=await request('/api/library/command',this.pending.body);if(!result?.ok||!result.item?.id)throw Error('Unable to confirm the save. Try again.');this.pending.result=result;return result;}
  catch(error){if(error.status>=400&&error.status<500){this.pending=null;this.clearReview();this.onChange();}throw error;}
 }
 dispose(){this.disposed=true;this.controller?.abort();++this.serial;this.section?.remove();}
}
