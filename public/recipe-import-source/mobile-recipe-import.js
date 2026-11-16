import {escape as e,symbol} from '../recipe-source/ui.js';
import {formatMessage} from '../report-source/public/message-format.js';
import {RecipeReview,RecipeReviewSession} from '../recipe-import.js';

/** A child of the unsaved recipe editor. All requests prepare or preview drafts. */
export class MobileRecipeImport {
 constructor({language,request,foods,catalog,catalogAvailable,unit,onImported}) {
  Object.assign(this,{language,request,foods,catalog,catalogAvailable,unit,onImported});
  this.values={url:'',ingredients:'',text:''};this.mode='url';this.generation=0;
  this.m=key=>formatMessage(language,'mobileCompositeEditor.'+key);
 }
 open() {
  if(this.root)return;
  this.origin=document.activeElement;this.root=document.createElement('dialog');this.root.className='mri-dialog';this.root.setAttribute('aria-label',this.m('importRecipe'));
  this.root.addEventListener('cancel',event=>{event.preventDefault();event.stopPropagation();this.close();});
  this.root.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();this.close();}});
  this.root.addEventListener('click',event=>{
   if(event.target.closest('[data-mri-close]'))this.close();
   const mode=event.target.closest('[data-mri-mode]');if(mode){this.mode=mode.dataset.mriMode;this.render();}
   if(event.target.closest('[data-mri-paste]'))this.paste();
   if(event.target===this.root){const r=this.root.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)this.close();}
  });
  this.root.addEventListener('input',event=>{if(Object.hasOwn(this.values,event.target.name)){this.values[event.target.name]=event.target.value;this.buttons();}});
  this.root.addEventListener('submit',event=>{event.preventDefault();event.stopPropagation();this.import();});
  this.render();document.body.append(this.root);this.root.showModal();
 }
 render() {
  const field=this.mode,heading=field==='url'?'pasteUrl':field==='ingredients'?'pasteIngredients':'pasteRecipe';
  this.root.innerHTML=`<header class="mri-header"><button type="button" data-mri-close aria-label="${e(formatMessage(this.language,'common.close'))}">${symbol('close')}</button><h2>${e(this.m('importRecipe'))}</h2></header><form class="mri-form"><section><label><strong>${e(this.m(heading))}</strong>${field==='url'?`<input name="url" type="url" required placeholder="${e(this.m('enterUrl'))}" value="${e(this.values.url)}">`:`<textarea name="${field}" rows="8" required>${e(this.values[field])}</textarea>`}</label><button type="button" data-mri-paste>${e(this.m(heading))}</button></section><section class="mri-alternative">${field==='url'?`<h3>${e(this.m('pasteIngredients'))}</h3><button type="button" data-mri-mode="ingredients">${e(this.m('enterIngredients'))}</button><details><summary>${e(this.m('pasteRecipe'))}</summary><button type="button" data-mri-mode="text">${e(this.m('enterRecipe'))}</button></details>`:`<button type="button" data-mri-mode="url">${e(this.m('pasteUrl'))}</button>`}</section><p data-mri-error role="alert" hidden></p><footer><button type="submit" data-mri-submit>${e(this.m('import'))}</button></footer></form>`;
  this.buttons();
 }
 buttons(){const form=this.root?.querySelector('.mri-form');if(form)form.inert=Boolean(this.busy);const button=this.root?.querySelector('[data-mri-submit]');if(button){button.disabled=this.busy||!this.values[this.mode].trim();button.textContent=this.m(this.busy?'importing':'import');}}
 async paste(){const generation=this.generation,field=this.mode;try{const value=await navigator.clipboard.readText();if(!this.root||generation!==this.generation||field!==this.mode)return;this.values[field]=value;this.root.querySelector(`[name=${field}]`).value=value;this.buttons();}catch{this.error(this.m('pasteManually'));}}
 error(message){const target=this.root?.querySelector('[data-mri-error]');if(target){target.textContent=message;target.hidden=false;}}
 current(generation){return Boolean(this.root)&&generation===this.generation;}
 async import(){
  if(this.busy||!this.values[this.mode].trim())return;
  const form=this.root.querySelector('form');if(!form.reportValidity())return;
  const generation=++this.generation,controller=new AbortController();this.pending=controller;this.busy=true;this.buttons();
  try{
   const draft=await this.request('/api/recipe-import',{method:'POST',body:JSON.stringify({[this.mode]:this.values[this.mode]}),signal:controller.signal});
   if(!this.current(generation))return;
   if(draft.review.canSave){
    this.preparation=new RecipeReviewSession({draft,request:this.request});
    const result=await this.preparation.prepareDraft();
    if(!this.current(generation))return;
    if(result){this.apply(result);return;}
    this.error(this.preparation.error);this.preparation.dispose();this.preparation=null;
   }else{
    this.root.querySelector('.mri-form').remove();const root=document.createElement('div');root.className='recipe-review mri-review';this.root.append(root);
    this.review=new RecipeReview({root,draft,request:this.request,nutrientCatalog:this.catalog,foods:this.foods,catalogAvailable:this.catalogAvailable,energyUnit:this.unit,language:this.language,onPrepared:result=>{if(this.current(generation))this.apply(result);}});
   }
  }catch(error){if(this.current(generation)&&error.name!=='AbortError')this.error(error.message);}
  finally{if(this.current(generation)){this.busy=false;this.pending=null;this.buttons();}}
 }
 apply(result){this.close(false);this.onImported(result);}
 back(){if(!this.root)return false;this.close();return true;}
 close(restoreFocus=true){++this.generation;this.pending?.abort();this.preparation?.dispose();this.preparation=null;this.review?.dispose();this.review=null;this.busy=false;this.root?.close();this.root?.remove();this.root=null;if(restoreFocus&&this.origin?.isConnected)this.origin.focus();}
 dispose(){this.close(false);}
}
