import {escape as e} from './ui.js';
import {formatMessage} from '../report-source/public/message-format.js';
import {FoodNutritionView} from '../food-entry-source/food-nutrition-view.js';
import {quantityFields,readQuantityFields,resetQuantityUnit} from './quantity-fields.js';

/** Owns an unsaved quantity, its nutrition preview, and explicit draft application. */
export class MobileIngredientDetail{
 constructor({root,resource,kind,source,context={},language,unit,catalog,sourceLabel,applyLabel,preview,normalize=value=>value,onApply,positiveOnly=false}){
  Object.assign(this,{root,language,preview,normalize,onApply,positiveOnly});this.abort=new AbortController();this.generation=0;this.ready=false;this.open=new Map();
  this.message=key=>formatMessage(language,'mobileFood.'+key);
  root.innerHTML=`<form class="mci-detail"><header class="mf-header"><button type="button" data-mci-back aria-label="${e(this.message('close'))}">×</button><h2>${e(resource.name)}</h2></header><section class="mf-controls">${quantityFields(kind,resource,source,{prefix:'ingredient-',unitId:'mci-unit',context,language})}</section><div class="mf-source"><div data-mci-count></div><div>${e(this.message('dataSource'))}: ${e(sourceLabel)}</div><strong data-mci-basis></strong></div><p data-mci-error role="alert" hidden></p><div class="mf-preview" data-mci-nutrition></div><footer class="mf-footer"><button type="submit" data-mci-apply disabled>${e(applyLabel)}</button></footer></form>`;
  root.querySelector('.quantity-details')?.remove();
  for(const [index,label] of [...root.querySelectorAll('[data-quantity-fields]>label')].entries()){const field=label.querySelector('input,select');label.replaceChildren();const caption=document.createElement('span');caption.textContent=this.message(index===0?'amount':'serving');label.append(caption,field);}
  this.form=root.querySelector('form');this.button=root.querySelector('[data-mci-apply]');this.target=root.querySelector('[data-mci-nutrition]');
  this.view=new FoodNutritionView({target:this.target,language,unit,catalog});
  const signal=this.abort.signal;
  this.form.addEventListener('input',event=>{if(event.target.matches('[data-quantity-value]')){event.stopPropagation();void this.refresh();}},{signal});
  this.form.addEventListener('change',event=>{if(event.target.matches('[data-quantity-unit]')){event.stopPropagation();resetQuantityUnit(event.target);void this.refresh();}},{signal});
  root.addEventListener('click',event=>{if(event.target.closest('[data-mci-retry]'))void this.refresh();},{signal});
  this.form.addEventListener('submit',event=>{event.preventDefault();event.stopPropagation();this.apply();},{signal});
  this.target.addEventListener('toggle',event=>{if(event.target.dataset.mfSection)this.open.set(event.target.dataset.mfSection,event.target.open);},{capture:true,signal});
  this.footerSize=new ResizeObserver(()=>{this.form.style.paddingBottom=root.querySelector('.mf-footer').getBoundingClientRect().height+20+'px';});this.footerSize.observe(root.querySelector('.mf-footer'));
  root.scrollTop=0;void this.refresh();
 }
 read(){
  const field=this.root.querySelector('[data-quantity-value]');
  if(!field.value.trim()||!field.checkValidity()||(this.positiveOnly&&Number(field.value)<=0))throw Error(this.message('enterAmount'));
  return this.normalize(readQuantityFields(this.root,{prefix:'ingredient-',language:this.language}));
 }
 async refresh(){
  if(this.abort.signal.aborted)return;
  this.pending?.abort();const controller=new AbortController();this.pending=controller;const generation=++this.generation;
  this.ready=false;this.reviewed=null;this.reviewedResult=null;this.button.disabled=true;this.view.clear();this.target.replaceChildren();this.root.querySelector('[data-mci-count]').textContent='';this.root.querySelector('[data-mci-basis]').textContent='';this.target.setAttribute('aria-busy','true');this.root.querySelector('[data-mci-error]').hidden=true;
  try{
   const quantity=this.read(),result=await this.preview(quantity,controller.signal);
   if(!this.current(generation))return;
   if(!result?.nutrition?.totals)throw Error(this.message('unavailable'));
   const count=Object.values(result.nutrition.totals).filter(Number.isFinite).length,field=this.root.querySelector('[data-quantity-value]'),serving=this.root.querySelector('[data-quantity-unit]')?.selectedOptions[0]?.textContent||this.message('servings');
   this.root.querySelector('[data-mci-count]').textContent=formatMessage(this.language,'mobileFood.count',{count});
   this.root.querySelector('[data-mci-basis]').textContent=formatMessage(this.language,'mobileFood.per',{amount:new Intl.NumberFormat(this.language,{maximumFractionDigits:3}).format(Number(field.value)),serving})+(Number.isFinite(result.row?.grams)?' · '+new Intl.NumberFormat(this.language,{maximumFractionDigits:2}).format(result.row.grams)+' g':'');
   await this.view.render(result.nutrition,{open:this.open,isCurrent:()=>this.current(generation),showHighlights:true});
   if(this.current(generation)){this.reviewed=structuredClone(quantity);this.reviewedResult=result;this.ready=true;this.button.disabled=false;}
  }catch(error){if(this.current(generation))this.error(error);}
  finally{if(this.current(generation))this.target.removeAttribute('aria-busy');}
 }
 current(generation){return !this.abort.signal.aborted&&generation===this.generation;}
 error(error){const target=this.root.querySelector('[data-mci-error]');target.hidden=false;target.textContent=error.message+' ';const retry=document.createElement('button');retry.type='button';retry.dataset.mciRetry='';retry.textContent=this.message('retry');target.append(retry);}
 apply(){
  if(!this.ready||this.abort.signal.aborted)return;
  try{if(JSON.stringify(this.read())!==JSON.stringify(this.reviewed)){void this.refresh();return;}this.onApply(structuredClone(this.reviewed),this.reviewedResult);}
  catch(error){this.error(error);}
 }
 dispose(){this.abort.abort();++this.generation;this.pending?.abort();this.footerSize.disconnect();this.view.dispose();}
}
