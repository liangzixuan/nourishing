import {escape as e} from './ui.js';
import {formatMessage} from '../report-source/public/message-format.js';

/** Presents the canonical yield and portion controls without rewriting their identities. */
export class MobileRecipeServings{
 constructor({root,form,editor,facts,readItems,language}){
  Object.assign(this,{root,form,editor,facts,readItems,language});this.abort=new AbortController();this.m=key=>formatMessage(language,'mobileCompositeEditor.'+key);
  this.yield=form.elements.namedItem('servings');this.name=form.elements.namedItem('serving');this.basis=form.elements.namedItem('servingBasis');this.mode=this.basis.value||'batch';
  root.classList.add('mrs');root.querySelector('h3').textContent=this.m('servingSizes');
  this.instructions=document.createElement('p');this.instructions.dataset.mrsInstructions='';root.querySelector('h3').after(this.instructions);
  const toggle=document.createElement('label');toggle.className='mrs-toggle';toggle.innerHTML=`${e(this.m('advancedServings'))}<input type="checkbox" data-mrs-advanced role="switch" ${editor.rows.length?'checked':''}>`;this.instructions.after(toggle);this.toggle=toggle.querySelector('input');
  this.table=document.createElement('section');this.table.className='mrs-table';this.table.innerHTML=`<div class="mrs-tabs" role="group" aria-label="${e(this.m('servingBasis'))}">${['batch','weight','volume'].map(mode=>`<button type="button" data-mrs-mode="${mode}">${e(this.m(mode+'Based'))}</button>`).join('')}</div><div class="mrs-columns"><span data-mrs-count>#</span><span>${e(this.m('servingName'))}</span><span data-mrs-caption></span><span></span></div><div class="mrs-builtins" data-mrs-builtins></div><div class="mrs-base"><span data-mrs-count>1</span><div data-mrs-name></div><div data-mrs-amount></div><span></span></div><p data-mrs-error role="alert" hidden></p>`;
  toggle.after(this.table);
  const builtins=this.table.querySelector('[data-mrs-builtins]');
  const fixedRow=`<div class="mrs-fixed"><span data-mrs-count>1</span><span data-mrs-label></span><span data-mrs-value></span><button type="button" data-mce-help="servings" aria-label="${e(this.m('servingHelp'))}"><span aria-hidden="true">?</span></button></div>`;
  builtins.innerHTML=fixedRow.repeat(2);
  [this.fullRecipe,this.unitRow]=builtins.children;
  this.fullRecipe.querySelector('[data-mrs-label]').textContent=this.m('fullRecipe');
  this.unitRow.querySelector('[data-mrs-value]').textContent='1';
  for(const [input,target]of [[this.name,'[data-mrs-name]'],[this.yield,'[data-mrs-amount]']]){const label=input.closest('label');this.table.querySelector(target).append(input);label.remove();}
  this.name.setAttribute('aria-label',this.m('servingName'));this.yield.setAttribute('aria-label',this.m('perRecipe'));
  this.amount=document.createElement('input');Object.assign(this.amount,{type:'number',min:'0.000001',max:'10000000',step:'any'});this.amount.dataset.mrsBaseValue='';this.table.querySelector('[data-mrs-amount]').append(this.amount);
  this.table.append(editor.root);editor.root.classList.add('mrs-portions');editor.root.querySelector('h3').hidden=true;editor.root.querySelector('[data-recipe-portion-add]').textContent='+ '+this.m('addServing');
  const signal=this.abort.signal;
  root.addEventListener('click',event=>{const button=event.target.closest('[data-mrs-mode]');if(button){this.mode=button.dataset.mrsMode;this.basis.value=this.mode;this.refresh();form.dispatchEvent(new Event('input',{bubbles:true}));}},{signal});
  this.toggle.addEventListener('change',()=>this.refresh(),{signal});
  this.amount.addEventListener('input',()=>this.applyMeasuredYield(),{signal});this.yield.addEventListener('input',()=>this.refreshBuiltins(),{signal});
  form.elements.namedItem('batchVolumeMl').addEventListener('change',()=>this.refresh(),{signal});
  editor.root.addEventListener('click',event=>{
   if(!event.target.closest('[data-recipe-portion-add]'))return;
   event.preventDefault();event.stopImmediatePropagation();if(editor.rows.length>=1000)return;
   const field=this.mode==='batch'?'portionsPerBatch':this.mode==='weight'?'grams':'milliliters',value=this.mode==='batch'?1:(this.total()??1)/Number(this.yield.value);
   const element=editor.append({id:crypto.randomUUID(),label:'',basis:this.mode,[field]:value});editor.sync();this.refreshRows();element.querySelector('[data-recipe-portion-label]').focus();
  },{capture:true,signal});
  editor.root.addEventListener('click',()=>this.refreshRows(),{signal});this.refresh();
 }
 total(){if(this.mode==='volume'){const value=Number(this.form.elements.namedItem('batchVolumeMl').value);return value>0?value:null;}return this.facts()?.weight?.grams??null;}
 missingMeasure(){return this.m(this.mode==='volume'?'missingBatchVolume':'missingBatchWeight');}
 applyMeasuredYield(){
  const total=this.total(),amount=Number(this.amount.value),yieldValue=total!==null&&amount>0?total/amount:null;
  const valid=yieldValue!==null&&yieldValue>=Number(this.yield.min)&&yieldValue<=Number(this.yield.max);
  this.amount.setCustomValidity(valid?'':total===null?this.missingMeasure():this.m('invalidServing'));
  if(valid){this.yield.value=String(yieldValue);this.yield.dispatchEvent(new Event('input',{bubbles:true}));}
 }
 refreshBuiltins(){
  const total=this.mode==='batch'?1:this.total(),number=value=>value===null?'—':value.toLocaleString(this.language,{maximumFractionDigits:3});
  this.fullRecipe.querySelector('[data-mrs-value]').textContent=number(total);
  this.unitRow.hidden=this.mode==='batch';
  this.unitRow.querySelector('[data-mrs-label]').textContent=this.mode==='volume'?'mL':'g';
 }
 refreshRows(){
  for(const {element}of this.editor.rows){
   const basis=element.querySelector('[data-recipe-portion-basis]');element.hidden=basis.value!==this.mode;basis.closest('label').hidden=true;
   element.querySelector('[data-recipe-portion-count]').setAttribute('aria-label',this.m('definitionCount'));
   element.querySelector('[data-recipe-portion-label]').setAttribute('aria-label',this.m('servingName'));
   element.querySelector('[data-recipe-portion-value]').setAttribute('aria-label',this.m(this.mode==='batch'?'perRecipe':this.mode==='weight'?'gramsPerServing':'mlPerServing'));
   const remove=element.querySelector('[data-recipe-portion-remove]');remove.setAttribute('aria-label',this.editor.message('removePortion'));remove.textContent='×';
  }
 }
 refresh(){
  this.instructions.textContent=this.m(this.mode+'Instructions');
  const advanced=this.toggle.checked;this.table.classList.toggle('mrs-advanced',advanced);this.editor.root.hidden=!advanced;this.table.querySelector('[data-mrs-builtins]').hidden=!advanced;
  for(const button of this.table.querySelectorAll('[data-mrs-mode]')){button.setAttribute('aria-pressed',String(button.dataset.mrsMode===this.mode));button.hidden=button.dataset.mrsMode==='volume'&&this.mode!=='volume'&&!this.form.elements.namedItem('batchVolumeMl').value;}
  const caption=this.m(this.mode==='batch'?'perRecipe':this.mode==='weight'?'gramsPerServing':'mlPerServing');this.table.querySelector('[data-mrs-caption]').textContent=caption;this.amount.setAttribute('aria-label',caption);
  this.yield.hidden=this.mode!=='batch';this.amount.hidden=this.mode==='batch';this.amount.required=this.mode!=='batch';this.amount.setCustomValidity('');
  const total=this.mode==='batch'?null:this.total();this.amount.value=total===null?'':String(total/Number(this.yield.value));
  const error=this.table.querySelector('[data-mrs-error]');error.hidden=this.mode==='batch'||total!==null;error.textContent=this.missingMeasure();
  this.refreshBuiltins();this.refreshRows();
 }
 reveal(input){const row=input.closest('[data-recipe-portion-row]');if(row){this.mode=row.querySelector('[data-recipe-portion-basis]').value;this.basis.value=this.mode;this.toggle.checked=true;this.refresh();}}
 dispose(){this.abort.abort();}
}
