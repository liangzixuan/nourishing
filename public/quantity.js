import {escape as e} from './html.js';
import {t} from './app-language.js';
export const quantityFields=(options,item={})=>{
 const unit=item.quantity===undefined?'servings':item.unit==='portion'?'portion:'+item.portionId:item.unit;
 return `<label class="field-row"><span>${e(t('mobileFood.amount'))}</span><input name="amount" type="number" step="any" required value="${e(item.quantity??item.amount??1)}"></label><label class="field-row"><span>${e(t('mobileCompositeEditor.defaultServing'))}</span><select name="unit" aria-label="${e(t('mobileCompositeEditor.defaultServing'))}">${options.map(([id,label])=>`<option value="${e(id)}" ${id===unit?'selected':''}>${e(label)}</option>`).join('')}</select></label>`;
};
export function quantityValue(form){const v=Object.fromEntries(new FormData(form));return v.unit==='servings'?{amount:Number(v.amount)}:{quantity:Number(v.amount),unit:v.unit.startsWith('portion:')?'portion':v.unit,...(v.unit.startsWith('portion:')?{portionId:v.unit.slice(8)}:{})};}
