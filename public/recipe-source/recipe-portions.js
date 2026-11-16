import {formatMessage} from '../report-source/public/message-format.js';
import {uiLanguage} from './ui-language.js';
import {parseRecipePortions} from '../report-source/server/recipe-portion-schema.mjs';
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export class RecipePortionsEditor{
 constructor({root,portions=[],onChange=()=>{},language=uiLanguage()}){
  this.language=language;this.message=(key,values)=>formatMessage(language,'recipeEditor.'+key,values);this.root=root;this.rows=[];this.onChange=onChange;this.disposed=false;
  root.innerHTML=`<section class="food-portions-editor"><div class="food-portions-heading"><h3>${escape(this.message('portions'))}</h3><button type="button" class="btn subtle" data-recipe-portion-add>${escape(this.message('addPortion'))}</button></div><p class="mini-note">${escape(this.message('portionsHelp'))}</p><div data-recipe-portion-list></div></section>`;this.list=root.querySelector('[data-recipe-portion-list]');
  this.click=event=>{if(event.target.closest('[data-recipe-portion-add]')){event.preventDefault();if(this.rows.length>=1000)return;this.append({id:crypto.randomUUID(),label:'',basis:'batch',portionsPerBatch:1}).querySelector('[data-recipe-portion-label]').focus();this.sync();}const remove=event.target.closest('[data-recipe-portion-remove]');if(remove){event.preventDefault();const index=this.rows.findIndex(row=>row.element.contains(remove));if(index>=0){this.rows[index].element.remove();this.rows.splice(index,1);this.sync();}}};
  this.change=event=>{if(event.target.matches('[data-recipe-portion-basis]'))this.basis(event.target.closest('[data-recipe-portion-row]'));this.onChange();};root.addEventListener('click',this.click);root.addEventListener('change',this.change);
  for(const portion of this.parse(portions))this.append(portion);this.sync();
 }
 append(portion){
  const element=this.root.ownerDocument.createElement('div');element.className='food-portion-row recipe-portion-row';element.dataset.recipePortionRow='';
  const label=(className,caption,control)=>'<label class="'+className+'"><span>'+escape(caption)+'</span>'+control+'</label>';
  element.innerHTML=label('recipe-portion-count',formatMessage(this.language,'mobileCompositeEditor.definitionCount'),'<input data-recipe-portion-count type="number" value="'+escape(portion.quantity??1)+'" required min="0.000001" max="100000" step="any">')
   +label('recipe-portion-name',this.message('portionLabel'),'<input data-recipe-portion-label value="'+escape(portion.label)+'" maxlength="500" required placeholder="'+escape(this.message('portionExample'))+'">')
   +label('recipe-portion-basis',this.message('portionBasis'),'<select data-recipe-portion-basis>'+['batch','weight','volume'].map(basis=>'<option value="'+basis+'"'+(portion.basis===basis?' selected':'')+'>'+escape(this.message('basis.'+basis))+'</option>').join('')+'</select>')
   +'<label class="recipe-portion-value"><span data-recipe-portion-caption></span><input data-recipe-portion-value type="number" value="'+escape(portion.basis==='batch'?portion.portionsPerBatch:portion.basis==='volume'?portion.milliliters:portion.grams)+'" required min="0.000001" step="any"></label>'
   +'<button type="button" class="btn subtle" data-recipe-portion-remove>'+escape(this.message('removePortion'))+'</button>';
  this.rows.push({id:portion.id,element,quantitySpecified:portion.quantity!==undefined});this.list.append(element);this.basis(element);return element;
 }

 basis(element){const basis=element.querySelector('[data-recipe-portion-basis]').value,batch=basis==='batch';element.querySelector('[data-recipe-portion-caption]').textContent=this.message('caption.'+basis);element.querySelector('[data-recipe-portion-value]').max=batch?'100000':'10000000';}
 sync(){this.root.querySelector('[data-recipe-portion-add]').disabled=this.rows.length>=1000;this.onChange();}
 read(){if(this.disposed)throw Error(this.message('reopenPortions'));return this.parse(this.rows.map(({id,element,quantitySpecified})=>{const quantity=Number(element.querySelector('[data-recipe-portion-count]').value);const basis=element.querySelector('[data-recipe-portion-basis]').value;return {id,label:element.querySelector('[data-recipe-portion-label]').value,basis,...(quantitySpecified||quantity!==1?{quantity}:{}),[basis==='batch'?'portionsPerBatch':basis==='volume'?'milliliters':'grams']:Number(element.querySelector('[data-recipe-portion-value]').value)};}));}
 parse(value){try{return parseRecipePortions(value);}catch(error){if(!['limit','object','identity','label','basis','fields','range'].includes(error.recipePortionCode))throw error;const details=error.recipePortionDetails??{},field={portionsPerBatch:'batch',grams:'weight',milliliters:'volume'}[details.field];throw Object.assign(Error(this.message('portion.'+error.recipePortionCode,{field:field?this.message('caption.'+field):details.field,min:(0.000001).toLocaleString(this.language,{maximumFractionDigits:6}),max:details.max?.toLocaleString(this.language)})),{status:error.status,recipePortionCode:error.recipePortionCode,recipePortionDetails:details});}}
 dispose(){this.disposed=true;this.root.removeEventListener('click',this.click);this.root.removeEventListener('change',this.change);}
}
