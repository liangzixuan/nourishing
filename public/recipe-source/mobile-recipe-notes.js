import {AnchoredMenu} from '../targets-source/anchored-menu.js';
import {symbol} from './ui.js';
import {formatMessage} from '../report-source/public/message-format.js';

/** Keeps the canonical category and notes controls; clipboard text stays literal. */
export class MobileRecipeNotes {
 constructor({root,form,language}){
  Object.assign(this,{root,form,language});this.generation=0;this.abort=new AbortController();this.m=key=>formatMessage(language,'mobileCompositeEditor.'+key);
  this.category=form.elements.namedItem('categoryId');const categoryLabel=this.category.closest('label');this.category.hidden=true;
  const field=document.createElement('div');field.className='mce-category-field';this.categoryButton=document.createElement('button');this.categoryButton.type='button';this.categoryButton.dataset.mrcOpen='';this.categoryButton.className='mce-category';this.categoryButton.setAttribute('aria-haspopup','menu');this.categoryButton.setAttribute('aria-expanded','false');
  const caption=document.createElement('span');caption.textContent=this.m('recipeCategory');this.categoryValue=document.createElement('span');this.categoryValue.className='mrc-value';const chevron=document.createElement('span');chevron.className='mrc-arrow';chevron.innerHTML=symbol('arrow_drop_down');this.categoryButton.append(caption,this.categoryValue,chevron);field.append(this.category,this.categoryButton);categoryLabel.replaceWith(field);
  this.categoryButton.addEventListener('click',()=>this.openCategory(),{signal:this.abort.signal});this.category.addEventListener('change',()=>this.refreshCategory(),{signal:this.abort.signal});this.refreshCategory();
  this.input=form.elements.namedItem('instructions');const label=this.input.closest('label');const wrapper=document.createElement('div');wrapper.className='mce-notes-label';const title=document.createElement('label');title.textContent=this.m('notes');this.input.id='mce-recipe-notes';title.htmlFor=this.input.id;
  this.card=document.createElement('div');this.card.className='mce-notes-card';this.input.placeholder=this.m('notesPlaceholder');this.card.append(this.input);
  this.button=document.createElement('button');this.button.type='button';this.button.dataset.mcePasteNotes='';this.button.textContent=this.m('paste');this.card.append(this.button);
  this.error=document.createElement('p');this.error.dataset.mcePasteError='';this.error.setAttribute('role','alert');this.error.hidden=true;
  wrapper.append(title,this.card,this.error);label.replaceWith(wrapper);
  this.button.addEventListener('click',()=>this.paste(),{signal:this.abort.signal});this.input.addEventListener('input',()=>{this.cancelPaste();this.error.hidden=true;},{signal:this.abort.signal});
 }
 refreshCategory(){this.categoryValue.textContent=this.category.value?this.category.selectedOptions[0]?.textContent??'':'';this.categoryButton.setAttribute('aria-label',this.m('recipeCategory')+(this.categoryValue.textContent?': '+this.categoryValue.textContent:''));}
 openCategory(){
  if(this.menu){this.menu.close();return;}
  const options=[...this.category.options],ordered=[...options.filter(option=>option.value!==''),...options.filter(option=>option.value==='')];this.categoryButton.setAttribute('aria-expanded','true');
  this.menu=new AnchoredMenu({origin:this.categoryButton,anchor:this.categoryButton,label:this.m('recipeCategory'),className:'mrc-menu',items:ordered.map(option=>({id:option.value,label:option.textContent,selected:option.value===this.category.value,disabled:option.disabled})),onClose:()=>{this.menu=null;this.categoryButton.setAttribute('aria-expanded','false');},onChoose:id=>{this.category.value=id;this.category.dispatchEvent(new Event('change',{bubbles:true}));}});
 }
 back(){if(!this.menu)return false;this.menu.close();return true;}
 async paste(){
  const generation=++this.generation,original=this.input.value,start=this.input.selectionStart,end=this.input.selectionEnd;this.button.disabled=true;this.error.hidden=true;
  try{const text=await navigator.clipboard.readText();if(!this.current(generation)||this.input.value!==original)return;this.input.setRangeText(text,start,end,'end');this.input.dispatchEvent(new Event('input',{bubbles:true}));this.input.focus();}
  catch{if(this.current(generation)){this.error.textContent=this.m('pasteManually');this.error.hidden=false;}}
  finally{if(this.current(generation))this.button.disabled=false;}
 }
 current(generation){return !this.abort.signal.aborted&&this.root.isConnected&&generation===this.generation;}
 cancelPaste(){++this.generation;this.button.disabled=false;}
 deactivate(){this.cancelPaste();this.menu?.close(false);}
 dispose(){this.deactivate();this.abort.abort();}
}
