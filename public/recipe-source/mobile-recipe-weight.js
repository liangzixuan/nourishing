import {escape as e,symbol} from './ui.js';
import {formatMessage} from '../report-source/public/message-format.js';
import {parseCookedWeightGrams} from '../report-source/server/recipe-weight.mjs';
import {LibraryReviewDialog} from '../targets-source/library-review-dialog.js';

/** The child owns a pending measurement; only Apply changes the parent form. */
export class MobileRecipeWeight {
 constructor({form,facts,readItems,language}){Object.assign(this,{form,facts,readItems,language});this.input=form.elements.namedItem('cookedWeightGrams');this.m=key=>formatMessage(language,'mobileCompositeEditor.'+key);}
 open(){
  if(this.child)return;
  const ingredients=this.readItems(),facts=this.facts()?.originalWeight??{grams:null};
  const grams=facts.grams??(ingredients.length===0?0:null),number=value=>value.toLocaleString(this.language,{minimumFractionDigits:1,maximumFractionDigits:3});
  this.initial=this.input.value;this.reverting=false;
  this.child=new LibraryReviewDialog({title:this.m('cookedWeight'),closeLabel:formatMessage(this.language,'common.close'),loading:'',mobile:true,onClose:()=>{this.child=null;}});
  const root=this.child.root;root.classList.add('mrw-dialog');
  root.querySelector('[data-library-review-close]').innerHTML=symbol('close');
  this.child.show(`<form class="mrw-form"><p class="mrw-hint">${e(this.m('cookedWeightHint'))}</p><section class="mrw-table"><label><span>${e(this.m('cookedRecipeWeight'))}</span><input type="number" data-mrw-value min="0.000001" max="10000000" step="any" inputmode="decimal" placeholder="0.0" value="${e(this.initial)}" aria-label="${e(this.m('cookedRecipeWeight'))}"><span>g</span></label><div><span>${e(this.m('originalRecipeWeight'))}</span><output data-mrw-original>${grams===null?e(formatMessage(this.language,'quantity.unknown')):e(number(grams))}</output><span>${grams===null?'':'g'}</span></div></section><button type="button" data-mrw-revert>${e(this.m('revertWeight'))}</button><p role="alert" data-mrw-error hidden></p><footer><button type="submit" data-mrw-save>${e(formatMessage(this.language,'common.save'))}</button></footer></form>`);
  root.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();this.close();}});
  root.addEventListener('input',()=>{this.reverting=false;this.buttons();});
  root.querySelector('[data-mrw-revert]').addEventListener('click',()=>{this.reverting=true;this.value.value='';this.value.placeholder=grams===null?'':number(grams);this.buttons();});
  root.querySelector('form').addEventListener('submit',event=>{event.preventDefault();event.stopPropagation();this.apply();});
  this.value=root.querySelector('[data-mrw-value]');this.buttons();
 }
 valid(){if(this.reverting)return true;if(!this.value.value||!this.value.checkValidity())return false;try{parseCookedWeightGrams(Number(this.value.value));return true;}catch{return false;}}
 buttons(){const root=this.child.root;root.querySelector('[data-mrw-save]').disabled=!this.valid()||(this.reverting?this.initial==='':this.value.value===this.initial);root.querySelector('[data-mrw-revert]').disabled=this.initial===''&&this.value.value==='';}
 apply(){if(!this.valid())return;this.input.value=this.reverting?'':this.value.value;for(const type of ['input','change'])this.input.dispatchEvent(new Event(type,{bubbles:true}));this.close();}
 back(){if(!this.child)return false;this.close();return true;}
 close(restoreFocus=true){this.child?.close(restoreFocus);}
 dispose(){this.close(false);}
}
