import {AnchoredMenu} from '../targets-source/anchored-menu.js';
import {symbol} from './ui.js';
import {formatMessage} from '../report-source/public/message-format.js';
import {quantityUnit} from '../report-source/server/quantity-units.mjs';

/** Adapts canonical recipe quantities to the captured review preset selector. */
export class MobileRecipeReview {
 constructor({root,facts,language}){
  Object.assign(this,{root,facts,language});this.abort=new AbortController();this.fields=root.querySelector('[data-quantity-fields]');this.select=this.fields.querySelector('[data-quantity-unit]');this.fields.hidden=true;
  this.button=document.createElement('button');this.button.type='button';this.button.dataset.mrvOpen='';this.button.className='mrv-serving';this.button.setAttribute('aria-haspopup','menu');this.button.setAttribute('aria-expanded','false');
  const caption=document.createElement('strong');this.label=formatMessage(language,'mobileFood.serving');caption.textContent=this.label;this.value=document.createElement('span');this.value.className='mrv-value';const arrow=document.createElement('span');arrow.className='mrv-arrow';arrow.innerHTML=symbol('arrow_drop_down');this.button.append(caption,this.value,arrow);root.append(this.button);
  this.button.addEventListener('click',()=>this.open(),{signal:this.abort.signal});this.refresh();
 }
 number(value){return value.toLocaleString(this.language,{maximumFractionDigits:1})}
 optionLabel(option){const unit=quantityUnit(option.value);return unit?this.number(unit.defaultQuantity)+' '+unit.id:option.textContent}
 refresh(){
  const measured=this.facts()?.quantity,quantity={unit:this.select.value};
  const selected=this.select.selectedOptions[0];let label=this.optionLabel(selected);if(measured?.grams!==null&&measured?.grams!==undefined&&quantity.unit!=='g')label+=' — '+this.number(measured.grams)+' g';
  this.value.textContent=label;this.button.setAttribute('aria-label',this.label+': '+label);
 }
 open(){
  if(this.menu){this.menu.close();return}const options=[...this.select.options],order=['batch','servings'];options.sort((a,b)=>(order.includes(a.value)?order.indexOf(a.value):2)-(order.includes(b.value)?order.indexOf(b.value):2));this.button.setAttribute('aria-expanded','true');
  this.menu=new AnchoredMenu({origin:this.button,anchor:this.button,label:this.label,className:'mrv-menu',items:options.map(o=>({id:o.value,label:this.optionLabel(o),selected:o.selected,disabled:o.disabled})),onClose:()=>{this.menu=null;this.button.setAttribute('aria-expanded','false')},onChoose:id=>{this.select.value=id;this.select.dispatchEvent(new Event('change',{bubbles:true}))}});
 }
 back(){if(!this.menu)return false;this.menu.close();return true}
 deactivate(){this.menu?.close(false)}
 dispose(){this.deactivate();this.abort.abort()}
}
